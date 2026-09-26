/**
 * Drives the guitar models in headless Chrome: every model at 18 and 24 frets, right- and
 * left-handed, must leave note markers and pegs exactly where they were and stay tappable; plus
 * customising, "match sound to guitar", fret defaults, legibility on a pale board, persistence.
 * Usage: URL=http://localhost:5199/?debug node scripts/guitars-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
const store = (fn, arg) => page.evaluate(fn, arg);
const state = () =>
  store(() => {
    const s = window.__fluidfrets.store.getState();
    return {
      model: s.guitarModel,
      sound: s.soundPreset,
      frets: s.fretCount,
      custom: s.customise,
      match: s.matchSound,
      touched: s.fretCountUserSet,
    };
  });
const MODELS = ['steel-acoustic', 'classical', 'double-cut', 'single-cut', 'hollow-body'];
const setModel = (id) => store((id) => window.__fluidfrets.store.getState().setGuitarModel(id), id);

await store(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));

// ---------------------------------------------------------------- the selector
const options = await page
  .locator('label.field:has(span:text-is("Guitar")) select option')
  .allTextContents();
check(
  'the toolbar has a Guitar selector with the five plan models',
  JSON.stringify(options) ===
    JSON.stringify([
      'Steel-string acoustic',
      'Classical (nylon)',
      'Solid-body electric, double cutaway',
      'Solid-body electric, single cutaway',
      'Hollow-body electric',
    ]),
  options.join(' | '),
);
check('it starts on the steel-string acoustic', (await state()).model === 'steel-acoustic');

// ---------------------------------------------------------------- markers stay put, and stay tappable
const geometry = () =>
  page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
    };
    return JSON.stringify({
      markers: [...document.querySelectorAll('.markers [data-string]')].map((g) => [
        g.dataset.string,
        g.dataset.fret,
        ...r(g),
      ]),
      pegs: [...document.querySelectorAll('[data-peg]')].map(r),
      svg: r(document.querySelector('.fretboard-svg')),
    });
  });
const hitTest = () =>
  page.evaluate(() => {
    const failures = [];
    const svg = document.querySelector('.fretboard-svg');
    const last = Math.max(
      ...[...document.querySelectorAll('.markers [data-string]')].map((g) =>
        Number(g.dataset.fret),
      ),
    );
    for (const [s, f] of [
      [0, 0],
      [5, 0],
      [2, 5],
      [3, 12],
      [0, last],
      [5, last],
      [1, 1],
    ]) {
      const g = document.querySelector(`.markers [data-string="${s}"][data-fret="${f}"]`);
      if (!g) {
        failures.push(`${s}:${f} missing`);
        continue;
      }
      const b = g.getBoundingClientRect();
      const hit = document
        .elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
        ?.closest('[data-string]');
      if (!hit || hit.dataset.string !== String(s) || hit.dataset.fret !== String(f))
        failures.push(
          `${s}:${f} → ${hit ? hit.dataset.string + ':' + hit.dataset.fret : 'nothing'}`,
        );
    }
    // Text must never be mirrored, even in left-handed mode.
    const mirrored = [...document.querySelectorAll('.markers text')].filter(
      (t) => t.getScreenCTM().a < 0,
    ).length;
    if (mirrored) failures.push(`${mirrored} mirrored labels`);
    return failures;
  });

const problems = [];
for (const leftHanded of [false, true]) {
  for (const frets of [18, 24]) {
    await store(
      ([f, l]) => {
        const s = window.__fluidfrets.store.getState();
        s.setFretCount(f);
        s.setLeftHanded(l);
      },
      [frets, leftHanded],
    );
    let reference = null;
    for (const id of MODELS) {
      await setModel(id);
      await sleep(120);
      const g = await geometry();
      reference ??= g;
      if (g !== reference)
        problems.push(`${id} @${frets}${leftHanded ? ' LH' : ''}: markers/pegs moved`);
      const failed = await hitTest();
      if (failed.length)
        problems.push(`${id} @${frets}${leftHanded ? ' LH' : ''}: ${failed.join(', ')}`);
    }
  }
}
await store(() => window.__fluidfrets.store.getState().setLeftHanded(false));
check(
  'every model × {18, 24 frets} × {right, left-handed}: markers and pegs never move when switching',
  !problems.some((p) => p.includes('moved')),
  problems.filter((p) => p.includes('moved')).join('; '),
);
check(
  '…and stay tappable (a tap lands on the right note; labels never mirrored)',
  !problems.some((p) => !p.includes('moved')),
  problems.filter((p) => !p.includes('moved')).join('; '),
);

// Actual clicks play the right notes on each model.
await store(() => {
  const engine = window.__fluidfrets.audioEngine;
  window.__plucks = [];
  const real = engine.pluck.bind(engine);
  engine.pluck = (string, midi, opts) => {
    window.__plucks.push({ string, midi });
    return real(string, midi, opts);
  };
  window.__fluidfrets.store.getState().setFretCount(22);
});
let clickOk = true;
for (const id of MODELS) {
  await setModel(id);
  await sleep(100);
  await store(() => (window.__plucks = []));
  await page.locator('[data-string="2"][data-fret="5"]').click();
  await sleep(120);
  const p = await store(() => window.__plucks);
  if (!(p.length === 1 && p[0].string === 2 && p[0].midi === 55)) clickOk = false;
}
check('a real click plays the right note on every model', clickOk);

// ---------------------------------------------------------------- they look different, and are layered correctly
const look = () =>
  page.evaluate(() => {
    const stops = [...document.querySelectorAll('#fs-board stop')].map((s) =>
      s.getAttribute('stop-color'),
    );
    const head = document.querySelector('[data-part="headstock"] path')?.getAttribute('fill');
    const headD = document.querySelector('[data-part="headstock"] path')?.getAttribute('d');
    const body = document.querySelector('[data-part="body"] path')?.getAttribute('fill');
    const inlays = document.querySelector('[data-inlays]')?.getAttribute('data-inlays');
    const bodyBeforeMarkers = !!(
      document
        .querySelector('[data-part="body"]')
        .compareDocumentPosition(document.querySelector('.markers')) &
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    const headBeforeMarkers = !!(
      document
        .querySelector('[data-part="headstock"]')
        .compareDocumentPosition(document.querySelector('.markers')) &
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    const bodyParts = document.querySelectorAll('[data-part="body"] > *').length;
    return { stops, head, headD, body, inlays, bodyBeforeMarkers, headBeforeMarkers, bodyParts };
  });
const looks = {};
for (const id of MODELS) {
  await setModel(id);
  await sleep(100);
  looks[id] = await look();
}
check(
  'each model has a body edge and headstock drawn under the note markers',
  MODELS.every(
    (id) =>
      looks[id].bodyParts > 3 &&
      looks[id].bodyBeforeMarkers &&
      looks[id].headBeforeMarkers &&
      looks[id].headD,
  ),
);
check(
  'the five models look different (headstock outline, board wood, body colour)',
  new Set(MODELS.map((id) => JSON.stringify([looks[id].headD, looks[id].stops, looks[id].body])))
    .size === 5,
);
check(
  'inlays follow the model: dots, none (side dots), dots, blocks, blocks',
  MODELS.map((id) => looks[id].inlays).join() === 'dots,none,dots,blocks,blocks',
  MODELS.map((id) => looks[id].inlays).join(),
);

// ---------------------------------------------------------------- customise
await setModel('double-cut');
await sleep(100);
await page.getByRole('button', { name: 'Customise' }).click();
const pop = page.getByRole('dialog', { name: 'Customise guitar' });
check(
  'Customise opens a popover with wood, inlays, finish and match-sound',
  (await pop.isVisible()) &&
    (await pop.getByRole('button', { name: 'Rosewood' }).isVisible()) &&
    (await pop.getByRole('checkbox', { name: 'Match sound to guitar' }).isChecked()),
);
const before = await look();
await pop.getByRole('button', { name: 'Rosewood' }).click();
await sleep(100);
const wood = await look();
check(
  'fretboard wood changes the board instantly',
  JSON.stringify(wood.stops) !== JSON.stringify(before.stops) && wood.stops[0] === '#4a2f22',
  wood.stops.join(),
);
await pop.getByRole('button', { name: 'Blocks' }).click();
await sleep(100);
check(
  'inlay style: blocks',
  (await look()).inlays === 'blocks' &&
    (await page.locator('[data-inlays="blocks"] rect').count()) > 5,
);
await pop.getByRole('button', { name: 'Side dots only' }).click();
await sleep(100);
check('inlay style: side dots only (no dots on the board)', (await look()).inlays === 'none');
await pop.getByRole('button', { name: 'Cherry' }).click();
await sleep(100);
const cherry = await look();
check(
  'finish colour recolours the headstock and body',
  cherry.head === '#a63a2c' && cherry.body === '#a63a2c',
  `${cherry.head} ${cherry.body}`,
);
check(
  'and the choice is remembered in the store',
  JSON.stringify((await state()).custom) ===
    JSON.stringify({ wood: 'rosewood', inlay: 'none', finish: '#a63a2c' }),
);
await setModel('classical');
await sleep(100);
const cl = await look();
check(
  'customisations apply to whichever model is chosen',
  cl.stops[0] === '#4a2f22' && cl.inlays === 'none' && cl.body === '#a63a2c',
  `${cl.stops[0]} ${cl.inlays} ${cl.body}`,
);
await pop.getByRole('button', { name: /Reset to/ }).click();
await sleep(100);
const reset = await look();
check(
  'Reset returns to the model’s own look',
  reset.body === '#d9b27c' &&
    JSON.stringify((await state()).custom) ===
      JSON.stringify({ wood: null, inlay: null, finish: null }),
  `${reset.body}`,
);
await page.keyboard.press('Escape');
check('Escape closes the popover', !(await pop.isVisible().catch(() => false)));
await page.getByRole('button', { name: 'Customise' }).click();
await page.mouse.click(700, 500);
check('and so does pressing outside it', !(await pop.isVisible().catch(() => false)));

// ---------------------------------------------------------------- match sound and fret defaults
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.setCustomise({ wood: null, inlay: null, finish: null });
  s.setFretCountUserSet(false);
  s.setMatchSound(true);
  s.setFretCount(22);
  s.setSoundPreset('acoustic');
});
await page.locator('label.field:has(span:text-is("Guitar")) select').selectOption('classical');
let st = await state();
check(
  'choosing Classical selects the nylon sound and its 19 frets',
  st.sound === 'classical' && st.frets === 19,
  JSON.stringify(st),
);
await page.locator('label.field:has(span:text-is("Guitar")) select').selectOption('hollow-body');
st = await state();
check(
  'choosing the hollow-body selects the jazz sound and 22 frets',
  st.sound === 'jazz' && st.frets === 22,
  JSON.stringify(st),
);
await page.locator('label.field:has(span:text-is("Sound")) select').selectOption('crunch');
check(
  'the user can still override the sound afterwards',
  (await state()).sound === 'crunch' && (await state()).model === 'hollow-body',
);
await page.locator('label.field:has(span:text-is("Guitar")) select').selectOption('double-cut');
st = await state();
check(
  'choosing a guitar re-applies its sound (double cutaway → clean, 24 frets)',
  st.sound === 'clean' && st.frets === 24,
  JSON.stringify(st),
);
await page.locator('label.field:has(span:text-is("Frets")) select').selectOption('21');
check(
  'picking a fret count yourself is remembered',
  (await state()).frets === 21 && (await state()).touched === true,
);
await page.locator('label.field:has(span:text-is("Guitar")) select').selectOption('classical');
st = await state();
check(
  '…after which a guitar’s default fret count no longer overrides it',
  st.frets === 21 && st.sound === 'classical',
  JSON.stringify(st),
);
await page.getByRole('button', { name: 'Customise' }).click();
await page.getByRole('checkbox', { name: 'Match sound to guitar' }).uncheck();
await page.keyboard.press('Escape');
await page.locator('label.field:has(span:text-is("Guitar")) select').selectOption('single-cut');
check(
  'with “Match sound to guitar” off, choosing a guitar leaves the sound alone',
  (await state()).sound === 'classical' && (await state()).model === 'single-cut',
  JSON.stringify(await state()),
);
await store(() => window.__fluidfrets.store.getState().setMatchSound(true));

// ---------------------------------------------------------------- legibility on a pale board
await setModel('double-cut');
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.setMode('scale');
  s.setScaleSettings({ rootPc: 4, scaleId: 'minor-pentatonic' });
});
await sleep(200);
const pale = await page.evaluate(() => {
  const out = document.querySelector('.markers [data-role="out"] .marker-dot');
  const plain = document.querySelector('.markers [data-role="scale"] .marker-dot');
  const string0 =
    document.querySelector('[data-part="board"]') &&
    document.querySelectorAll('.fretboard-svg g[stroke-width] > g > line');
  return {
    outStroke: out?.getAttribute('stroke'),
    plainStroke: plain?.getAttribute('stroke'),
    lines: [...document.querySelectorAll('.fretboard-svg line[stroke]')]
      .map((l) => l.getAttribute('stroke'))
      .filter((c) => c && c.startsWith('#'))
      .slice(-6),
  };
});
check(
  'maple board: out-of-key notes are outlined darkly so they show',
  pale.outStroke === '#3a2718',
  pale.outStroke,
);
check(
  'maple board: in-key notes get a dark outline too',
  pale.plainStroke === '#3a2718',
  pale.plainStroke,
);
check(
  'maple board: strings are drawn darker so they show against it',
  pale.lines.some((c) => c === '#7b8188' || c === '#666c72'),
  pale.lines.join(),
);
await setModel('single-cut');
await sleep(150);
const dark = await page.evaluate(() =>
  document.querySelector('.markers [data-role="out"] .marker-dot')?.getAttribute('stroke'),
);
check('dark board: cream outlines as before', dark === '#f2ead3', dark);
await store(() => window.__fluidfrets.store.getState().setMode('explore'));

// ---------------------------------------------------------------- switching leaves everything else alone
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] });
});
const tuningBefore = await store(() =>
  JSON.stringify(window.__fluidfrets.store.getState().tuning.strings),
);
for (const id of MODELS) await setModel(id);
check(
  'switching guitar leaves the tuning alone',
  (await store(() => JSON.stringify(window.__fluidfrets.store.getState().tuning.strings))) ===
    tuningBefore,
);
check('and all six pegs are still there', (await page.locator('[data-peg]').count()) === 6);
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Standard', strings: [40, 45, 50, 55, 59, 64] });
});

// ---------------------------------------------------------------- persistence
await setModel('hollow-body');
await store(() =>
  window.__fluidfrets.store
    .getState()
    .setCustomise({ wood: 'maple', inlay: 'dots', finish: '#2f5d3a' }),
);
await sleep(200);
await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
await sleep(300);
st = await state();
check(
  'the guitar and customisations persist across a reload',
  st.model === 'hollow-body' &&
    JSON.stringify(st.custom) ===
      JSON.stringify({ wood: 'maple', inlay: 'dots', finish: '#2f5d3a' }),
  JSON.stringify(st),
);
await page.evaluate(() =>
  localStorage.setItem(
    'fluid-frets-settings',
    JSON.stringify({
      state: {
        guitarModel: 'banjo',
        customise: { wood: 'plastic', finish: 'red' },
        matchSound: 'maybe',
      },
      version: 1,
    }),
  ),
);
await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
await sleep(300);
st = await state();
check(
  'junk in storage falls back to the defaults',
  st.model === 'steel-acoustic' &&
    JSON.stringify(st.custom) === JSON.stringify({ wood: null, inlay: null, finish: null }) &&
    st.match === true,
  JSON.stringify(st),
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
