/**
 * Drives Identify mode in headless Chrome with real clicks: the selection rules, the open/muted
 * toggle, live naming for the plan's example shapes, spelled notes and intervals, playing, and
 * sending a shape to chord mode. Usage: URL=http://localhost:5199/?debug node scripts/identify-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
const marker = (string, fret) => page.locator(`[data-string="${string}"][data-fret="${fret}"]`);
const text = (id) => page.getByTestId(id).textContent();
const clear = async () => {
  const btn = page.getByRole('button', { name: 'Clear', exact: true });
  if (await btn.isEnabled()) await btn.click();
};

await store(() => {
  const engine = window.__fluidfrets.audioEngine;
  window.__plucks = [];
  const real = engine.pluck.bind(engine);
  engine.pluck = (string, midi, opts) => {
    window.__plucks.push({ string, midi, ...opts });
    return real(string, midi, opts);
  };
  window.__fluidfrets.store.getState().setStrumOnTuningChange(false);
});
const plucks = () => store(() => window.__plucks);
const clearPlucks = () => store(() => (window.__plucks = []));

/** Build "x-3-2-0-1-0" by clicking the neck: x = muted (two toggle clicks), 0 = open (one), n = fret. */
async function pick(shape) {
  await clear();
  const cells = shape.split('-');
  for (let s = 0; s < cells.length; s++) {
    const c = cells[s];
    if (c === '-') continue;
    if (c === 'u') continue; // unused
    if (c === 'x') {
      await marker(s, 0).click();
      await marker(s, 0).click();
    } else if (c === '0') await marker(s, 0).click();
    else await marker(s, Number(c)).click();
  }
  await sleep(120);
}
const name = () => text('identify-name');
const selectionText = () => text('identify-shape');
const board = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.markers [data-string]')].map((g) => ({
      string: Number(g.dataset.string),
      fret: Number(g.dataset.fret),
      role: g.dataset.role ?? null,
      shape: g.hasAttribute('data-shape'),
      muted: g.hasAttribute('data-muted'),
    })),
  );

// ---------------------------------------------------------------- opening the tab
await marker(1, 0).click(); // unlock audio in explore mode
await page.getByRole('tab', { name: 'Identify' }).click();
await sleep(200);
check(
  'starts empty: no chord, all strings unused',
  (await name()) === '—' && (await selectionText()) === '– – – – – –',
  `${await name()} | ${await selectionText()}`,
);
check(
  'the neck looks plain before anything is picked',
  (await board()).every((m) => !m.shape && !m.muted && m.role === 'scale'),
);
check(
  'Find chord, Send and Clear are disabled with nothing picked',
  !(await page.getByRole('button', { name: /Find chord/ }).isEnabled()) &&
    !(await page.getByRole('button', { name: /Send to Chord mode/ }).isEnabled()) &&
    !(await page.getByRole('button', { name: 'Clear', exact: true }).isEnabled()),
);

// ---------------------------------------------------------------- selection rules
await marker(2, 5).click();
await sleep(100);
check(
  'tapping a fret selects it (and plays it)',
  (await selectionText()) === '– – 5 – – –' && (await plucks()).length >= 1,
  await selectionText(),
);
check(
  'the picked note is ringed',
  (await board())
    .filter((m) => m.shape)
    .map((m) => `${m.string}:${m.fret}`)
    .join() === '2:5',
);
await marker(2, 7).click();
await sleep(100);
check(
  'another fret on the same string moves the pick (one note per string)',
  (await selectionText()) === '– – 7 – – –' && (await board()).filter((m) => m.shape).length === 1,
  await selectionText(),
);
await marker(4, 3).click();
await marker(2, 7).click();
await sleep(100);
check(
  'tapping the picked fret again clears it; other strings are untouched',
  (await selectionText()) === '– – – – 3 –',
  await selectionText(),
);
await clear();
check('Clear empties the selection', (await selectionText()) === '– – – – – –');

// The toggle behind the nut.
await marker(1, 0).click();
await sleep(80);
check(
  'toggle: first tap = open (○), shown as a ringed open note',
  (await selectionText()) === '– 0 – – – –' &&
    (await board()).some((m) => m.string === 1 && m.fret === 0 && m.shape),
);
await marker(1, 0).click();
await sleep(80);
check(
  'toggle: second tap = muted (✕)',
  (await selectionText()) === '– x – – – –' &&
    (await board()).some((m) => m.string === 1 && m.fret === 0 && m.muted),
);
await marker(1, 0).click();
await sleep(80);
check(
  'toggle: third tap = unused again',
  (await selectionText()) === '– – – – – –' && !(await board()).some((m) => m.muted),
);
await marker(1, 5).click();
await marker(1, 0).click();
await sleep(80);
check('toggle on a fretted string goes to open', (await selectionText()) === '– 0 – – – –');
await clear();
await marker(3, 0).click();
await marker(3, 0).click();
await clear();
check('…including a muted string', (await selectionText()) === '– – – – – –');

