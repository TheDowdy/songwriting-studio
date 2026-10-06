/**
 * Drives PLAN.md §7 Phase 5's "Done when": a song edited in the guitar module shows its diagrams
 * and rich chord names in the progression module, plays those exact notes on guitar, and the MIDI
 * file contains them. Also covers each item: timeline mini diagrams and stale badges (item 1), the
 * chord detail's Guitar view ("Your voicing" / the suggested default, item 2), guitar playback of
 * committed voicings (item 3), and the Flavor picker's "More…" rich options (item 4).
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/song-voicings-check.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import toneMidi from '@tonejs/midi';

const { Midi } = toneMidi;
const url = process.env.URL ?? 'http://localhost:5173/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);
const STANDARD = [40, 45, 50, 55, 59, 64];
const shapeText = (frets) => frets.map((f) => (f === null ? 'x' : String(f))).join('-');
/** Sounding MIDI notes of a committed voicing, low string first. */
const notesOf = (v) => v.frets.flatMap((f, s) => (f === null ? [] : [v.tuning[s] + v.capo + f]));
const eventOf = (id) =>
  page.evaluate((eventId) => window.__songwriting.store.getState().song.sections[0].events.find((e) => e.id === eventId), id);
const block = (name) => page.getByRole('button', { name: new RegExp(`^Chord: ${name},`) });
const sameNotes = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

const C = { root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'I' };
const Am = { root: 'A', quality: 'min', seventh: 'min7', flavor: 'triad', origin: 'diatonic', numeral: 'vi' };
const G7 = { root: 'G', quality: 'maj', seventh: 'dom7', flavor: '7', origin: 'diatonic', numeral: 'V7' };

// ---------------------------------------------------------------- a song with two committed voicings
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
const [cId, amId, g7Id] = await page.evaluate((chords) => {
  for (const c of chords) window.__songwriting.store.getState().addChord(c);
  return window.__songwriting.store.getState().song.sections[0].events.map((e) => e.id);
}, [C, Am, G7]);

await block('C').click();
await page.getByRole('button', { name: 'Explore guitar voicings' }).click();
await page.waitForSelector('.fretboard-svg');
for (const name of ['C', 'G7']) {
  await page.locator('.sw-strip button[aria-label^="Chord:"]', { hasText: new RegExp(`^${name}`) }).first().click();
  await sleep(150);
  await page.getByRole('button', { name: 'Use this voicing', exact: true }).click();
  await sleep(100);
}
const cVoicing = (await eventOf(cId)).attachments?.guitar;
const g7Voicing = (await eventOf(g7Id)).attachments?.guitar;
check('voicings committed for C and G7 in the guitar module', !!cVoicing && !!g7Voicing);

await page.getByRole('tab', { name: 'Chords' }).click();
await page.waitForSelector('[aria-label="Chord map"]');

// ---------------------------------------------------------------- item 1: timeline mini diagrams
const blockDiagram = (name) =>
  block(name).locator('[data-testid=block-diagram] svg').getAttribute('aria-label').catch(() => null);
check('the C block shows its committed shape as a mini diagram', (await blockDiagram('C')) === shapeText(cVoicing.frets), await blockDiagram('C'));
check('so does the G7 block', (await blockDiagram('G7')) === shapeText(g7Voicing.frets), await blockDiagram('G7'));
check('the uncommitted Am block shows none', (await block('Am').locator('[data-testid=block-diagram]').count()) === 0);
check('a committed block says so to screen readers', ((await block('C').getAttribute('aria-label')) ?? '').includes('guitar voicing committed'));

// ---------------------------------------------------------------- item 2: chord detail's Guitar view
await block('C').click();
await page.getByRole('button', { name: 'Piano / guitar' }).click();
await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'guitar' }).click();
await sleep(100);
const detail = page.getByTestId('detail-guitar');
check('Guitar view: a committed chord shows "Your voicing"', ((await detail.textContent()) ?? '').includes('Your voicing'));
check('…drawing exactly the committed shape', (await detail.locator('svg').getAttribute('aria-label')) === shapeText(cVoicing.frets));
await block('Am').click();
await sleep(100);
check('an uncommitted chord shows the suggested voicing', ((await detail.textContent()) ?? '').includes('Suggested voicing'));
check(
  '…the same default the guitar module picks (Am: x-0-2-2-1-0)',
  (await detail.locator('svg').getAttribute('aria-label')) === 'x-0-2-2-1-0',
  await detail.locator('svg').getAttribute('aria-label'),
);

