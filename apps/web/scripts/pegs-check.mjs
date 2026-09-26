/**
 * Drives the tuning pegs with a real mouse (and real touch events) in headless Chrome.
 * Usage: URL=http://localhost:5199/?debug node scripts/pegs-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 800 },
  acceptDownloads: true,
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
const state = () =>
  page.evaluate(() => {
    const s = window.__fluidfrets.store.getState();
    return { tuning: s.tuning, live: s.liveTuning, saved: s.savedTunings };
  });
const peg = (i) => page.locator(`[data-peg="${i}"]`);
const tuningSelect = page.locator('label.field:has(span:text-is("Tuning")) select');
const sleep = (ms) => page.waitForTimeout(ms);

async function pegCentre(i) {
  const b = await peg(i).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
/** Mouse drag; positive `semis` drags up (raises pitch). */
async function drag(i, semis, { steps = 10, pause = 0, release = true, during } = {}) {
  const { x, y } = await pegCentre(i);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let s = 1; s <= steps; s++) {
    await page.mouse.move(x, y - (semis * 24 * s) / steps);
    if (pause) await sleep(pause);
    if (during) await during(s, steps);
  }
  if (release) {
    await page.mouse.up();
    await sleep(250);
  }
}
const autoPitch = (expected) =>
  page.evaluate((expectedHz) => {
    const e = window.__fluidfrets.audioEngine;
    const x = e.getOutputSnapshot();
    const sr = e.context.sampleRate;
    const p = sr / expectedHz;
    let best = 0,
      bestV = -Infinity;
    const vals = {};
    const N = x.length - Math.ceil(p * 1.15) - 2;
    for (let lag = Math.floor(p * 0.85) - 1; lag <= Math.ceil(p * 1.15) + 1; lag++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += x[i] * x[i + lag];
      vals[lag] = s;
      if (s > bestV) {
        bestV = s;
        best = lag;
      }
    }
    const a = vals[best - 1],
      b = vals[best],
      c = vals[best + 1];
    return {
      hz: sr / (best + (0.5 * (a - c)) / (a - 2 * b + c)),
      peak: x.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
    };
  }, expected);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// ---------------------------------------------------------------- setup / a11y
await page.locator('[data-string="5"][data-fret="0"]').click(); // unlock audio
await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running');
await sleep(300);

check(
  'pegs are labelled "String N tuning, note"',
  (await peg(1).getAttribute('aria-label')) === 'String 5 tuning, A2' &&
    (await peg(0).getAttribute('aria-label')) === 'String 6 tuning, E2' &&
    (await peg(5).getAttribute('aria-label')) === 'String 1 tuning, E4',
);
check(
  'pegs are focusable sliders',
  (await peg(1).getAttribute('role')) === 'slider' &&
    (await peg(1).getAttribute('tabindex')) === '0',
);

// ---------------------------------------------------------------- drag A → F♯ with audible glide
let midPitch = null,
  midLive = null;
await drag(1, -3, {
  steps: 24,
  pause: 40,
  during: async (s, steps) => {
    if (s === 12) {
      midLive = (await state()).live[1];
      midPitch = await autoPitch(hz(midLive));
    }
  },
});
let st = await state();
check(
  'press plucks the string (audio sounds during the drag)',
  midPitch && midPitch.peak > 0.01,
  `peak ${midPitch?.peak.toFixed(3)}`,
);
check(
  'mid-drag: live pitch is fractional (labels between frets)',
  Number.isFinite(midLive) && Math.abs(midLive - Math.round(midLive)) > 0.05,
  `live ${midLive?.toFixed(2)}`,
);
check(
  'mid-drag: the ringing note glides to the live pitch (no re-pluck)',
  midPitch && Math.abs(1200 * Math.log2(midPitch.hz / hz(midLive))) < 35,
  `${midPitch?.hz.toFixed(1)} Hz vs ${hz(midLive).toFixed(1)} Hz`,
);
check(
  'release lands exactly on a semitone (A2 → F♯2)',
  st.live[1] === 42 && st.tuning.strings[1] === 42,
  `live ${st.live[1]}, committed ${st.tuning.strings[1]}`,
);
check('dropdown switches to Custom', (await tuningSelect.inputValue()) === 'custom');
check(
  'other pegs untouched',
  st.tuning.strings.filter((_, i) => i !== 1).join() === '40,50,55,59,64',
);
const ringAfter = await autoPitch(hz(42));
check(
  'note ends at F♯2 (92.5 Hz) after the snap',
  Math.abs(1200 * Math.log2(ringAfter.hz / hz(42))) < 35 || ringAfter.peak < 0.005,
  `${ringAfter.hz.toFixed(1)} Hz`,
);

