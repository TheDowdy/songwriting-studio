/**
 * Drives PLAN.md §7 Phase 6's "Done when": starting from an empty song, build, voice and play a
 * progression without leaving the guitar module, and the result is identical in the progression
 * module. Covers every strip action (Flavour, Inversion, Replace, Beats ±, Duplicate, Remove, Add
 * after, drag to reorder, section add/rename/duplicate) and guitar-module playback (the notes
 * strummed, and the neck following the chord you hear).
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/guitar-build-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);
const stripNames = () => page.locator('.progression-strip [data-chord-name]').allTextContents();
const song = () => page.evaluate(() => window.__songwriting.store.getState().song);
const choose = async (testId, name) => {
  await page
    .getByTestId(testId)
    .locator('.choice-chip')
    .filter({ has: page.locator('.choice-chip-name', { hasText: new RegExp(`^${name}$`) }) })
    .first()
    .click();
  await sleep(200);
};
const block = (name) =>
  page
    .locator('.progression-strip button[aria-label^="Chord:"]')
    .filter({ has: page.locator('[data-chord-name]', { hasText: new RegExp(`^${name}$`) }) })
    .first();
const toolbarButton = (name) => page.locator('.strip-toolbar').getByRole('button', { name, exact: true });

// ---------------------------------------------------------------- an empty song, straight to guitar
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await sleep(200);
check('an empty song offers chords to start with', (await page.getByTestId('choices-add').count()) === 1);

// ---------------------------------------------------------------- build: C → G → Am → F
await choose('choices-add', 'C');
await toolbarButton('+ Add after').click();
await choose('choices-add', 'G');
await choose('choices-add', 'Am');
await choose('choices-add', 'F');
check('four chords added, each after the last', JSON.stringify(await stripNames()) === '["C","G","Am","F"]', JSON.stringify(await stripNames()));
check('the chord just added is focused', (await page.getByTestId('progression-chord-header').textContent()).includes('F'));

// ---------------------------------------------------------------- voice: commit G, change its flavour, re-fit
await block('G').click();
await sleep(150);
await page.getByRole('button', { name: 'Use this voicing', exact: true }).click();
await sleep(100);
await toolbarButton('Flavour').click();
await page.getByTestId('flavour-panel').locator('.chip', { hasText: /^7 \(♭7\)$/ }).click();
await sleep(200);
check('Flavour turns G into G7', (await stripNames()).includes('G7'), JSON.stringify(await stripNames()));
check('…and flags G’s committed voicing as stale', (await page.locator('.progression-strip button[data-stale]').count()) === 1);
await page.getByTestId('stale-voicing').getByRole('button', { name: 'Re-fit', exact: true }).click();
await sleep(200);
check('Re-fit fixes it', (await page.locator('.progression-strip button[data-stale]').count()) === 0);

// ---------------------------------------------------------------- inversion, replace, beats, duplicate, remove
await block('C').click();
await sleep(150);
await toolbarButton('Inversion').click();
await page.locator('.strip-toolbar').getByRole('group', { name: 'Inversion' }).getByRole('button', { name: '1st' }).click();
await sleep(200);
check('Inversion makes C a first-inversion C/E', (await stripNames()).includes('C/E'), JSON.stringify(await stripNames()));

await block('Am').click();
await sleep(150);
await toolbarButton('Replace').click();
await choose('choices-replace', 'Em');
check('Replace swaps Am for Em', JSON.stringify(await stripNames()) === '["C/E","G7","Em","F"]', JSON.stringify(await stripNames()));

await block('F').click();
await sleep(150);
await page.getByRole('button', { name: 'One beat shorter' }).click();
await page.getByRole('button', { name: 'One beat shorter' }).click();
await sleep(100);
const fBeats = (await song()).sections[0].events.find((e) => e.chord.root === 'F').beats;
check('Beats − shortens F to 2 beats', fBeats === 2, String(fBeats));

await toolbarButton('Duplicate').click();
await sleep(200);
check('Duplicate adds a second F', (await stripNames()).filter((n) => n === 'F').length === 2);
await toolbarButton('Remove').click();
await sleep(200);
check('Remove takes it away again', JSON.stringify(await stripNames()) === '["C/E","G7","Em","F"]', JSON.stringify(await stripNames()));

// ---------------------------------------------------------------- drag to reorder (keyboard drag)
// A keyboard user arrives by keyboard: any key other than Space tells the space bar shortcut that
// the keyboard, not the mouse, is driving focus, so Space then picks the block up instead of
// starting playback.
await page.keyboard.press('Tab');
await block('Em').focus();
await page.keyboard.press('Space');
await sleep(150);
await page.keyboard.press('ArrowLeft');
await sleep(150);
await page.keyboard.press('Space');
await sleep(300);
check('dragging Em one place left reorders the section', JSON.stringify(await stripNames()) === '["C/E","Em","G7","F"]', JSON.stringify(await stripNames()));

// ---------------------------------------------------------------- sections: add, first chord, rename, duplicate
await page.getByRole('button', { name: '+ Section' }).click();
await sleep(200);
await choose('choices-add', 'Am');
const afterAdd = await song();
check('+ Section adds a section and its first chord', afterAdd.sections.length === 2 && afterAdd.sections[1].events.length === 1);
await page.locator('.progression-strip input[aria-label="Section name"]').nth(1).fill('Chorus');
await page.keyboard.press('Enter');
await sleep(150);
check('renaming a section in place', (await song()).sections[1].name === 'Chorus');
await page.getByRole('button', { name: 'Section actions for Verse', exact: true }).click();
await page.getByRole('button', { name: 'Duplicate section' }).first().click();
await sleep(200);
const afterDup = await song();
check('duplicating a section adds a copy to the arrangement', afterDup.sections.length === 3 && afterDup.arrangement.length === 3);

// ---------------------------------------------------------------- play: exactly these notes, the neck in step
await page.evaluate(() => {
  window.__songwriting.store.getState().setBpm(300); // a quick run-through
  window.__plucks = [];
  window.__heard = [];
  const engine = window.__fluidfrets.audioEngine;
  const real = engine.pluck.bind(engine);
  engine.pluck = (string, midi, opts) => {
    window.__plucks.push({ string, midi });
    return real(string, midi, opts);
  };
  window.__fluidfrets.store.subscribe((s, prev) => {
    if (s.progressionPlaying && s.progressionEventId !== prev.progressionEventId) window.__heard.push(s.progressionEventId);
  });
});
if ((await page.getByRole('switch', { name: 'Loop' }).getAttribute('aria-checked')) === 'true') await page.getByRole('switch', { name: 'Loop' }).click();
await block('F').click(); // in the Verse; playback starts on C/E, so every chord change is seen
await sleep(400);
await page.evaluate(() => {
  window.__plucks = [];
  window.__heard = [];
});
await page.getByRole('radio', { name: 'This section' }).click();
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.waitForFunction(() => !window.__fluidfrets.store.getState().progressionPlaying, null, { timeout: 15000 });
const played = await page.evaluate(() => window.__plucks.map((p) => `${p.string}:${p.midi}`));
const expected = await page.evaluate(() => {
  const s = window.__songwriting.store.getState().song;
  const verse = s.sections[0].id;
  return window.__fluidfrets.progressionStrikes(s, verse).strikes.flatMap((k) => k.notes.map((n) => `${n.string}:${n.midi}`));
});
check('"Play section" strums exactly the voicings the strip shows', JSON.stringify(played) === JSON.stringify(expected), `${played.length} notes vs ${expected.length}`);
const heard = await page.evaluate(() => window.__heard);
const verseIds = (await song()).sections[0].events.map((e) => e.id);
check('the neck follows each chord as it is heard', JSON.stringify(heard) === JSON.stringify(verseIds), `${heard.length} of ${verseIds.length}`);
const g7 = (await song()).sections[0].events.find((e) => e.chord.seventh === 'dom7');
const g7Notes = g7.attachments.guitar.frets.flatMap((f, s) => (f === null ? [] : [`${s}:${g7.attachments.guitar.tuning[s] + g7.attachments.guitar.capo + f}`]));
check('…including G7’s committed (re-fitted) shape, note for note', g7Notes.every((n) => played.includes(n)), g7Notes.join(' '));

// ---------------------------------------------------------------- identical in the progression module
const guitarView = { names: await stripNames(), sections: await page.locator('.progression-strip input[aria-label="Section name"]').evaluateAll((els) => els.map((e) => e.value)) };
await page.getByRole('tab', { name: 'Chords' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
await sleep(200);
const timelineNames = await page.locator('.timeline-scroll > li button[aria-label^="Chord:"] > span:first-child').allTextContents();
check(
  'the progression module shows the same chords, in the same order',
  JSON.stringify(timelineNames) === JSON.stringify(guitarView.names),
  `${JSON.stringify(timelineNames)} vs ${JSON.stringify(guitarView.names)}`,
);
check('…and the renamed section', (await page.getByRole('region', { name: 'Section: Chorus' }).count()) + (await page.locator('[aria-label="Section: Chorus"]').count()) > 0);
check(
  '…and G7’s committed voicing as a diagram',
  (await page.getByRole('button', { name: /^Chord: G7,/ }).first().locator('[data-testid=block-diagram]').count()) === 1,
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
