/**
 * Drives scale mode in headless Chrome: the E minor pentatonic box, colours, overlays, hiding,
 * spelling, the colour-blind palette, persistence, and scale playback timing against the audio
 * clock. Usage: URL=http://localhost:5199/?debug node scripts/scales-check.mjs
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
const setScale = (patch) =>
  store((p) => window.__fluidfrets.store.getState().setScaleSettings(p), patch);
const setPlayback = (patch) =>
  store((p) => window.__fluidfrets.store.getState().setPlayback(p), patch);
const marker = (string, fret) => page.locator(`[data-string="${string}"][data-fret="${fret}"]`);
const settle = () => sleep(150);

await store(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));
await store(() => {
  const engine = window.__fluidfrets.audioEngine;
  window.__plucks = [];
  const real = engine.pluck.bind(engine);
  engine.pluck = (string, midi, opts) => {
    window.__plucks.push({ string, midi, ...opts, at: performance.now() });
    return real(string, midi, opts);
  };
});

/** {string, fret, role, degree, fill, text} for every marker on a fret. */
const readBoard = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.markers [data-string]')].map((g) => ({
      string: Number(g.dataset.string),
      fret: Number(g.dataset.fret),
      midi: Number(g.dataset.midi),
      role: g.dataset.role ?? null,
      degree: g.dataset.degree ?? null,
      overlay: g.hasAttribute('data-overlay'),
      fill: g.querySelector('.marker-dot')?.getAttribute('fill'),
      label: g.querySelector('text')?.textContent,
      textFill: g.querySelector('text')?.getAttribute('fill'),
      dashed: !!g.querySelector('circle[stroke-dasharray]'),
    })),
  );

// ---------------------------------------------------------------- explore mode is unchanged
let board = await readBoard();
check(
  'explore mode: every note drawn the same, no scale roles',
  board.length > 100 && board.every((m) => m.role === null),
);
check('explore mode: no legend', (await page.locator('.legend').count()) === 0);

// ---------------------------------------------------------------- E minor pentatonic
await page.getByRole('tab', { name: 'Scales' }).click();
await setScale({ rootPc: 4, scaleId: 'minor-pentatonic' });
await settle();
board = await readBoard();
const inScale = (lo, hi) =>
  [0, 1, 2, 3, 4, 5].map((s) =>
    board
      .filter((m) => m.string === s && m.fret >= lo && m.fret <= hi && m.role !== 'out')
      .map((m) => m.fret),
  );
const box = JSON.stringify([
  [0, 3],
  [0, 2],
  [0, 2],
  [0, 2],
  [0, 3],
  [0, 3],
]);
check(
  'E minor pentatonic: familiar box at frets 0–3',
  JSON.stringify(inScale(0, 3)) === box,
  JSON.stringify(inScale(0, 3)),
);
check(
  'E minor pentatonic: and again at frets 12–15',
  JSON.stringify(inScale(12, 15)) ===
    JSON.stringify([
      [12, 15],
      [12, 14],
      [12, 14],
      [12, 14],
      [12, 15],
      [12, 15],
    ]),
  JSON.stringify(inScale(12, 15)),
);
const tonics = board.filter((m) => m.role === 'tonic');
check(
  'tonic (E) is highlighted everywhere it occurs',
  tonics.length > 6 && tonics.every((m) => m.label === 'E'),
  `${tonics.length} tonics`,
);
check(
  'tonic marker is larger and has its own colour',
  await page.evaluate(() => {
    const r = (s, f) =>
      Number(
        document
          .querySelector(`[data-string="${s}"][data-fret="${f}"] .marker-dot`)
          .getAttribute('r'),
      );
    const fill = (s, f) =>
      document
        .querySelector(`[data-string="${s}"][data-fret="${f}"] .marker-dot`)
        .getAttribute('fill');
    return r(0, 0) > r(0, 3) && fill(0, 0) !== fill(0, 3);
  }),
);
const outs = board.filter((m) => m.role === 'out');
check(
  'out-of-scale notes are drawn as dim outlines',
  outs.length > 50 && outs.every((m) => m.fill === 'transparent'),
);
check(
  'every in-scale marker is one of E G A B D across the whole neck',
  board.filter((m) => m.role !== 'out').every((m) => [4, 7, 9, 11, 2].includes(m.midi % 12)) &&
    board.filter((m) => m.role === 'out').every((m) => ![4, 7, 9, 11, 2].includes(m.midi % 12)),
);
check('legend appears in scale mode', (await page.locator('.legend').count()) === 1);