// ---------------------------------------------------------------- item 3: guitar playback
const firstStrike = (id) =>
  page.evaluate((eventId) => window.__songwriting.strikes().find((s) => s.eventId === eventId && s.isChordStart)?.midi ?? [], id);
await page.evaluate(() => window.__songwriting.store.getState().setInstrument('guitar'));
check('on guitar, C plays exactly its committed notes', sameNotes(await firstStrike(cId), notesOf(cVoicing)), JSON.stringify(await firstStrike(cId)));
check('…and G7 its own', sameNotes(await firstStrike(g7Id), notesOf(g7Voicing)), JSON.stringify(await firstStrike(g7Id)));
await page.evaluate(() => window.__songwriting.store.getState().setInstrument('piano'));
check('on piano, the committed shape is ignored', !sameNotes(await firstStrike(cId), notesOf(cVoicing)));
await page.evaluate(() => window.__songwriting.store.getState().setInstrument('guitar'));

// ---------------------------------------------------------------- item 3: MIDI export
await page.getByRole('button', { name: 'Save, load and export' }).click();
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export MIDI' }).click()]);
const midi = new Midi(readFileSync(await download.path()));
const blockTrack = midi.tracks.find((t) => t.name === 'Block chords');
const atStart = blockTrack.notes.filter((n) => n.time === 0).map((n) => n.midi);
check('the MIDI file contains the committed C shape’s exact notes', sameNotes(atStart, notesOf(cVoicing)), JSON.stringify(atStart));
await page.getByRole('button', { name: 'Save, load and export' }).click();

// ---------------------------------------------------------------- item 4: rich chords from "More…"
await block('C').click();
await page.getByRole('button', { name: 'Flavour', exact: true }).click();
await page.getByRole('button', { name: 'More…' }).click();
const chip = (t) => page.locator('[data-testid=rich-builder] .chip', { hasText: new RegExp(`^${t}$`) });
await chip('7 \\(♭7\\)').click();
await sleep(100);
await chip('9').click();
await sleep(150);
check('"More…" turns C into C9, named so on the timeline', (await block('C9').count()) === 1);
const blocked = page.locator('[data-testid=rich-builder] .chip.unavailable').first();
await blocked.click({ force: true });
await sleep(100);
check(
  'an unavailable option is greyed and says why when tapped',
  ((await page.locator('[data-testid=rich-builder] .chip-message').textContent()) ?? '').trim().length > 0,
  await page.locator('[data-testid=rich-builder] .chip-message').textContent(),
);
check(
  'C’s old voicing is now flagged on its block (the chord changed)',
  ((await block('C9').getAttribute('aria-label')) ?? '').includes('needs a re-fit') && (await block('C9').locator('.block-stale').count()) === 1,
);
check('…the warning replaces the old diagram (no stale shape shown)', (await block('C9').locator('[data-testid=block-diagram]').count()) === 0);
await page.evaluate(() => window.__songwriting.store.getState().setInstrument('piano'));
const c9Notes = await firstStrike(cId);
check('on piano, C9 sounds its 9th (D) and ♭7 (B♭)', [2, 10].every((pc) => c9Notes.some((n) => n % 12 === pc)), JSON.stringify(c9Notes));

await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await sleep(150);
check('the guitar module shows the rich name too, and flags the stale voicing', (await page.locator('.sw-strip button[data-stale]', { hasText: 'C9' }).count()) === 1);
check(
  '…with the warning in place of the old diagram there too',
  (await page.locator('.sw-strip button[data-stale]', { hasText: 'C9' }).locator('.chord-diagram').count()) === 0 &&
    (await page.locator('.sw-strip button[data-stale]', { hasText: 'C9' }).locator('.block-stale').count()) === 1,
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