// ---------------------------------------------------------------- the plan's examples
const cases = [
  ['x-3-2-0-1-0', 'C'],
  ['0-2-2-1-0-0', 'E'],
  ['x-0-2-2-1-0', 'Am'],
  ['x-x-0-2-3-2', 'D'],
  ['x-2-2-1-0-0', 'E/B'],
  ['3-x-0-0-0-x', 'G'],
  ['x-0-2-0-2-0', 'A7'],
];
for (const [shape, expected] of cases) {
  await pick(shape);
  check(`${shape} → ${expected}`, (await name()) === expected, await name());
}
await pick('x-3-2-2-1-0');
check(
  'x-3-2-2-1-0 → C6, with Am/C as an alternative',
  (await name()) === 'C6' && (await text('identify-alternatives')).includes('Am/C'),
  `${await name()} | ${await text('identify-alternatives')}`,
);
await pick('3-x-0-x-x-x');
check('root + 5th → a power chord: G5', (await name()) === 'G5', await name());
await pick('x-3-x-x-5-x');
check(
  'two other notes → an interval',
  /Minor 3rd|Major 3rd|3rd/.test(await name()) ||
    /(Major|Minor|Perfect|Tritone)/.test(await name()),
  await name(),
);
await pick('x-3-x-x-x-x');
check('one note → just the note', (await name()) === 'C', await name());

// It updates live as notes are toggled.
await pick('x-x-0-2-3-2');
check('live: D', (await name()) === 'D');
await marker(5, 2).click(); // clear the high-E pick (F♯), leaving D and A
await sleep(100);
check('live: removing a note re-names the chord', (await name()) !== 'D', await name());
await marker(5, 2).click();
await sleep(100);
check('live: and putting it back restores D', (await name()) === 'D');

// ---------------------------------------------------------------- spelled notes and intervals
await pick('x-3-2-0-1-0');
check(
  'spelled notes lowest first',
  (await text('identify-notes')).includes('C E G C E'),
  await text('identify-notes'),
);
check(
  'intervals from the root',
  (await text('identify-intervals')).includes('R 3 5 R 3'),
  await text('identify-intervals'),
);
await pick('x-2-2-1-0-0');
check(
  'slash chord: intervals measured from the root, not the bass (E/B → 5 R 3 5 R)',
  (await text('identify-intervals')).includes('5 R 3 5 R') &&
    (await text('identify-notes')).includes('B E G♯ B E'),
  `${await text('identify-notes')} | ${await text('identify-intervals')}`,
);
await pick('x-3-2-0-1-0');
const b = await board();
const roots = b.filter((m) => m.role === 'tonic');
check(
  'the root of the best reading is highlighted wherever it occurs on the neck',
  roots.length > 6 &&
    (await page.locator('[data-role="tonic"] text').allTextContents()).every((t) => t === 'C'),
  `${roots.length} roots`,
);
const legend = (await page.locator('.legend-list li').allTextContents()).join('|');
check(
  'legend: root of the best reading / note, no “out of scale”',
  legend.includes('Root of the best reading') &&
    legend.includes('Note') &&
    !legend.includes('Out of scale'),
  legend,
);
check(
  'muted strings show ✕; unused ones are drawn normally',
  (await board()).filter((m) => m.muted).length === 1 &&
    (await board()).some((m) => m.string === 0 && m.muted),
);

// ---------------------------------------------------------------- playing
await pick('x-3-2-0-1-0');
await clearPlucks();
await page.getByRole('button', { name: /Find chord/ }).click();
await sleep(700);
let p = await plucks();
check(
  'Find chord strums the picked notes low → high; muted/unused silent',
  JSON.stringify(p.map((n) => n.string)) === '[1,2,3,4,5]' &&
    JSON.stringify(p.map((n) => n.midi)) === '[48,52,55,60,64]',
  JSON.stringify(p.map((n) => n.midi)),
);
await page.getByRole('button', { name: /Down|Up/ }).click();
await clearPlucks();
await page.getByRole('button', { name: /Find chord/ }).click();
await sleep(700);
p = await plucks();
check(
  'the direction toggle applies here too',
  JSON.stringify(p.map((n) => n.string)) === '[5,4,3,2,1]',
  JSON.stringify(p.map((n) => n.string)),
);
await page.getByRole('button', { name: /Down|Up/ }).click();