// Out-of-scale notes stay tappable.
await store(() => (window.__plucks = []));
await marker(0, 1).click();
await sleep(150);
check(
  'an out-of-scale note can still be tapped to hear it',
  (await store(() => window.__plucks)).length === 1,
);

// ---------------------------------------------------------------- hide out-of-scale
await setScale({ hideOutOfScale: true });
await settle();
board = await readBoard();
check(
  'hide out-of-scale: only scale notes remain',
  board.length > 30 && board.every((m) => m.role !== 'out'),
  `${board.length} markers`,
);
await setScale({ hideOutOfScale: false });

// ---------------------------------------------------------------- colours
await setScale({ rootPc: 9, scaleId: 'minor-pentatonic', colourMode: true });
await settle();
board = await readBoard();
const fillAt = (s, f) => board.find((m) => m.string === s && m.fret === f);
const rainbow = {
  1: '#dc2f3e',
  2: '#f4802a',
  3: '#f7d716',
  4: '#3fae49',
  5: '#2f80ed',
  6: '#4b3fb8',
  7: '#9b4dca',
};
// A minor pentatonic on the low E string: 5 (E) at 0, ♭7 (G) at 3, 1 (A) at 5, ♭3 (C) at 8, 4 (D) at 10.
check(
  'colour mode: minor pentatonic uses 1 red, ♭3 yellow, 4 green, 5 blue, ♭7 violet',
  fillAt(0, 0)?.fill === rainbow[5] &&
    fillAt(0, 3)?.fill === rainbow[7] &&
    fillAt(0, 5)?.fill === rainbow[1] &&
    fillAt(0, 8)?.fill === rainbow[3] &&
    fillAt(0, 10)?.fill === rainbow[4],
  ['0', '3', '5', '8', '10'].map((f) => fillAt(0, Number(f))?.fill).join(' '),
);
check(
  'colour mode: text picks the higher-contrast of black/white (black on yellow, white on red)',
  fillAt(0, 8)?.textFill === '#161310' && fillAt(0, 5)?.textFill === '#ffffff',
  `${fillAt(0, 8)?.textFill} ${fillAt(0, 5)?.textFill}`,
);
const chips = await page.locator('.legend-list li').allTextContents();
check(
  'legend: one chip per degree with its note',
  chips.join('|') === '1A|♭3C|4D|5E|♭7G',
  chips.join('|'),
);

await setScale({ scaleId: 'blues', rootPc: 9 });
await settle();
board = await readBoard();
const flat5 = board.find((m) => m.degree === '♭5');
const five = board.find((m) => m.degree === '5');
check(
  'blues: ♭5 shares the 5th’s hue and gets a dashed ring, the 5th does not',
  flat5.fill === five.fill && flat5.dashed && !five.dashed,
);

await setScale({ scaleId: 'chromatic' });
await settle();
board = await readBoard();
check(
  'chromatic scale: twelve distinct hues',
  new Set(board.filter((m) => m.fret < 12).map((m) => m.fill)).size === 12,
);

// Colour-blind palette from Settings.
await setScale({ scaleId: 'minor-pentatonic', rootPc: 9 });
await settle();
const before = (await readBoard()).find((m) => m.string === 0 && m.fret === 5).fill;
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByLabel('Colour-blind-friendly scale colours').check();
await page.keyboard.press('Escape');
await settle();
const cb = (await readBoard()).find((m) => m.string === 0 && m.fret === 5).fill;
check(
  'settings: colour-blind palette changes the fills',
  before === '#dc2f3e' && cb === '#d55e00',
  `${before} → ${cb}`,
);
await store(() => window.__fluidfrets.store.getState().setPalette('rainbow'));