// Labels settle exactly into fret centres.
const geom = await page.evaluate(() => {
  const xOf = (string, fret) => {
    const g = document.querySelector(`[data-string="${string}"][data-fret="${fret}"] circle`);
    return g ? +g.getAttribute('cx') : null;
  };
  const all = [...document.querySelectorAll('[data-string="1"]')].map((g) => +g.dataset.fret);
  return { open1: xOf(1, 0), open0: xOf(0, 0), f5: [xOf(1, 5), xOf(0, 5)], frets: all.length };
});
check(
  'after release every marker sits exactly on its fret (same x on all strings)',
  geom.open1 === geom.open0 && geom.f5[0] === geom.f5[1] && geom.frets === 23,
  JSON.stringify(geom),
);
check(
  'F♯ is the open note on that string',
  (await page.locator('[data-string="1"][data-fret="0"]').getAttribute('data-midi')) === '42',
);

// ---------------------------------------------------------------- preset detection
await drag(1, +3); // back to A2
check(
  'returning to standard re-selects "Standard"',
  (await tuningSelect.inputValue()) === 'standard',
);
await drag(0, -2); // E2 → D2
check(
  'E→D on the low string selects "Drop D"',
  (await tuningSelect.inputValue()) === 'drop-d' && (await state()).tuning.name === 'Drop D',
);
await tuningSelect.selectOption('standard');
await sleep(500);

// ---------------------------------------------------------------- range limits
await drag(0, -20);
st = await state();
check(
  'limit: 7 semitones down (E2 → A1)',
  st.tuning.strings[0] === 33 && st.live[0] === 33,
  `got ${st.tuning.strings[0]}`,
);
await drag(0, +30);
st = await state();
check(
  'limit: 5 semitones up from standard (E2 → A2)',
  st.tuning.strings[0] === 45,
  `got ${st.tuning.strings[0]}`,
);
// Rubber band: while dragging way past the limit the live value stays within 0.5 of it.
let over = 0;
await drag(1, +12, {
  release: false,
  steps: 6,
  during: async () => {
    over = Math.max(over, (await state()).live[1] - 50);
  },
});
await page.mouse.up();
await sleep(250);
check(
  'rubber band: overshoot past the limit never exceeds half a semitone',
  over > 0 && over <= 0.5001,
  `max overshoot ${over.toFixed(3)}`,
);
check('…and it lands on the limit (A2 + 5 = D3)', (await state()).tuning.strings[1] === 50);
await tuningSelect.selectOption('standard');
await sleep(500);

// ---------------------------------------------------------------- unlimited range
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByLabel(/Unlimited tuning range/).check();
await page.getByRole('button', { name: 'Done' }).click();
await drag(0, +12);
check(
  '"Unlimited range" lifts the limit (E2 + 12 = E3)',
  (await state()).tuning.strings[0] === 52,
  `got ${(await state()).tuning.strings[0]}`,
);
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByLabel(/Unlimited tuning range/).uncheck();
await page.getByRole('button', { name: 'Done' }).click();
await tuningSelect.selectOption('nashville');
await sleep(600);
const before = (await state()).tuning.strings[0];
await drag(0, 0.1, { steps: 2 });
check(
  'grabbing a peg on a preset outside the limits does not snap it back',
  (await state()).tuning.strings[0] === before && before === 52,
  `low string ${before}`,
);
await tuningSelect.selectOption('standard');
await sleep(600);

// ---------------------------------------------------------------- wheel + keyboard
const { x: wx, y: wy } = await pegCentre(2);
await page.mouse.move(wx, wy);
await page.mouse.wheel(0, -100);
await sleep(300);
check('wheel up = +1 semitone (D3 → D♯3)', (await state()).tuning.strings[2] === 51);
check('wheel step plucks the string', (await autoPitch(hz(51))).peak > 0.01);
await page.mouse.wheel(0, 100);
await sleep(300);
check('wheel down = −1 semitone', (await state()).tuning.strings[2] === 50);
const scrollBefore = await page.evaluate(() => window.scrollY);
await page.mouse.wheel(0, 100);
await sleep(200);
check(
  'wheel over a peg does not scroll the page',
  (await page.evaluate(() => window.scrollY)) === scrollBefore,
);
await peg(3).focus();
await page.keyboard.press('ArrowUp');
await sleep(250);
await page.keyboard.press('ArrowUp');
await sleep(250);
check('keyboard: ↑↑ raises G3 by two semitones', (await state()).tuning.strings[3] === 57);
await page.keyboard.press('ArrowDown');
await sleep(250);
check('keyboard: ↓ lowers by one', (await state()).tuning.strings[3] === 56);
check(
  'aria-label follows the value',
  (await peg(3).getAttribute('aria-label')) === 'String 3 tuning, G♯3'.replace('G♯3', 'G♯3'),
);
await tuningSelect.selectOption('standard');
await sleep(600);