// Strum gesture.
const geo = await store(() => {
  const c = document.querySelector('.fretboard-svg').getScreenCTM();
  return {
    ys: Array.from({ length: 6 }, (_, i) => c.d * (22 + (5 - i) * 36) + c.f),
    x: c.a * 500 + c.e,
  };
});
await pick('0-x-x-0-x-0');
await clearPlucks();
await page.mouse.move(geo.x, geo.ys[0] + 25);
await page.mouse.down();
for (let s = 1; s <= 14; s++) {
  await page.mouse.move(geo.x, geo.ys[0] + 25 - ((geo.ys[0] - geo.ys[5] + 50) * s) / 14);
  await sleep(4);
}
await page.mouse.up();
p = await plucks();
check(
  'strumming the neck sounds only the picked strings',
  JSON.stringify(p.map((n) => n.string)) === '[0,3,5]',
  JSON.stringify(p.map((n) => n.string)),
);

// ---------------------------------------------------------------- send to chord mode
await pick('x-2-2-1-0-0');
await page.getByRole('button', { name: /Send to Chord mode/ }).click();
await sleep(300);
check(
  'Send to Chord mode opens the Chords tab with the identified chord',
  (await page.getByRole('tab', { name: 'Chords' }).getAttribute('aria-selected')) === 'true' &&
    (await text('chord-name')) === 'E/B',
  await text('chord-name'),
);
check(
  'with the picked shape as the active voicing (not the best one)',
  (await text('shape-text')) === 'x-2-2-1-0-0',
  await text('shape-text'),
);
check(
  'and the neck rings it, with the chord’s tones lit',
  (await board()).filter((m) => m.shape).length === 5 &&
    (await board()).some((m) => m.role === 'tonic'),
);
await page.getByRole('button', { name: /Next/ }).click();
check(
  'the voicing list still works from there',
  (await text('shape-text')) !== 'x-2-2-1-0-0',
  await text('shape-text'),
);
await page.getByRole('tab', { name: 'Identify' }).click();
await sleep(200);
check(
  'the picks are still there when you come back',
  (await selectionText()) === 'x 2 2 1 0 0',
  await selectionText(),
);

await pick('x-3-2-2-1-0');
await page.getByRole('button', { name: /Send to Chord mode/ }).click();
await sleep(300);
check(
  'an identified shape outside the voicing list still loads (as an edited shape)',
  (await text('chord-name')) === 'C6' &&
    (await text('shape-text')) === 'x-3-2-2-1-0' &&
    (await text('voicing-status')).startsWith('Edited shape'),
  `${await text('chord-name')} ${await text('shape-text')} ${await text('voicing-status')}`,
);
await page.getByRole('tab', { name: 'Identify' }).click();
await pick('x-3-x-x-5-x');
check(
  'Send is disabled for an interval',
  !(await page.getByRole('button', { name: /Send to Chord mode/ }).isEnabled()),
);
await pick('3-x-0-x-x-x');
check(
  'but works for a power chord',
  await page.getByRole('button', { name: /Send to Chord mode/ }).isEnabled(),
);

// ---------------------------------------------------------------- tunings
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Open G', strings: [38, 43, 50, 55, 59, 62] });
});
await pick('0-0-0-0-0-0');
check(
  'follows the tuning: Open G with every string open is G/D',
  (await name()) === 'G/D',
  await name(),
);
check(
  'and intervals: the D in the bass is the 5th',
  (await text('identify-intervals')).startsWith('Intervals from the root 5 R'),
  await text('identify-intervals'),
);
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Standard', strings: [40, 45, 50, 55, 59, 64] });
});
await sleep(150);
check('changing tuning re-reads the same frets', (await name()) !== 'G/D');

// ---------------------------------------------------------------- leaving
await page.getByRole('tab', { name: 'Explore' }).click();
await sleep(200);
check(
  'Explore mode: the neck is plain again and the strum shape released',
  (await board()).every((m) => m.role === null && !m.shape) &&
    (await store(() => window.__fluidfrets.store.getState().strumShape)) === null,
);
const geo2 = await store(() => {
  const c = document.querySelector('.fretboard-svg').getScreenCTM();
  return {
    ys: Array.from({ length: 6 }, (_, i) => c.d * (22 + (5 - i) * 36) + c.f),
    x: c.a * 500 + c.e,
  };
});
await clearPlucks();
await page.mouse.move(geo2.x, geo2.ys[0] + 25);
await page.mouse.down();
for (let s = 1; s <= 14; s++) {
  await page.mouse.move(geo2.x, geo2.ys[0] + 25 - ((geo2.ys[0] - geo2.ys[5] + 50) * s) / 14);
  await sleep(4);
}
await page.mouse.up();
check(
  'and a strum plays the open strings again',
  (await plucks()).length === 6,
  JSON.stringify((await plucks()).map((n) => n.string)),
);

// Persistence: the tab is remembered, the picks are not.
await page.getByRole('tab', { name: 'Identify' }).click();
await pick('x-3-2-0-1-0');
await sleep(200);
await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
await sleep(300);
check(
  'the Identify tab is remembered across a reload, with a fresh empty selection',
  (await page.getByRole('tab', { name: 'Identify' }).getAttribute('aria-selected')) === 'true' &&
    (await selectionText()) === '– – – – – –',
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