// ---------------------------------------------------------------- overlays
await setScale({
  rootPc: 0,
  scaleId: 'major',
  colourMode: false,
  overlay: { kind: 'triad', degree: 4 },
});
await settle();
board = await readBoard();
const ringed = new Set(board.filter((m) => m.overlay).map((m) => m.label));
check(
  'overlay: V triad of C major rings exactly G, B, D',
  [...ringed].sort().join('') === 'BDG',
  [...ringed].join(''),
);
check(
  'legend names the overlay',
  (await page.locator('.legend-overlay').textContent()).includes('V — G'),
);

await setScale({
  rootPc: 9,
  scaleId: 'natural-minor',
  overlay: { kind: 'scale', scaleId: 'blues' },
});
await settle();
board = await readBoard();
const blue = board.find((m) => m.label === 'E♭' || m.label === 'D♯');
check(
  'overlay: another scale on the same root rings its notes, even ones outside the scale',
  blue?.role === 'out' && blue.overlay,
);
await setScale({ hideOutOfScale: true });
await settle();
board = await readBoard();
check(
  'overlay: a ringed out-of-scale note survives “hide out-of-scale”',
  board.some((m) => m.role === 'out' && m.overlay),
);
await setScale({ hideOutOfScale: false });

// Changing to a scale with no diatonic chords drops a chord overlay.
await setScale({ overlay: { kind: 'triad', degree: 0 } });
await page
  .locator('label.field:has(span:text-is("Scale")) select')
  .selectOption('minor-pentatonic');
await settle();
check(
  'overlay: a chord overlay is dropped when the scale has no diatonic chords',
  (await store(() => window.__fluidfrets.store.getState().scaleSettings.overlay.kind)) === 'none',
);

// ---------------------------------------------------------------- spelling
await setScale({ rootPc: 5, scaleId: 'major', overlay: { kind: 'none' } });
await settle();
board = await readBoard();
const bb = board.find((m) => m.midi % 12 === 10 && m.role !== 'out');
check('spelling follows the key: B♭ in F major, not A♯', bb?.label === 'B♭', bb?.label);
await setScale({ rootPc: 2, scaleId: 'major' });
await settle();
board = await readBoard();
check(
  'spelling: D major has F♯ and C♯',
  board.find((m) => m.midi % 12 === 6 && m.role !== 'out')?.label === 'F♯' &&
    board.find((m) => m.midi % 12 === 1 && m.role !== 'out')?.label === 'C♯',
);

// ---------------------------------------------------------------- follows the tuning
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Open G', strings: [38, 43, 50, 55, 59, 62] });
});
await setScale({ rootPc: 7, scaleId: 'major' });
await settle();
board = await readBoard();
const gMajor = [7, 9, 11, 0, 2, 4, 6];
check(
  'retuning: roles follow the pitches (Open G, G major)',
  board.every((m) => (m.role === 'out') === !gMajor.includes(m.midi % 12)) &&
    board.filter((m) => m.string === 0 && m.fret === 0)[0]?.label === 'D',
);
await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.jumpToTuning({ ...s.tuning, name: 'Standard', strings: [40, 45, 50, 55, 59, 64] });
});

