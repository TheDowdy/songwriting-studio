/**
 * Drives strumming with a real mouse and real touch events in headless Chrome, recording every
 * pluck the app makes. Usage: URL=http://localhost:5199/?debug node scripts/strum-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 800 },
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);

// Record every pluck the app makes, without changing what it does.
await page.evaluate(() => {
  const engine = window.__fluidfrets.audioEngine;
  window.__plucks = [];
  const real = engine.pluck.bind(engine);
  engine.pluck = (string, midi, opts) => {
    window.__plucks.push({ string, midi, ...opts, at: performance.now() });
    return real(string, midi, opts);
  };
  window.__fluidfrets.store.getState().setStrumOnTuningChange(false);
});
const plucks = () => page.evaluate(() => window.__plucks);
const reset = async () => {
  await sleep(700); // let wobbles and ringing settle
  await page.evaluate(() => (window.__plucks = []));
};
const marker = (string, fret) => page.locator(`[data-string="${string}"][data-fret="${fret}"]`);
const strings = (ps) => ps.map((p) => p.string);

/** Client-pixel y of each string and the horizontal extent of the neck. */
const board = () =>
  page.evaluate(() => {
    const svg = document.querySelector('.fretboard-svg');
    const ctm = svg.getScreenCTM();
    const stringGap = 36;
    const edge = 22;
    const ys = Array.from({ length: 6 }, (_, i) => ctm.d * (edge + (5 - i) * stringGap) + ctm.f);
    return { ys, xs: [ctm.a * 400 + ctm.e, ctm.a * 700 + ctm.e], gap: ctm.d * stringGap };
  });

/** Mouse drag from y0 to y1 at x, in `steps` moves `stepMs` apart. */
async function mouseDrag(x, y0, y1, { steps = 14, stepMs = 4 } = {}) {
  await page.mouse.move(x, y0);
  await page.mouse.down();
  for (let s = 1; s <= steps; s++) {
    await page.mouse.move(x, y0 + ((y1 - y0) * s) / steps);
    await sleep(stepMs);
  }
  await page.mouse.up();
}

// Unlock audio with a first tap and wait until it runs.
await marker(1, 0).click();
await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running', null, {
  timeout: 5000,
});
await reset();
const b = await board();
const x = b.xs[0];
const below = b.ys[0] + b.gap * 0.6;
const above = b.ys[5] - b.gap * 0.6;

// ---------------------------------------------------------------- tap vs strum
await marker(2, 5).click();
let p = await plucks();
check(
  'tap: clicking a marker plucks it exactly once',
  p.length === 1 && p[0].string === 2 && p[0].midi === 55,
  JSON.stringify(strings(p)),
);
await reset();

await marker(3, 7).hover();
await page.mouse.down();
await page.mouse.move(
  (await marker(3, 7).boundingBox()).x + 20,
  (await marker(3, 7).boundingBox()).y + 22,
  { steps: 3 },
);
await page.mouse.up();
p = await plucks();
check(
  'tap: a 3 px wobble under the 8 px threshold is still a tap',
  p.length === 1,
  JSON.stringify(strings(p)),
);
await reset();

{
  const box = await marker(2, 5).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await sleep(250);
  const mid = (await plucks()).length;
  await page.mouse.up();
  const end = (await plucks()).length;
  check(
    'tap: a held press sounds once while held, and not again on release',
    mid === 1 && end === 1,
    `${mid} then ${end}`,
  );
  await reset();
}

// ---------------------------------------------------------------- mouse strums
await mouseDrag(x, below, above);
p = await plucks();
check(
  'mouse: fast drag up the screen sounds strings 6→1 low → high',
  JSON.stringify(strings(p)) === '[0,1,2,3,4,5]',
  JSON.stringify(strings(p)),
);
check('mouse: it is a downstroke (no extra tap note, exactly six plucks)', p.length === 6);
const downPeak = await page.evaluate(() => window.__fluidfrets.audioEngine.getOutputPeak());
check('mouse: the strum is audible', downPeak > 0.02, `peak ${downPeak.toFixed(3)}`);
const down = p;
await reset();

await mouseDrag(x, above, below);
p = await plucks();
check(
  'mouse: fast drag down the screen sounds strings 1→6 high → low',
  JSON.stringify(strings(p)) === '[5,4,3,2,1,0]',
  JSON.stringify(strings(p)),
);
check(
  'mouse: upstroke is lighter and brighter than the downstroke',
  p.every((n) => n.brightness > 0) &&
    down.every((n) => !n.brightness) &&
    p[2].velocity < down[2].velocity,
  `up v=${p[2].velocity.toFixed(2)} b=${p[2].brightness}, down v=${down[2].velocity.toFixed(2)}`,
);
await reset();

await mouseDrag(x, below, above, { steps: 8, stepMs: 90 });
p = await plucks();
await reset();
await mouseDrag(x, below, above, { steps: 14, stepMs: 3 });
const fast = await plucks();
check(
  'velocity: a fast strum is louder than a slow one',
  fast[3].velocity > p[3].velocity + 0.15,
  `slow ${p[3].velocity.toFixed(2)}, fast ${fast[3].velocity.toFixed(2)}`,
);
const gaps = fast.slice(1).map((n, i) => n.at - fast[i].at);
check(
  'timing: strum speed is drag speed (notes are spread over the drag, not fired together)',
  fast.at(-1).at - fast[0].at > 15,
  `${(fast.at(-1).at - fast[0].at).toFixed(0)} ms for six strings`,
);
await reset();