// ---------------------------------------------------------------- preset transition animation
const trace = await page.evaluate(async () => {
  const sel = [...document.querySelectorAll('label.field')]
    .find((l) => l.textContent.startsWith('Tuning'))
    .querySelector('select');
  const store = window.__fluidfrets.store;
  const values = [];
  const t0 = performance.now();
  sel.value = 'open-g';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((resolve) => {
    const tick = () => {
      values.push(store.getState().liveTuning[1]);
      if (performance.now() - t0 < 500) requestAnimationFrame(tick);
      else resolve();
    };
    tick();
  });
  return { values, final: store.getState().liveTuning, committed: store.getState().tuning.strings };
});
const mids = trace.values.filter((v) => v !== 45 && v !== 43);
check(
  'choosing a preset slides the labels (fractional in-between values)',
  mids.length >= 5 && mids.every((v) => v > 43 && v < 45),
  `${mids.length} intermediate frames`,
);
check(
  '…and lands exactly on the new tuning',
  trace.final.join() === trace.committed.join() && trace.committed.join() === '38,43,50,55,59,62',
  trace.final.join(),
);
check(
  'slide is monotonic (no overshoot / jitter)',
  trace.values.every((v, i) => i === 0 || v <= trace.values[i - 1] + 1e-9),
);

// ---------------------------------------------------------------- strum on tuning change
await page.evaluate(() => {
  const e = window.__fluidfrets.audioEngine;
  window.__strums = 0;
  const orig = e.pluckMany.bind(e);
  e.pluckMany = (...a) => {
    window.__strums++;
    return orig(...a);
  };
});
await tuningSelect.selectOption('dadgad');
await sleep(600);
check(
  'picking a tuning strums the new open strings once',
  (await page.evaluate(() => window.__strums)) === 1,
);
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByLabel(/Strum the open strings/).uncheck();
await page.getByRole('button', { name: 'Done' }).click();
await tuningSelect.selectOption('standard');
await sleep(600);
check('…and not when that setting is off', (await page.evaluate(() => window.__strums)) === 1);
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByLabel(/Strum the open strings/).check();
await page.getByRole('button', { name: 'Done' }).click();

// ---------------------------------------------------------------- only the dragged string re-renders
const mutations = await page.evaluate(async () => {
  const markers = document.querySelector('.markers');
  const counts = new Array(6).fill(0);
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      const group = [...markers.children].findIndex((c) => c.contains(r.target));
      if (group >= 0) counts[group]++;
    }
  });
  obs.observe(markers, { subtree: true, attributes: true, childList: true, characterData: true });
  window.__obs = { obs, counts };
  return true;
});
await drag(4, -2, { steps: 20, pause: 16 });
const counts = await page.evaluate(() => {
  window.__obs.obs.disconnect();
  return window.__obs.counts;
});
check(
  "perf: a peg drag only touches the dragged string's markers",
  counts[4] > 100 && counts.filter((_, i) => i !== 4).every((c) => c === 0),
  JSON.stringify(counts),
);
await tuningSelect.selectOption('standard');
await sleep(600);

// ---------------------------------------------------------------- frame times during a fast drag
const frames = await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  let run = true;
  const tick = (t) => {
    window.__frames.push(t - last);
    last = t;
    if (run) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__stopFrames = () => {
    run = false;
  };
});
await drag(2, +3, { steps: 60, pause: 0 });
const ft = await page.evaluate(() => {
  window.__stopFrames();
  return window.__frames;
});
const sorted = [...ft].sort((a, b) => a - b);
check(
  'perf: no dropped frames during a fast drag (p95 < 20 ms)',
  sorted[Math.floor(sorted.length * 0.95)] < 20,
  `p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)} ms, max ${sorted.at(-1).toFixed(1)} ms over ${ft.length} frames`,
);
await tuningSelect.selectOption('standard');
await sleep(600);