// ---------------------------------------------------------------- persistence
await setScale({ rootPc: 4, scaleId: 'dorian', colourMode: true });
await setPlayback({ tempo: 133, direction: 'updown', range: 'two-octaves', position: 5 });
await store(() => window.__fluidfrets.store.getState().setPalette('colourblind'));
await sleep(200);
await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
const restored = await store(() => {
  const s = window.__fluidfrets.store.getState();
  return { mode: s.mode, scale: s.scaleSettings, playback: s.playback, palette: s.palette };
});
check(
  'settings persist across a reload (mode, scale, colours, playback, palette)',
  restored.mode === 'scale' &&
    restored.scale.rootPc === 4 &&
    restored.scale.scaleId === 'dorian' &&
    restored.scale.colourMode &&
    restored.playback.tempo === 133 &&
    restored.playback.position === 5 &&
    restored.palette === 'colourblind',
  JSON.stringify(restored),
);
await page.evaluate(() =>
  localStorage.setItem(
    'fluid-frets-settings',
    JSON.stringify({
      state: {
        mode: 'scale',
        scaleSettings: { rootPc: 99, scaleId: 'bogus' },
        playback: { tempo: 'fast' },
        palette: 7,
      },
      version: 1,
    }),
  ),
);
await page.reload();
await page.waitForFunction(() => window.__fluidfrets);
const junk = await store(() => window.__fluidfrets.store.getState().scaleSettings);
check(
  'junk in storage falls back to defaults instead of crashing',
  junk.scaleId === 'major' && junk.rootPc === 0,
);
await setPlayback({ tempo: 100, direction: 'up', range: 'octave', position: 'auto' });
await setScale({ colourMode: false });
await store(() => window.__fluidfrets.store.getState().setPalette('rainbow'));

// ---------------------------------------------------------------- playback
await store(() => {
  const engine = window.__fluidfrets.audioEngine;
  window.__plucks = [];
  const real = engine.pluck.bind(engine);
  if (!engine.__patched) {
    engine.__patched = true;
    engine.pluck = (string, midi, opts) => {
      window.__plucks.push({ string, midi, ...opts, at: performance.now() });
      return real(string, midi, opts);
    };
  }
  window.__heard = [];
  window.__soundingDom = [];
  window.__fluidfrets.store.subscribe((s, prev) => {
    if (s.playhead !== prev.playhead) {
      const ctx = engine.context;
      const latency = ctx.outputLatency || ctx.baseLatency || 0;
      window.__heard.push({ playhead: s.playhead, clock: ctx.currentTime, latency });
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-sounding]');
        window.__soundingDom.push(
          el && { string: Number(el.dataset.string), fret: Number(el.dataset.fret) },
        );
      });
    }
  });
});
await marker(1, 0).click(); // make sure audio is unlocked and running
await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running');
await setScale({ rootPc: 4, scaleId: 'minor-pentatonic' });
await setPlayback({ tempo: 150, range: 'octave', direction: 'up', position: 'auto' });
await sleep(700);
await store(() => (window.__plucks = []) && (window.__heard = []) && (window.__soundingDom = []));
const playButton = page.getByRole('button', { name: /Play/ });
await playButton.click();
check(
  'play button becomes a Stop button while playing',
  (await page.getByRole('button', { name: /Stop/ }).getAttribute('aria-pressed')) === 'true',
);
await page.waitForFunction(() => !window.__fluidfrets.store.getState().playing, null, {
  timeout: 8000,
});
await sleep(150);
const run = await store(() => ({
  plucks: window.__plucks,
  heard: window.__heard,
  dom: window.__soundingDom,
}));
const expectedMidi = [40, 43, 45, 47, 50, 52];
check(
  'playback: E minor pentatonic, one octave, sounds E G A B D E',
  JSON.stringify(run.plucks.map((p) => p.midi)) === JSON.stringify(expectedMidi),
  run.plucks.map((p) => p.midi).join(' '),
);
check(
  'playback: notes are fingered in first position on the lowest strings',
  JSON.stringify(run.plucks.map((p) => [p.string, p.midi - [40, 45, 50, 55, 59, 64][p.string]])) ===
    JSON.stringify([
      [0, 0],
      [0, 3],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2],
    ]),
);
const gaps = run.plucks.slice(1).map((p, i) => p.when - run.plucks[i].when);
check(
  'playback: notes are scheduled on the audio clock at the tempo (150 BPM eighths = 0.2 s)',
  gaps.every((g) => Math.abs(g - 0.2) < 0.002),
  gaps.map((g) => g.toFixed(4)).join(' '),
);
const heardSteps = run.heard.filter((h) => h.playhead);
check(
  'playback: the highlight visits every note in order',
  JSON.stringify(heardSteps.map((h) => [h.playhead.string, h.playhead.fret])) ===
    JSON.stringify(run.plucks.map((p) => [p.string, p.midi - [40, 45, 50, 55, 59, 64][p.string]])),
);
const lag = heardSteps.map((h, i) => h.clock - h.latency - run.plucks[i].when);
check(
  'playback: each highlight lands within one frame or two of its sound (sync)',
  lag.every((l) => l >= -0.002 && l < 0.06),
  lag.map((l) => (l * 1000).toFixed(0) + 'ms').join(' '),
);
check(
  'playback: the marker is outlined as sounding while its note plays',
  run.dom.filter(Boolean).length >= 5,
  JSON.stringify(run.dom),
);
check(
  'playback: highlight clears and the button resets at the end',
  (await store(() => window.__fluidfrets.store.getState().playhead)) === null &&
    (await page.getByRole('button', { name: /Play/ }).count()) === 1,
);

