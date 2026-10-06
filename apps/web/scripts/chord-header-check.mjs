/**
 * Drives the chord-focus header above the neck (owner request: list the notes of whatever chord
 * is selected) in headless Chrome: which tab/overlay shows it, its name/label/notes, its diagram,
 * and that it never causes horizontal overflow. Usage:
 * URL=http://localhost:5173/?debug node scripts/chord-header-check.mjs
 */
import { chromium } from 'playwright-core';

const base = process.env.URL ?? 'http://localhost:5173/?debug';
const toolUrl = `${base}#/tools/guitar`;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(toolUrl);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);
const store = (fn, arg) => page.evaluate(fn, arg);
const settle = () => sleep(150);

const headerCount = () => page.locator('.chord-header').count();
const name = () => page.getByTestId('chord-header-name').textContent();
const notes = () =>
  page.locator('.chord-header-note').evaluateAll((els) =>
    els.map((el) => ({
      name: el.querySelector('.chord-header-note-name')?.textContent,
      interval: el.querySelector('.chord-header-note-interval')?.textContent,
    })),
  );
const noteNames = async () => (await notes()).map((n) => n.name);
const diagramFrets = () =>
  page.evaluate(() => {
    const svg = document.querySelector('.chord-header .chord-diagram');
    return svg?.getAttribute('aria-label') ?? null;
  });

// ---------------------------------------------------------------- default tab (Explore removed)
await store(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));
check(
  'tool mode opens on the Scales tab by default, with no header (no chord overlay)',
  (await page.getByRole('tab', { name: 'Scales' }).getAttribute('aria-selected')) === 'true' &&
    (await headerCount()) === 0,
);

// ---------------------------------------------------------------- Scales tab
await page.getByRole('tab', { name: 'Scales' }).click();
await settle();
check('Scales tab, no overlay: no header', (await headerCount()) === 0);

await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.setAccidentalPref('flat');
  s.setChordSpec({
    rootPc: 10,
    quality: 'major',
    seventh: 'none',
    extension: 'none',
    alterations: [],
    added: [],
    omit3: false,
    omit5: false,
    bassPc: null,
  });
  s.setScaleSettings({ rootPc: 0, scaleId: 'major', overlay: { kind: 'chord' } });
});
await settle();
check(
  'Scales tab, "Chord from the Chords tab" (B♭ over C major, flats): shows "B♭"',
  (await name()) === 'B♭',
  await name(),
);
check(
  'and exactly the notes B♭, D, F',
  JSON.stringify(await noteNames()) === JSON.stringify(['B♭', 'D', 'F']),
  JSON.stringify(await noteNames()),
);
check('with a diagram', (await diagramFrets()) !== null, String(await diagramFrets()));

await store(() => {
  window.__fluidfrets.store.getState().setScaleSettings({ overlay: { kind: 'triad', degree: 4 } });
});
await settle();
check(
  'a triad on degree V of C major: shows "G" labelled "V"',
  (await name()) === 'G' && (await page.locator('.chord-header-label').textContent()) === 'V',
  `${await name()} ${await page.locator('.chord-header-label').textContent()}`,
);
check(
  'with G, B, D',
  JSON.stringify(await noteNames()) === JSON.stringify(['G', 'B', 'D']),
  JSON.stringify(await noteNames()),
);

await store(() => {
  window.__fluidfrets.store.getState().setScaleSettings({ overlay: { kind: 'scale', scaleId: 'blues' } });
});
await settle();
check('a scale-on-scale overlay is not a chord: no header', (await headerCount()) === 0);

await store(() => {
  const s = window.__fluidfrets.store.getState();
  s.setScaleSettings({ overlay: { kind: 'none' } });
  s.setAccidentalPref('sharp');
});

// ---------------------------------------------------------------- Chords tab (tool mode)
await page.getByRole('tab', { name: 'Voicings' }).click();
await settle();
check('Chords tab (tool mode): the header shows the builder’s chord', (await headerCount()) === 1);
const builderName = await name();
const builderNotes = await noteNames();
const panelName = await page.getByTestId('chord-name').textContent();
const panelNotes = (await page.getByTestId('chord-notes').textContent()).replace(/^\s*Notes\s*/, '');
check(
  'and its notes, matching the panel below',
  builderName === panelName && builderNotes.join(' ') === panelNotes.trim(),
  `${builderName} (${builderNotes.join(' ')}) vs ${panelName} (${panelNotes})`,
);
const headerFrets = await page.evaluate(() => {
  const svg = document.querySelector('.chord-header .chord-diagram');
  return svg?.getAttribute('aria-label');
});
const panelFrets = await page.getByTestId('shape-text').textContent();
check(
  'the diagram matches the selected voicing (compare frets)',
  headerFrets === panelFrets,
  `${headerFrets} vs ${panelFrets}`,
);
// Step to another voicing and check the header diagram follows it.
await page.getByRole('button', { name: /Next/ }).click();
await settle();
const headerFrets2 = await page.evaluate(
  () => document.querySelector('.chord-header .chord-diagram')?.getAttribute('aria-label'),
);
const panelFrets2 = await page.getByTestId('shape-text').textContent();
check(
  'stepping to another voicing updates the header diagram to match',
  headerFrets2 === panelFrets2 && headerFrets2 !== headerFrets,
  `${headerFrets2} vs ${panelFrets2}`,
);