// ---------------------------------------------------------------- touch drag
const cdp = await context.newCDPSession(page);
const { x: tx, y: ty } = await pegCentre(1);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
for (let s = 1; s <= 10; s++) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: tx, y: ty + (2 * 24 * s) / 10 }],
  });
  await sleep(20);
}
const touchLive = (await state()).live[1];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
check(
  'touch: dragging down 2 semitones bends the string mid-gesture',
  Math.abs(touchLive - 43.1) < 1.2 && touchLive < 45,
  `live ${touchLive.toFixed(2)}`,
);
check('touch: release snaps to A2 → G2', (await state()).tuning.strings[1] === 43);
await tuningSelect.selectOption('standard');
await sleep(600);

// ---------------------------------------------------------------- saving, persistence
await drag(1, -2); // → G2, Custom
await page.getByRole('button', { name: 'Save tuning' }).click();
const nameInput = page.getByLabel('Name');
const suggested = await nameInput.inputValue();
check('save dialog pre-fills the note names', suggested === 'E G D G B E', suggested);
await nameInput.fill('My test tuning');
await page.getByRole('button', { name: 'Save', exact: true }).click();
check(
  'saved tuning is selected and listed under "My tunings"',
  (await tuningSelect.inputValue()).startsWith('user-') &&
    (await page.locator('optgroup[label="My tunings"] option').count()) === 1,
);
// Duplicate name → explicit overwrite confirmation.
await page.getByRole('button', { name: 'Save tuning' }).click();
await page.getByLabel('Name').fill('my TEST tuning');
await page.getByRole('button', { name: 'Save', exact: true }).click();
check(
  'duplicate name asks before overwriting',
  (await page.getByRole('button', { name: 'Overwrite' }).isVisible()) &&
    (await page.getByText(/already exists/).isVisible()),
);
await page.getByRole('button', { name: 'Cancel' }).click();
check('cancelling keeps a single saved tuning', (await state()).saved.length === 1);

await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
const reloaded = await state();
check(
  'saved tuning and current tuning survive a reload',
  reloaded.saved.length === 1 &&
    reloaded.saved[0].name === 'My test tuning' &&
    reloaded.tuning.strings[1] === 43 &&
    reloaded.live.join() === reloaded.tuning.strings.join(),
);
check(
  'after reload it is listed and selected, with pegs showing G2',
  (await tuningSelect.inputValue()) === reloaded.saved[0].id &&
    (await peg(1).getAttribute('aria-label')) === 'String 5 tuning, G2',
);

// ---------------------------------------------------------------- manage: rename, export, import, delete
await page.getByRole('button', { name: 'Settings' }).click();
const renameBox = page.getByLabel('Rename My test tuning');
await renameBox.fill('Renamed');
await renameBox.press('Enter');
check('rename works', (await state()).saved[0].name === 'Renamed');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Export JSON' }).click(),
]);
const exported = JSON.parse(
  await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
);
check(
  'export downloads JSON with the saved tunings',
  download.suggestedFilename() === 'fluid-frets-tunings.json' &&
    exported.tunings?.length === 1 &&
    exported.tunings[0].name === 'Renamed',
  JSON.stringify(exported.tunings?.[0]),
);
await page.getByLabel('Import tunings file').setInputFiles({
  name: 'in.json',
  mimeType: 'application/json',
  buffer: Buffer.from(
    JSON.stringify({
      tunings: [
        { name: 'Imported A', strings: [38, 45, 50, 55, 59, 62] },
        { name: 'bad', strings: [1] },
        { name: 'Renamed', strings: exported.tunings[0].strings },
      ],
    }),
  ),
});
await sleep(300);
const afterImport = (await state()).saved.map((t) => t.name);
check(
  'import adds valid entries, skips duplicates, reports bad ones',
  afterImport.join('|') === 'Renamed|Imported A' &&
    (await page.getByText(/Imported 1, 1 already saved/).isVisible()),
  afterImport.join('|'),
);
await page.getByRole('button', { name: 'Delete Renamed' }).click();
check(
  'deleting the selected tuning turns the current one into Custom (strings kept)',
  (await state()).saved.length === 1 &&
    (await state()).tuning.id === 'custom' &&
    (await state()).tuning.strings[1] === 43,
);
await page.getByRole('button', { name: 'Done' }).click();

// ---------------------------------------------------------------- left-handed mirror still works
await page.getByLabel('Left-handed').check();
const box = await peg(1).boundingBox();
const svg = await page.locator('.fretboard-svg').boundingBox();
check(
  'left-handed: pegs move to the right-hand headstock',
  box.x > svg.x + svg.width * 0.8,
  `peg x ${box.x.toFixed(0)} of ${svg.width.toFixed(0)}`,
);
await drag(1, +1);
check('left-handed: dragging still works', (await state()).tuning.strings[1] === 44);

check('no console/page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
