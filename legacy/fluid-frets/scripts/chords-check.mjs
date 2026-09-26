/**
 * Drives chord mode in headless Chrome with real clicks and drags: the builder and its validation,
 * chord-tone display, voicing browsing, root-click selection, manual editing with live renaming,
 * filters, play / arpeggiate, and strumming a shape with muted strings.
 * Usage: URL=http://localhost:5199/?debug node scripts/chords-check.mjs
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
const setChord = (patch) =>
  store((p) => {
    const s = window.__fluidfrets.store.getState();
    s.setChordSpec({ ...s.chordSpec, ...p });
  }, patch);
const marker = (string, fret) => page.locator(`[data-string="${string}"][data-fret="${fret}"]`);
const text = (id) => page.getByTestId(id).textContent();
const chip = (name) => page.getByRole('button', { name, exact: true });
const settle = () => sleep(200);

await store(() => {
  const engine = window.__fluidfrets.audioEngine;
  window.__plucks = [];
  const real = engine.pluck.bind(engine);
  engine.pluck = (string, midi, opts) => {
    window.__plucks.push({ string, midi, ...opts, at: performance.now() });
    return real(string, midi, opts);
  };
  window.__fluidfrets.store.getState().setStrumOnTuningChange(false);
});
const plucks = () => store(() => window.__plucks);
const clearPlucks = () => store(() => (window.__plucks = []));

const readBoard = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.markers [data-string]')].map((g) => ({
      string: Number(g.dataset.string),
      fret: Number(g.dataset.fret),
      midi: Number(g.dataset.midi),
      role: g.dataset.role ?? null,
      shape: g.hasAttribute('data-shape'),
      muted: g.hasAttribute('data-muted'),
      label: g.querySelector('text')?.textContent,
      r: Number(g.querySelector('.marker-dot')?.getAttribute('r')),
      fill: g.querySelector('.marker-dot')?.getAttribute('fill'),
    })),
  );
const shapeOnBoard = async () =>
  (await readBoard())
    .filter((m) => m.shape)
    .sort((a, b) => a.string - b.string)
    .map((m) => `${m.string}:${m.fret}`)
    .join(' ');

// ---------------------------------------------------------------- opening the tab
await marker(1, 0).click(); // unlock audio
await page.getByRole('tab', { name: 'Chords' }).click();
await settle();
check(
  'default chord is E major with the open shape 0-2-2-1-0-0',
  (await text('chord-name')) === 'E' && (await text('shape-text')) === '0-2-2-1-0-0',
  `${await text('chord-name')} ${await text('shape-text')}`,
);
check(
  'formula and spelled notes are shown',
  (await text('chord-formula')).includes('1 3 5') && (await text('chord-notes')).includes('E G♯ B'),
);

let board = await readBoard();
check(
  'all chord tones light up across the neck; other notes are dimmed',
  board.every((m) => (m.role === 'out') === ![4, 8, 11].includes(m.midi % 12)) &&
    board.filter((m) => m.role !== 'out').length > 30,
);
const roots = board.filter((m) => m.role === 'tonic');
const plainRoots = roots.filter((m) => !m.shape);
const plainTones = board.filter((m) => m.role === 'scale' && !m.shape);
check(
  'the root is emphasised (larger marker)',
  roots.length > 6 && roots.every((m) => m.label === 'E') && plainRoots[0].r > plainTones[0].r,
  `${plainRoots[0].r} vs ${plainTones[0].r}`,
);
check(
  'the shape is ringed on the neck',
  (await shapeOnBoard()) === '0:0 1:2 2:2 3:1 4:0 5:0',
  await shapeOnBoard(),
);
const legend = (await page.locator('.legend-list li').allTextContents()).join('|');
check('legend lists the tones by function', legend === 'RE|3G♯|55B'.replace('55B', '5B'), legend);

// ---------------------------------------------------------------- builder and validation
await chip('Minor').click();
await chip('7 (♭7)').click();
await settle();
check(
  'builder: minor + 7 → Em7 with formula 1 ♭3 5 ♭7',
  (await text('chord-name')) === 'Em7' && (await text('chord-formula')).includes('1 ♭3 5 ♭7'),
);
check(
  'the shape follows the chord (Em7 → 0-2-0-0-0-0)',
  (await text('shape-text')) === '0-2-0-0-0-0',
  await text('shape-text'),
);

const names = {};
const build = async (label, patch) => {
  await setChord({
    rootPc: 0,
    quality: 'major',
    seventh: 'none',
    extension: 'none',
    alterations: [],
    added: [],
    omit3: false,
    omit5: false,
    bassPc: null,
    ...patch,
  });
  await sleep(60);
  names[label] = await text('chord-name');
};
await build('C7#9', { seventh: '7', alterations: ['#9'] });
await build('Fmaj7#11', { rootPc: 5, seventh: 'maj7', alterations: ['#11'] });
await build('Dm7b5', { rootPc: 2, quality: 'dim', seventh: '7' });
await build('A7sus4', { rootPc: 9, quality: 'sus4', seventh: '7' });
await build('G/B', { rootPc: 7, bassPc: 11 });
await build('E5', { rootPc: 4, quality: 'power' });
check(
  'the plan’s example names',
  Object.entries(names).every(([k, v]) => v === k.replace('#', '♯').replace('b5', '♭5')),
  JSON.stringify(names),
);

await chip('Major').click();
await store(() =>
  window.__fluidfrets.store.getState().setChordSpec({
    rootPc: 0,
    quality: 'major',
    seventh: 'none',
    extension: 'none',
    alterations: [],
    added: [],
    omit3: false,
    omit5: false,
    bassPc: null,
  }),
);
await settle();
const flat9 = chip('♭9');
check(
  'invalid options are greyed with a tooltip reason',
  (await flat9.getAttribute('aria-disabled')) === 'true' &&
    /7th or an extension/.test((await flat9.getAttribute('title')) ?? ''),
);
await flat9.click({ force: true });
check(
  'tapping one shows the reason (touch has no hover)',
  /7th or an extension/.test(await page.locator('.chip-message').textContent()),
);
check('and the chord did not change', (await text('chord-name')) === 'C');
await chip('Diminished 7').click({ force: true });
check(
  'dim7 is unavailable on a major chord',
  /diminished/i.test(await page.locator('.chip-message').textContent()) &&
    (await text('chord-name')) === 'C',
);
await chip('7 (♭7)').click();
await chip('♯9').click();
check('a valid combination builds: C major + 7 + ♯9 = C7♯9', (await text('chord-name')) === 'C7♯9');
await chip('♭9').click({ force: true });
check(
  'and ♭9 with ♯9 is refused',
  (await text('chord-name')) === 'C7♯9' &&
    /combined/.test(await page.locator('.chip-message').textContent()),
);
await chip('♯9').click(); // toggle off
check('toggling an alteration off removes it', (await text('chord-name')) === 'C7');
await page
  .locator('label.field:has(span:text-is("Bass note (slash chord)")) select')
  .selectOption('4');
check('slash bass: C7/E', (await text('chord-name')) === 'C7/E');
await page
  .locator('label.field:has(span:text-is("Bass note (slash chord)")) select')
  .selectOption('');

// ---------------------------------------------------------------- voicings
await setChord({ seventh: 'none' });
await settle();
const thumbLabels = () =>
  page.locator('.voicing-thumb').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
let labels = await thumbLabels();
check(
  'C major: the voicing list includes x-3-2-0-1-0',
  labels.some((l) => l.endsWith(': x-3-2-0-1-0')),
  `${labels.length} voicings`,
);
check(
  'C major: the best voicing is selected by default and ringed',
  (await text('shape-text')) === 'x-3-2-0-1-0' && (await shapeOnBoard()) === '1:3 2:2 3:0 4:1 5:0',
  await text('shape-text'),
);
check(
  'the muted low string shows ✕ behind the nut',
  (await readBoard()).some((m) => m.string === 0 && m.fret === 0 && m.muted),
);
const status0 = await text('voicing-status');
await page.getByRole('button', { name: /Next/ }).click();
const status1 = await text('voicing-status');
check(
  'Next steps through the position-sorted list',
  /Voicing \d+ of \d+/.test(status1) && status0 !== status1,
  `${status0} → ${status1}`,
);
await page.getByRole('button', { name: /Prev/ }).click();
check('Prev steps back', (await text('voicing-status')) === status0);
const total = Number(status0.match(/of (\d+)/)[1]);
await store(() =>
  window.__fluidfrets.store
    .getState()
    .setChordShape(window.__fluidfrets.store.getState().chordShape, 0),
);
await page.getByRole('button', { name: /Prev/ }).click();
check(
  'Prev wraps from the first to the last voicing',
  (await text('voicing-status')) === `Voicing ${total} of ${total}`,
);

// Diagrams.
await page.locator('.voicing-thumb', { hasText: '' }).nth(3).click();
check(
  'clicking a mini diagram jumps to that voicing',
  (await text('voicing-status')).startsWith('Voicing 4 of'),
);
const opens = await page.locator('.voicing-thumb').first().locator('circle').count();
check('mini diagrams draw dots', opens > 0);

// Swipe on the voicing card.
await store(() =>
  window.__fluidfrets.store
    .getState()
    .setChordShape(window.__fluidfrets.store.getState().chordShape, 4),
);
await settle();
const card = await page.locator('.voicing-card').boundingBox();
await page.mouse.move(card.x + card.width * 0.7, card.y + 20);
await page.mouse.down();
await page.mouse.move(card.x + card.width * 0.3, card.y + 22, { steps: 6 });
await page.mouse.up();
check(
  'swiping left on the voicing card goes to the next voicing',
  (await text('voicing-status')).startsWith('Voicing 6 of'),
  await text('voicing-status'),
);
await page.mouse.move(card.x + card.width * 0.3, card.y + 20);
await page.mouse.down();
await page.mouse.move(card.x + card.width * 0.7, card.y + 22, { steps: 6 });
await page.mouse.up();
check(
  'and swiping right goes back',
  (await text('voicing-status')).startsWith('Voicing 5 of'),
  await text('voicing-status'),
);

// ---------------------------------------------------------------- root click
await store(() => window.__fluidfrets.store.getState().setChordShape(null, null));
await clearPlucks();
await marker(0, 8).click(); // the C on the low E string
await sleep(700);
let shape = await text('shape-text');
check(
  'clicking a lit root selects the best voicing with that root there',
  shape.startsWith('8-'),
  shape,
);
check('and strums it', (await plucks()).length >= 4, `${(await plucks()).length} plucks`);
await marker(1, 3).click();
await sleep(500);
check(
  'clicking the root at A-string fret 3 selects the open C shape',
  (await text('shape-text')) === 'x-3-2-0-1-0',
  await text('shape-text'),
);

// ---------------------------------------------------------------- manual editing
await setChord({ rootPc: 4 }); // E major again
await settle();
check('E major shape restored', (await text('shape-text')) === '0-2-2-1-0-0');
await marker(0, 0).click();
await sleep(150);
check(
  'clicking the sounding open string mutes it',
  (await text('shape-text')) === 'x-2-2-1-0-0' &&
    (await readBoard()).some((m) => m.string === 0 && m.muted),
);
check(
  'the name updates live: now E/B',
  (await text('shape-reading')).includes('now: E/B'),
  await text('shape-reading'),
);
await marker(0, 0).click();
await sleep(150);
check(
  'clicking ✕ opens it again',
  (await text('shape-text')) === '0-2-2-1-0-0' && (await text('shape-reading')).includes('✓'),
);
await marker(3, 0).click(); // open G string: G natural instead of G♯
await sleep(150);
check(
  'editing a note renames the chord: open G string → now Em',
  (await text('shape-reading')).includes('now: Em') && (await text('shape-text')) === '0-2-2-0-0-0',
  `${await text('shape-text')} ${await text('shape-reading')}`,
);
check(
  'the edited shape is marked as such',
  (await text('voicing-status')).startsWith('Edited shape'),
  await text('voicing-status'),
);
await marker(3, 1).click(); // G♯ back
await sleep(150);
check(
  'tapping a lit chord tone moves the string’s note there',
  (await text('shape-text')) === '0-2-2-1-0-0',
);
await marker(3, 1).click();
await sleep(150);
check(
  'tapping the sounding note again mutes the string',
  (await text('shape-text')) === '0-2-2-x-0-0',
  await text('shape-text'),
);
await page.getByRole('button', { name: 'Best voicing' }).click();
check('“Best voicing” resets the shape', (await text('shape-text')) === '0-2-2-1-0-0');

// Edit mode: root taps edit instead of selecting.
await page.getByRole('button', { name: 'Edit shape' }).click();
await marker(0, 12).click();
await sleep(150);
check(
  'edit mode: tapping a root moves the string’s note (no voicing jump)',
  (await text('shape-text')) === '12-2-2-1-0-0',
  await text('shape-text'),
);
await page.getByRole('button', { name: 'Edit shape' }).click();
await page.getByRole('button', { name: 'Best voicing' }).click();

// A non-chord note is just played.
await clearPlucks();
await marker(0, 1).click();
await sleep(150);
check(
  'tapping a note that isn’t a chord tone just plays it',
  (await plucks()).length === 1 && (await text('shape-text')) === '0-2-2-1-0-0',
);

// ---------------------------------------------------------------- play / arpeggiate / strum
await marker(0, 0).click(); // mute string 6 to test silence
await sleep(150);
await clearPlucks();
await page.getByRole('button', { name: /Play/ }).first().click();
await sleep(700);
let p = await plucks();
check(
  'Play strums low → high and skips the muted string',
  JSON.stringify(p.map((n) => n.string)) === '[1,2,3,4,5]',
  JSON.stringify(p.map((n) => n.string)),
);
check(
  'with the chord’s notes',
  JSON.stringify(p.map((n) => n.midi)) === JSON.stringify([47, 52, 56, 59, 64]),
  p.map((n) => n.midi).join(' '),
);
const gaps = p.slice(1).map((n, i) => n.when - p[i].when);
check(
  'at the chosen speed (35 ms)',
  gaps.every((g) => Math.abs(g - 0.035) < 0.002),
  gaps.map((g) => (g * 1000).toFixed(1)).join(' '),
);
await page.getByRole('button', { name: /Down|Up/ }).click();
await clearPlucks();
await page.getByRole('button', { name: /Play/ }).first().click();
await sleep(700);
p = await plucks();
check(
  'the direction toggle reverses the strum (high → low, brighter)',
  JSON.stringify(p.map((n) => n.string)) === '[5,4,3,2,1]' && p.every((n) => n.brightness > 0),
  JSON.stringify(p.map((n) => n.string)),
);
await page.getByRole('button', { name: /Down|Up/ }).click();
await clearPlucks();
await page.getByRole('button', { name: 'Arpeggiate' }).click();
await sleep(1900);
p = await plucks();
const agaps = p.slice(1).map((n, i) => n.when - p[i].when);
check(
  'Arpeggiate plays the notes one at a time',
  p.length === 5 && agaps.every((g) => g > 0.2),
  agaps.map((g) => g.toFixed(2)).join(' '),
);

// Strum gesture over the neck uses the shape (muted string silent).
const ys = await store(() => {
  const c = document.querySelector('.fretboard-svg').getScreenCTM();
  return {
    ys: Array.from({ length: 6 }, (_, i) => c.d * (22 + (5 - i) * 36) + c.f),
    x: c.a * 500 + c.e,
  };
});
await clearPlucks();
await page.mouse.move(ys.x, ys.ys[0] + 25);
await page.mouse.down();
for (let s = 1; s <= 14; s++) {
  await page.mouse.move(ys.x, ys.ys[0] + 25 - ((ys.ys[0] - ys.ys[5] + 50) * s) / 14);
  await sleep(4);
}
await page.mouse.up();
p = await plucks();
check(
  'strumming the neck sounds the shape, with the muted string silent',
  JSON.stringify(p.map((n) => n.string)) === '[1,2,3,4,5]' && p[0].midi === 47,
  JSON.stringify(p.map((n) => [n.string, n.midi])),
);

// ---------------------------------------------------------------- display options
await page.getByRole('button', { name: 'Best voicing' }).click();
await page.getByLabel('Show intervals (R, 3, 5, ♭7)').check();
await settle();
board = await readBoard();
check(
  'interval labels replace note names (R, 3, 5)',
  board.filter((m) => m.role !== 'out').every((m) => ['R', '3', '5'].includes(m.label)),
  [...new Set(board.filter((m) => m.role !== 'out').map((m) => m.label))].join(','),
);
await page.getByLabel('Show intervals (R, 3, 5, ♭7)').uncheck();
await page.getByLabel('Hide other notes').check();
await settle();
board = await readBoard();
check(
  '“Hide other notes” removes everything but chord tones and the muted ✕',
  board.every((m) => m.role !== 'out'),
  `${board.length} markers`,
);
await page.getByLabel('Hide other notes').uncheck();
await page.getByLabel('Colour by function').uncheck();
await settle();
board = await readBoard();
check(
  'colour off: root highlighted, other tones plain',
  board.filter((m) => m.role === 'tonic').every((m) => m.fill === '#f2a93b') &&
    new Set(board.filter((m) => m.role === 'scale').map((m) => m.fill)).size === 1,
);
await page.getByLabel('Colour by function').check();

// ---------------------------------------------------------------- filters
await setChord({ rootPc: 0 });
await settle();
const count = async () => (await thumbLabels()).length;
const all = await count();
await page.locator('summary', { hasText: 'Voicing rules' }).click();
await page.getByLabel('Root in bass only').check();
await settle();
const rootBass = await count();
check(
  '“Root in bass only” narrows the list',
  rootBass > 0 && rootBass < all,
  `${all} → ${rootBass}`,
);
await page.getByLabel('Root in bass only').uncheck();
await page.getByLabel('Include open strings').uncheck();
await settle();
check(
  '“Include open strings” off removes every open-string shape',
  (await thumbLabels()).every((l) => !/(^|[: -])0(-|$)/.test(l.split(': ')[1])) &&
    (await count()) < all,
);
await page.getByLabel('Include open strings').check();
await page.getByLabel('No muted inner strings').check();
await settle();
const noInner = (await thumbLabels()).map((l) => l.split(': ')[1]);
check(
  '“No muted inner strings” leaves no gaps',
  noInner.length > 0 &&
    noInner.every((s) => !/[0-9]-x-[0-9]/.test(s) && !/[0-9]-x-x-[0-9]/.test(s)),
  `${noInner.length} voicings`,
);
await page.getByLabel('No muted inner strings').uncheck();
await page.getByLabel('Max stretch (frets)').selectOption('2');
await settle();
check('a smaller max stretch narrows the list', (await count()) < all);
await page.getByLabel('Max stretch (frets)').selectOption('4');
await page.getByLabel('Min strings sounding').selectOption('6');
await settle();
check(
  'min strings sounding = 6 leaves only six-string shapes',
  (await thumbLabels()).every((l) => !l.includes('x')),
  `${await count()} voicings`,
);
await page.getByLabel('Min strings sounding').selectOption('auto');
await page.getByLabel('Max fingers').selectOption('1');
await settle();
check('max fingers 1 keeps only one-finger shapes', (await count()) < all);
await page.getByLabel('Max fingers').selectOption('4');
await page.getByLabel('Min strings sounding').selectOption('6');
await page.getByLabel('Root in bass only').check();
await page.getByLabel('Max fingers').selectOption('1');
await page.getByLabel('Max stretch (frets)').selectOption('2');
await page.getByLabel('Include open strings').uncheck();
await settle();
check(
  'rules that leave nothing say so, and the neck shows no shape',
  (await text('voicing-status')) === 'No voicings under these rules' &&
    (await shapeOnBoard()) === '',
);
await store(() =>
  window.__fluidfrets.store.getState().setVoicingRules({
    maxStretch: 4,
    maxFingers: 4,
    minStrings: 'auto',
    includeOpen: true,
    rootInBass: false,
    noInnerMutes: false,
  }),
);

// ---------------------------------------------------------------- other tunings
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Open G', strings: [38, 43, 50, 55, 59, 62] });
  s.setChordSpec({ ...s.chordSpec, rootPc: 7 });
});
await settle();
check(
  'Open G tuning: G major defaults to 0-0-0-0-0-0',
  (await text('shape-text')) === '0-0-0-0-0-0',
  await text('shape-text'),
);
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Standard', strings: [40, 45, 50, 55, 59, 64] });
});
await settle();
check(
  'going back to standard tuning finds shapes again for the new tuning',
  (await text('shape-text')) !== '0-0-0-0-0-0',
);

// ---------------------------------------------------------------- scale overlay and persistence
await setChord({ rootPc: 4 });
await page.getByRole('tab', { name: 'Scales' }).click();
await store(() =>
  window.__fluidfrets.store
    .getState()
    .setScaleSettings({ rootPc: 4, scaleId: 'natural-minor', overlay: { kind: 'chord' } }),
);
await settle();
board = await readBoard();
const ringedLabels = await page.evaluate(() =>
  [
    ...new Set(
      [...document.querySelectorAll('.markers [data-overlay]')].map(
        (g) => g.querySelector('text').textContent,
      ),
    ),
  ]
    .sort()
    .join(''),
);
check(
  'scale overlay “Chord from the Chords tab” rings the chord’s notes (E major over E minor)',
  ringedLabels === 'BEG♯',
  ringedLabels,
);
check(
  'and the strum shape is released outside chord mode',
  (await store(() => window.__fluidfrets.store.getState().strumShape)) === null,
);
await page.getByRole('tab', { name: 'Chords' }).click();
await store(() =>
  window.__fluidfrets.store.getState().setChordSpec({
    rootPc: 9,
    quality: 'minor',
    seventh: '7',
    extension: 'none',
    alterations: [],
    added: [],
    omit3: false,
    omit5: false,
    bassPc: null,
  }),
);
await sleep(300);
await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
await sleep(400);
check(
  'the chord and mode persist across a reload, and the shape is restored',
  (await text('chord-name')) === 'Am7' && (await text('shape-text')) !== '',
  `${await text('chord-name')} ${await text('shape-text')}`,
);
await page.evaluate(() =>
  localStorage.setItem(
    'fluid-frets-settings',
    JSON.stringify({
      state: {
        mode: 'chord',
        chordSpec: { rootPc: 3, quality: 'power', seventh: '7' },
        voicingRules: { maxStretch: 99, minStrings: 'x' },
        chordDisplay: 7,
        chordPlay: { speedMs: 'fast' },
      },
      version: 1,
    }),
  ),
);
await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
await sleep(300);
check(
  'an invalid stored chord (power + 7th) falls back to a plain chord on the same root',
  (await text('chord-name')) === 'E♭',
  await text('chord-name'),
);

// Leaving chord mode.
await page.getByRole('tab', { name: 'Explore' }).click();
await settle();
check(
  'Explore mode: notes drawn plainly again, strum shape released',
  (await readBoard()).every((m) => m.role === null && !m.shape) &&
    (await store(() => window.__fluidfrets.store.getState().strumShape)) === null,
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
