/**
 * Drives the Phase 3 "Done when" flow end to end (PLAN.md §7 Phase 3): builds a short progression
 * with a 7th, a sus4, an inversion and a borrowed chord, clicks "Explore guitar voicings", checks
 * the guitar module opens with the same chord selected, checks each progression-strip block shows
 * exactly its own chord's tones on the neck, and checks a capo/tuning change redraws the neck
 * correctly while keeping the tool's own persisted tuning untouched.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/song-guitar-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);
const hash = () => page.evaluate(() => location.hash);
// wouter's hash-location navigate() puts a query string it's given into the real `location.search`
// (not inside the hash) — SongView's `useSearch()` reads it from there either way, so this is what
// to check for "the URL carries the focused event", not `location.hash`.
const href = () => page.evaluate(() => location.href);

const readBoard = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.markers [data-string]')].map((g) => ({
      string: Number(g.dataset.string),
      fret: Number(g.dataset.fret),
      midi: Number(g.dataset.midi),
      role: g.dataset.role ?? null,
      muted: g.hasAttribute('data-muted'),
      // Drawn area, not `r`: roots are squares (no radius attribute).
      r: ((el) => { if (!el) return NaN; const b = el.getBBox(); return el.tagName === 'rect' ? b.width * b.height : Math.PI * (b.width / 2) ** 2; })(g.querySelector('.marker-dot')),
    })),
  );
/** The set of pitch classes lit as a chord tone (root or other tone), ignoring the muted ✕. */
const litPcs = async () =>
  [...new Set((await readBoard()).filter((m) => m.role && m.role !== 'out' && !m.muted).map((m) => ((m.midi % 12) + 12) % 12))].sort(
    (a, b) => a - b,
  );