async function planFor(over) {
  await setPlayback(over);
  await store(() => (window.__plucks = []));
  await page.getByRole('button', { name: /Play/ }).click();
  await page.waitForFunction(() => !window.__fluidfrets.store.getState().playing, null, {
    timeout: 20000,
  });
  return store(() => window.__plucks);
}
await setPlayback({ tempo: 240 });
let p = await planFor({ direction: 'down', range: 'octave' });
check(
  'playback: descending reverses the notes',
  JSON.stringify(p.map((n) => n.midi)) === JSON.stringify([...expectedMidi].reverse()),
  p.map((n) => n.midi).join(' '),
);
p = await planFor({ direction: 'updown' });
check(
  'playback: up-and-down does not repeat the top note',
  p.length === 11 && p[5].midi === 52 && p[6].midi === 50,
  p.map((n) => n.midi).join(' '),
);
p = await planFor({ direction: 'up', range: 'two-octaves' });
check(
  'playback: two octaves spans 24 semitones',
  p.at(-1).midi - p[0].midi === 24 && p.length === 11,
  `${p.length} notes`,
);
p = await planFor({ range: 'neck' });
check(
  'playback: whole neck runs from the open low E to the highest scale note',
  p[0].midi === 40 && p.at(-1).midi === 86 && p.length === 20,
  `${p.length} notes, ${p[0].midi}…${p.at(-1).midi}`,
);
p = await planFor({ range: 'octave', position: 5 });
check(
  'playback: a chosen position keeps notes in its five-fret window',
  p.every((n) => {
    const fret = n.midi - [40, 45, 50, 55, 59, 64][n.string];
    return fret >= 5 && fret <= 9;
  }),
  p.map((n) => n.midi - [40, 45, 50, 55, 59, 64][n.string]).join(' '),
);

// Stop, and leaving scale mode.
await setPlayback({ range: 'neck', position: 'auto', tempo: 100 });
await store(() => (window.__plucks = []));
await page.getByRole('button', { name: /Play/ }).click();
await sleep(700);
await page.getByRole('button', { name: /Stop/ }).click();
const atStop = (await store(() => window.__plucks)).length;
await sleep(800);
const later = (await store(() => window.__plucks)).length;
check(
  'stop: playback halts (at most the note already queued sounds)',
  later - atStop <= 1 && !(await store(() => window.__fluidfrets.store.getState().playing)),
  `${atStop} → ${later}`,
);
await page.getByRole('button', { name: /Play/ }).click();
await sleep(400);
await page.getByRole('tab', { name: 'Explore' }).click();
const atLeave = (await store(() => window.__plucks)).length;
await sleep(700);
check(
  'switching to Explore stops playback and removes scale styling',
  (await store(() => window.__plucks)).length - atLeave <= 1 &&
    !(await store(() => window.__fluidfrets.store.getState().playing)) &&
    (await readBoard()).every((m) => m.role === null),
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