// ---------------------------------------------------------------- song context (G7)
await page.goto(base);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForFunction(() => location.hash.startsWith('#/song/'));
await page.waitForSelector('[aria-label="Chord map"]');
await store(() => {
  window.__songwriting.store.getState().addChord({
    root: 'G',
    quality: 'maj',
    seventh: 'dom7',
    flavor: '7',
    origin: 'diatonic',
    numeral: 'V7',
  });
});
await page.getByRole('button', { name: /^Chord: G7,/ }).click();
await sleep(100);
await page.getByRole('button', { name: 'Explore guitar voicings' }).click();
await page.waitForSelector('.fretboard-svg');
await settle();
check(
  'song context: after "Explore guitar voicings" on a G7, shows "G7"',
  (await name()) === 'G7',
  await name(),
);
check(
  'with notes G, B, D, F',
  JSON.stringify(await noteNames()) === JSON.stringify(['G', 'B', 'D', 'F']),
  JSON.stringify(await noteNames()),
);
check(
  'and a secondary label naming the progression numeral',
  (await page.locator('.chord-header-label').textContent()) === 'from the progression: V7',
  await page.locator('.chord-header-label').textContent(),
);

// ---------------------------------------------------------------- Identify tab
await page.getByRole('tab', { name: 'Identify' }).click();
await settle();
check('Identify tab, nothing picked: no header', (await headerCount()) === 0);
await page.locator('[data-string="1"][data-fret="3"]').click();
await page.locator('[data-string="2"][data-fret="2"]').click();
await page.locator('[data-string="3"][data-fret="0"]').click();
await page.locator('[data-string="4"][data-fret="1"]').click();
await page.locator('[data-string="5"][data-fret="0"]').click();
await settle();
check(
  'Identify tab: once notes are picked, the header shows the identified chord',
  (await name()) === (await page.getByTestId('identify-name').textContent()),
  await name(),
);
check('with a diagram', (await headerCount()) === 1 && (await diagramFrets()) !== null);
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await settle();
check('clearing the picks hides the header again', (await headerCount()) === 0);

// ---------------------------------------------------------------- no horizontal overflow at 390px
//
// The default tab (Scales, no chord header at all) already has a few px of horizontal overflow at
// 390px wide from the toolbar, unrelated to this feature and pre-existing on `phase-3` before it —
// see the "Decisions I made" note in the handoff report. So the bar here is that showing the header
// adds nothing to that baseline, which is what "must not cause horizontal page overflow" means for
// work scoped to the header.
const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
const narrowPage = await narrow.newPage();
const narrowErrors = [];
narrowPage.on('pageerror', (e) => narrowErrors.push(e.message));
narrowPage.on('console', (m) => m.type() === 'error' && narrowErrors.push(m.text()));
await narrowPage.goto(toolUrl);
await narrowPage.waitForTimeout(200);
const baseline390 = await narrowPage.evaluate(() => document.documentElement.scrollWidth);

await narrowPage.getByRole('tab', { name: 'Voicings' }).click();
await narrowPage.waitForTimeout(200);
const chordsWidth390 = await narrowPage.evaluate(() => document.documentElement.scrollWidth);
check(
  'the chord header adds no horizontal overflow at 390px wide (Chords tab)',
  chordsWidth390 <= baseline390,
  `baseline ${baseline390}px, with header ${chordsWidth390}px`,
);

await narrowPage.evaluate(() => {
  const s = window.__fluidfrets.store.getState();
  s.setAccidentalPref('flat');
  s.setChordSpec({
    rootPc: 10,
    quality: 'major',
    seventh: 'none',
    extension: 'none',
    alterations: [],
    added: [],
    omit3: false,
    omit5: false,
    bassPc: null,
  });
});
await narrowPage.getByRole('tab', { name: 'Scales' }).click();
await narrowPage.evaluate(() => {
  window.__fluidfrets.store
    .getState()
    .setScaleSettings({ rootPc: 0, scaleId: 'major', overlay: { kind: 'chord' } });
});
await narrowPage.waitForTimeout(200);
const scalesWidth390 = await narrowPage.evaluate(() => document.documentElement.scrollWidth);
check(
  'the chord header adds no horizontal overflow at 390px wide (Scales tab, chord overlay)',
  scalesWidth390 <= baseline390,
  `baseline ${baseline390}px, with header ${scalesWidth390}px`,
);
check('no console or page errors on the narrow page', narrowErrors.length === 0, narrowErrors.join(' | '));
await narrow.close();

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