// A drag that starts on a marker must not also fire that marker as a tap.
{
  const box = await marker(1, 3).boundingBox();
  const mx = box.x + box.width / 2;
  // Start a few pixels past the string's line, in the direction of the drag, so that string isn't crossed.
  const my = box.y + box.height / 2 - 5;
  await mouseDrag(mx, my, b.ys[4] - b.gap * 0.6, { steps: 8, stepMs: 8 });
  p = await plucks();
  check(
    'strum starting on a marker: only the crossed strings sound, no tap',
    JSON.stringify(strings(p)) === '[2,3,4]',
    JSON.stringify(strings(p)),
  );
  await reset();
}

// Drag across a single string, and a horizontal slide.
await mouseDrag(x, b.ys[2] + b.gap * 0.5, b.ys[2] - b.gap * 0.5, { steps: 6, stepMs: 8 });
p = await plucks();
check(
  'a drag across one string sounds just that string',
  JSON.stringify(strings(p)) === '[2]',
  JSON.stringify(strings(p)),
);
await reset();
{
  await page.mouse.move(x, b.ys[2] + 4);
  await page.mouse.down();
  await page.mouse.move(x + 200, b.ys[2] + 4, { steps: 10 });
  await page.mouse.up();
  p = await plucks();
  check(
    'a horizontal slide along a string is silent (no tap, no strum)',
    p.length === 0,
    JSON.stringify(strings(p)),
  );
  await reset();
}

// ---------------------------------------------------------------- shapes and muting
await page.evaluate(() =>
  window.__fluidfrets.store.getState().setStrumShape([null, 3, 2, 0, 1, 0]),
);
await mouseDrag(x, below, above);
p = await plucks();
check(
  'shape: muted string 6 is silent, the others sound low → high',
  JSON.stringify(strings(p)) === '[1,2,3,4,5]',
  JSON.stringify(strings(p)),
);
check(
  'shape: sounded notes are the shape’s frets (C chord: 48 52 55 60 64)',
  JSON.stringify(p.map((n) => n.midi)) === '[48,52,55,60,64]',
  JSON.stringify(p.map((n) => n.midi)),
);
await reset();
await mouseDrag(x, above, below);
p = await plucks();
check(
  'shape: upstroke skips the muted string too',
  JSON.stringify(strings(p)) === '[5,4,3,2,1]',
  JSON.stringify(strings(p)),
);
await reset();
await page.evaluate(() =>
  window.__fluidfrets.store.getState().setStrumShape([null, null, null, null, null, null]),
);
await mouseDrag(x, below, above);
p = await plucks();
check('shape: all strings muted → total silence', p.length === 0);
await page.evaluate(() => window.__fluidfrets.store.getState().setStrumShape(null));
await reset();

// ---------------------------------------------------------------- other tunings and left hand
await page.evaluate(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] });
});
await mouseDrag(x, below, above);
p = await plucks();
check(
  'open strings strum uses the current tuning (Drop D → 38 45 50 55 59 64)',
  JSON.stringify(p.map((n) => n.midi)) === '[38,45,50,55,59,64]',
  JSON.stringify(p.map((n) => n.midi)),
);
await page.evaluate(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Standard', strings: [40, 45, 50, 55, 59, 64] });
  s.setLeftHanded(true);
});
await reset();
await mouseDrag(x, below, above);
p = await plucks();
check(
  'left-handed: strum order is unchanged',
  JSON.stringify(strings(p)) === '[0,1,2,3,4,5]',
  JSON.stringify(strings(p)),
);
await page.evaluate(() => window.__fluidfrets.store.getState().setLeftHanded(false));
await reset();

// ---------------------------------------------------------------- visual feedback
await mouseDrag(x, below, above);
await sleep(60);
const wobbling = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-wobble]')].filter((g) => g.style.display === '').length,
  );
const restShown = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-wobble]')].filter(
        (g) => g.previousElementSibling.style.display === 'none',
      ).length,
  );
const shown = await wobbling();
check(
  'feedback: all six plucked strings are swapped for a wobbling path',
  shown === 6 && (await restShown()) === 6,
  `${shown} wobbling`,
);
const pulsing = await page.evaluate(
  () =>
    [...document.querySelectorAll('[data-string][data-fret="0"] circle')].filter(
      (c) => c.getAnimations().length > 0,
    ).length,
);
check('feedback: the markers of the sounding notes pulse', pulsing >= 5, `${pulsing} pulsing`);
await sleep(3000);
const after = await wobbling();
check(
  'feedback: wobbles die away and the strings return to straight lines',
  after === 0 && (await restShown()) === 0,
  `${after} still wobbling`,
);
await reset();

// ---------------------------------------------------------------- touch
const cdp = await context.newCDPSession(page);
async function touchDrag(x0, y0, y1, steps = 14, stepMs = 5) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x0, y: y0 }],
  });
  for (let s = 1; s <= steps; s++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0, y: y0 + ((y1 - y0) * s) / steps }],
    });
    await sleep(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
await touchDrag(x, below, above);
p = await plucks();
check(
  'touch: drag up sounds strings low → high',
  JSON.stringify(strings(p)) === '[0,1,2,3,4,5]',
  JSON.stringify(strings(p)),
);
await reset();
await touchDrag(x, above, below);
p = await plucks();
check(
  'touch: drag down sounds strings high → low',
  JSON.stringify(strings(p)) === '[5,4,3,2,1,0]',
  JSON.stringify(strings(p)),
);
await reset();
{
  const box = await marker(4, 2).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  p = await plucks();
  check(
    'touch: a quick tap plucks the note once',
    p.length === 1 && p[0].string === 4 && p[0].midi === 61,
    JSON.stringify(p.map((n) => [n.string, n.midi])),
  );
}

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