// The four "Done when" chords (PLAN.md §7 Phase 3), plain ChordRef objects built the same way the
// progression module's own theory engine would — origin/numeral are cosmetic here, only the notes
// and the flavor/bass matter for what the guitar module draws.
const CHORDS = [
  {
    label: 'a dominant 7th (G7)',
    chord: { root: 'G', quality: 'maj', seventh: 'dom7', flavor: '7', origin: 'diatonic', numeral: 'V7' },
    pcs: [2, 5, 7, 11], // D F G B
  },
  {
    label: 'a sus4 (Gsus4)',
    chord: { root: 'G', quality: 'maj', seventh: 'maj7', flavor: 'sus4', origin: 'diatonic', numeral: 'Vsus4' },
    pcs: [0, 2, 7], // C D G
  },
  {
    label: 'an inversion (C/E, first inversion)',
    chord: { root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', bass: 'E', origin: 'diatonic', numeral: 'I6' },
    pcs: [0, 4, 7], // C E G
  },
  {
    label: 'a borrowed chord (Fm, iv borrowed from the parallel minor)',
    chord: { root: 'F', quality: 'min', seventh: 'min7', flavor: 'triad', origin: 'borrowed', numeral: 'iv' },
    pcs: [0, 5, 8], // F Ab C
  },
];

// ---------------------------------------------------------------- build the progression
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForFunction(() => location.hash.startsWith('#/song/'));
await page.waitForSelector('[aria-label="Chord map"]');

const eventIds = await page.evaluate((chords) => {
  for (const chord of chords) window.__songwriting.store.getState().addChord(chord);
  return window.__songwriting.store.getState().song.sections[0].events.map((e) => e.id);
}, CHORDS.map((c) => c.chord));
check('the progression has all four chords', eventIds.length === 4, eventIds.join(','));

const songId = (await hash()).match(/#\/song\/([^/]+)\//)[1];

// ---------------------------------------------------------------- Explore guitar voicings
await page.getByRole('button', { name: /^Chord: G7,/ }).click();
await sleep(100);
await page.getByRole('button', { name: 'Explore guitar voicings' }).click();
await page.waitForFunction(() => location.hash.includes('/guitar'));
await page.waitForSelector('.fretboard-svg');
check(
  'clicking "Explore guitar voicings" opens the guitar module, carrying the chosen event',
  (await hash()).includes('/guitar') && (await href()).includes(`event=${encodeURIComponent(eventIds[0])}`),
  `${await hash()} ${await href()}`,
);
await sleep(200);
const focusedId = await page.evaluate(() => window.__fluidfrets.store.getState().progressionEventId);
check('the guitar module focuses the same chord', focusedId === eventIds[0], focusedId);
check(
  'and the neck shows exactly that chord\'s tones (G7: D F G B)',
  JSON.stringify(await litPcs()) === JSON.stringify(CHORDS[0].pcs),
  JSON.stringify(await litPcs()),
);
check(
  '"Progression chord" mode: no non-chord notes are drawn (hideOthers forced on)',
  (await readBoard()).every((m) => m.role !== 'out'),
);
const rootMark = (await readBoard()).find((m) => m.role === 'tonic' && !m.muted);
const toneMark = (await readBoard()).find((m) => m.role === 'scale' && !m.muted);
check(
  'the root draws with extra emphasis (bigger than a plain chord tone)',
  !!rootMark && !!toneMark && rootMark.r > toneMark.r,
  `${rootMark?.r} vs ${toneMark?.r}`,
);
const look = await page.evaluate(() => {
  const gs = [...document.querySelectorAll('.markers [data-string]')].filter((g) => !g.hasAttribute('data-muted'));
  const roots = gs.filter((g) => g.dataset.role === 'tonic');
  return {
    rootsSquare: roots.length > 0 && roots.every((g) => g.querySelector('.marker-dot')?.tagName === 'rect'),
    tonesRound: gs.filter((g) => g.dataset.role === 'scale').every((g) => g.querySelector('.marker-dot')?.tagName === 'circle'),
    shape: gs.filter((g) => g.hasAttribute('data-shape')).length,
    shapeDimmed: gs.filter((g) => g.hasAttribute('data-shape') && g.hasAttribute('data-dimmed')).length,
    othersUndimmed: gs.filter((g) => !g.hasAttribute('data-shape') && !g.hasAttribute('data-dimmed')).length,
    shapeRinged: gs.filter((g) => g.hasAttribute('data-shape') && g.querySelector('g[fill="none"] circle')).length,
  };
});
check('roots are squares, other chord tones circles', look.rootsSquare && look.tonesRound, JSON.stringify(look));
check(
  'the fingering stands out by dimming every other note (no ring)',
  look.shape > 0 && look.shapeDimmed === 0 && look.othersUndimmed === 0 && look.shapeRinged === 0,
  JSON.stringify(look),
);

// ---------------------------------------------------------------- progression strip
const stripLabels = await page.locator('.strip-chord').allTextContents();
check('the strip shows all four chords in order', stripLabels.length === 4, stripLabels.join(' | '));

for (let i = 0; i < CHORDS.length; i++) {
  const { label, pcs } = CHORDS[i];
  await page.locator('.strip-chord').nth(i).click();
  await sleep(150);
  check(`strip block ${i + 1} (${label}) shows exactly its tones`, JSON.stringify(await litPcs()) === JSON.stringify(pcs), JSON.stringify(await litPcs()));
  const pressed = await page.locator('.strip-chord').nth(i).getAttribute('aria-pressed');
  check(`strip block ${i + 1} is highlighted as selected`, pressed === 'true');
}

// ---------------------------------------------------------------- capo and tuning
await page.locator('.strip-chord').first().click();
await sleep(100);
const beforeCapo = await page.evaluate(() => document.querySelectorAll('[data-capo-bar]').length);
check('no capo bar before a capo is set', beforeCapo === 0);

await page.locator('label.field:has(span:text-is("Capo")) select').selectOption('2');
await sleep(150);
check('a capo bar appears', (await page.evaluate(() => document.querySelectorAll('[data-capo-bar]').length)) === 1);
const dim = await page.evaluate(() => {
  const r = document.querySelector('[data-capo-dim]');
  return r && { width: Number(r.getAttribute('width')), opacity: Number(r.getAttribute('opacity')) };
});
check('the frets behind the capo are dimmed', !!dim && dim.width > 0 && dim.opacity > 0 && dim.opacity < 1, JSON.stringify(dim));
check('a "Capo N" label is shown', (await page.getByText('Capo 2').count()) >= 1);
check(
  'the neck redraws: the focused chord still shows exactly its tones with the capo on',
  JSON.stringify(await litPcs()) === JSON.stringify(CHORDS[0].pcs),
  JSON.stringify(await litPcs()),
);

const beforeTuning = await page.evaluate(() => window.__songwriting.store.getState().song.guitar.tuning);
await page.locator('label.field:has(span:text-is("Tuning")) select').selectOption('drop-d');
await sleep(150);
const afterTuning = await page.evaluate(() => window.__songwriting.store.getState().song.guitar.tuning);
check(
  "changing the tuning changes the song's tuning in the song store",
  JSON.stringify(afterTuning) !== JSON.stringify(beforeTuning) && JSON.stringify(afterTuning) === JSON.stringify([38, 45, 50, 55, 59, 64]),
  JSON.stringify(afterTuning),
);
check(
  'the neck redraws for the new tuning (still exactly the focused chord\'s tones)',
  JSON.stringify(await litPcs()) === JSON.stringify(CHORDS[0].pcs),
  JSON.stringify(await litPcs()),
);

const toolSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('sw:guitar-settings') ?? '{}'));
const toolTuningStrings = toolSettings?.state?.toolTuning?.strings;
check(
  "the tool's own persisted tuning did not change",
  JSON.stringify(toolTuningStrings ?? [40, 45, 50, 55, 59, 64]) === JSON.stringify([40, 45, 50, 55, 59, 64]),
  JSON.stringify(toolTuningStrings),
);

// ---------------------------------------------------------------- tool mode still works, apart from the capo
await page.goto(`${url.split('#')[0]}?debug#/tools/guitar`);
await page.waitForSelector('.fretboard-svg');
check(
  "tool mode opens with its own tuning (not the song's Drop D)",
  JSON.stringify(await page.evaluate(() => window.__fluidfrets.store.getState().tuning.strings)) === JSON.stringify([40, 45, 50, 55, 59, 64]),
);
check('tool mode has its own capo, starting at 0', (await page.evaluate(() => window.__fluidfrets.store.getState().capo)) === 0);
check('no capo bar in tool mode by default', (await page.evaluate(() => document.querySelectorAll('[data-capo-bar]').length)) === 0);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
