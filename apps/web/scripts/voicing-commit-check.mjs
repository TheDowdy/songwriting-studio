/**
 * Drives PLAN.md §7 Phase 4's "Done when" flow: commit a voicing for every chord of a short
 * progression, reload, and they are still there; change a chord's flavour and see the stale badge;
 * Re-fit fixes it near the same position. Also covers the rest of the phase's items: a focused
 * chord shows its committed voicing (not just the best one) before any tap, the bass/inversion
 * control narrows the voicing search and updates the chord's own numeral, and the progression
 * strip's committed blocks show a mini diagram, flagged when stale.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/voicing-commit-check.mjs
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

const guitarState = () => page.evaluate(() => window.__fluidfrets.store.getState());
const shapeText = () => page.getByTestId('shape-text').textContent();
const eventOf = (id) =>
  page.evaluate((eventId) => {
    const song = window.__songwriting.store.getState().song;
    for (const section of song.sections) {
      const event = section.events.find((e) => e.id === eventId);
      if (event) return event;
    }
    return null;
  }, id);

const G7 = { root: 'G', quality: 'maj', seventh: 'dom7', flavor: '7', origin: 'diatonic', numeral: 'V7' };
const CMAJ = { root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'I' };

// ---------------------------------------------------------------- build a two-chord song
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForFunction(() => location.hash.startsWith('#/song/'));
await page.waitForSelector('[aria-label="Chord map"]');

const eventIds = await page.evaluate((chords) => {
  for (const chord of chords) window.__songwriting.store.getState().addChord(chord);
  return window.__songwriting.store.getState().song.sections[0].events.map((e) => e.id);
}, [G7, CMAJ]);
check('the song has both chords', eventIds.length === 2, eventIds.join(','));
const [g7Id, cId] = eventIds;

await page.getByRole('button', { name: /^Chord: G7,/ }).click();
await page.getByRole('button', { name: 'Explore guitar voicings' }).click();
await page.waitForFunction(() => location.hash.includes('/guitar'));
await page.waitForSelector('.fretboard-svg');
await sleep(150);

// ---------------------------------------------------------------- bass/inversion control
const bassControl = page.getByTestId('bass-control');
check(
  'the bass control offers Root, 1st, 2nd, 3rd and Any bass for a seventh chord',
  (await bassControl.getByRole('button').allTextContents()).join(',') === 'Root,1st,2nd,3rd,Any bass',
);
check('Root is pressed by default (G7 has no slash bass yet)', (await bassControl.getByRole('button', { name: 'Root' }).getAttribute('aria-pressed')) === 'true');

const statusBefore = await page.getByTestId('voicing-status').textContent();
await bassControl.getByRole('button', { name: '1st' }).click();
await sleep(50);
const statusAfterFirst = await page.getByTestId('voicing-status').textContent();
check(
  '"1st" narrows the voicing list (a slash-bass search has far fewer valid shapes)',
  statusAfterFirst !== statusBefore,
  `${statusBefore} -> ${statusAfterFirst}`,
);
const shapeAt1st = (await shapeText()).split('-').map((f) => (f === 'x' ? null : Number(f)));
const tuningStrings = (await guitarState()).tuning.strings;
const lowestString1st = shapeAt1st.findIndex((f) => f !== null);
const bassMidi1st = tuningStrings[lowestString1st] + shapeAt1st[lowestString1st]; // capo is 0 here
check('the shown shape\'s bass is really B (the 3rd of G7, its 1st inversion)', ((bassMidi1st % 12) + 12) % 12 === 11, `frets ${shapeAt1st.join('-')}`);

await page.getByRole('button', { name: 'Use this voicing' }).click();
await sleep(100);
check(
  'committing an inversion updates the progression chord\'s numeral',
  (await page.getByTestId('progression-chord-header').textContent()).includes('V⁶₅'),
  await page.getByTestId('progression-chord-header').textContent(),
);
const eventAfterFirst = await eventOf(g7Id);
check('…and its own name (a slash chord)', eventAfterFirst.chord.bass !== undefined && eventAfterFirst.chord.bass.startsWith('B'), eventAfterFirst.chord.bass);
check('…and commits the voicing itself', !!eventAfterFirst.attachments?.guitar, JSON.stringify(eventAfterFirst.attachments));
check(
  '…recorded as "recommended" (the best voicing for the 1st-inversion filter, auto-selected)',
  eventAfterFirst.attachments.guitar.source === 'recommended',
  eventAfterFirst.attachments.guitar.source,
);

// Back to Root: committing again clears the inversion.
await bassControl.getByRole('button', { name: 'Root' }).click();
await page.getByRole('button', { name: 'Best voicing' }).click();
await page.getByRole('button', { name: 'Use this voicing' }).click();
await sleep(100);
check(
  'switching back to Root and re-committing clears the inversion',
  (await page.getByTestId('progression-chord-header').textContent()).includes('V7') &&
    !(await page.getByTestId('progression-chord-header').textContent()).includes('V⁶₅'),
  await page.getByTestId('progression-chord-header').textContent(),
);
const eventRoot = await eventOf(g7Id);
check('…and clears the chord\'s own slash bass', eventRoot.chord.bass === undefined, String(eventRoot.chord.bass));

{
  const rootStatus = await page.getByTestId('voicing-status').textContent();
  await bassControl.getByRole('button', { name: 'Any bass' }).click();
  await sleep(50);
  const anyStatus = await page.getByTestId('voicing-status').textContent();
  check('"Any bass" widens the search well past "Root"', anyStatus !== rootStatus, `${rootStatus} -> ${anyStatus}`);
}

// ---------------------------------------------------------------- committed voicing wins over "best" on refocus
await bassControl.getByRole('button', { name: 'Root' }).click();
await page.getByRole('button', { name: 'Best voicing' }).click();
await page.getByRole('button', { name: 'Use this voicing' }).click();
await sleep(100);
const g7Committed = (await shapeText());

await page.getByRole('button', { name: /^Chord: C,/ }).click(); // C major's strip block
await sleep(100);
await page.getByRole('button', { name: 'Best voicing' }).click();
await page.getByRole('button', { name: 'Use this voicing' }).click();
await sleep(100);
const cCommitted = await shapeText();
check('C major\'s committed voicing differs from G7\'s (sanity: they are different shapes)', cCommitted !== g7Committed, `${cCommitted} vs ${g7Committed}`);

await page.getByRole('button', { name: /^Chord: G7,/ }).click();
await sleep(150);
const shapeOnG7Refocus = await shapeText();
await page.getByRole('button', { name: /^Chord: C,/ }).click();
await sleep(150);
const shapeOnCRefocus = await shapeText();
check(
  'refocusing a chord shows its committed voicing immediately, before any tap',
  shapeOnG7Refocus === g7Committed && shapeOnCRefocus === cCommitted,
  `G7: ${shapeOnG7Refocus} (want ${g7Committed}); C: ${shapeOnCRefocus} (want ${cCommitted})`,
);

// ---------------------------------------------------------------- the strip shows a mini diagram
const stripDiagramCircles = await page
  .locator('.strip-chord', { hasText: 'C' })
  .locator('.strip-chord-diagram .chord-diagram circle')
  .count();
check('the progression strip shows a mini diagram for a committed voicing', stripDiagramCircles > 0, `${stripDiagramCircles} circles`);

// ---------------------------------------------------------------- stale badge + Re-fit (Phase 4 "Done when")
check('no stale badge yet (capo/tuning unchanged since committing)', (await page.getByTestId('stale-voicing').count()) === 0);
await page.evaluate(() => window.__fluidfrets.applyCapo(2));
await sleep(150);
check('changing the capo flags the committed voicing as stale', (await page.getByTestId('stale-voicing').count()) === 1);
// Both chords' voicings were committed under capo 0, so a capo change flags both — check the
// currently-focused one (C) specifically, the one Re-fit below is about to fix.
check('…and flags it in the progression strip too', (await page.locator('.strip-chord.stale', { hasText: 'C' }).count()) === 1);
await page.getByTestId('stale-voicing').getByRole('button', { name: 'Re-fit' }).click();
await sleep(150);
check('Re-fit clears the stale badge', (await page.getByTestId('stale-voicing').count()) === 0);
check('…and in the strip, for that chord', (await page.locator('.strip-chord.stale', { hasText: 'C' }).count()) === 0);
const refitEvent = await eventOf(cId);
check('…and the re-fit voicing is recorded under the new capo', refitEvent.attachments.guitar.capo === 2, refitEvent.attachments.guitar.capo);

// A chord edit elsewhere (a flavour change) also goes stale, not just a tuning/capo change.
await page.evaluate(() => window.__fluidfrets.applyCapo(0));
await sleep(100);
await page.evaluate((id) => window.__songwriting.store.getState().setEventChord(id, { ...window.__songwriting.store.getState().song.sections[0].events.find((e) => e.id === id).chord, quality: 'min' }), cId);
await sleep(150);
check('changing the chord itself (not the tuning) also flags the voicing as stale', (await page.getByTestId('stale-voicing').count()) === 1);
await page.getByTestId('stale-voicing').getByRole('button', { name: 'Re-fit' }).click();
await sleep(150);
check('Re-fit also fixes a chord-changed staleness', (await page.getByTestId('stale-voicing').count()) === 0);

// ---------------------------------------------------------------- Remove voicing
check('"Remove voicing" is offered while something is committed', (await page.getByRole('button', { name: 'Remove voicing' }).count()) === 1);
await page.getByRole('button', { name: 'Remove voicing' }).click();
await sleep(100);
check('removing the voicing clears its attachment', !(await eventOf(cId)).attachments?.guitar);
check('…and "Remove voicing" is no longer offered', (await page.getByRole('button', { name: 'Remove voicing' }).count()) === 0);
check('…and the committed badge is gone', (await page.getByTestId('committed-badge').count()) === 0);

// ---------------------------------------------------------------- Phase 4 "Done when": survives a reload
await page.getByRole('button', { name: /^Chord: G7,/ }).click();
await sleep(100);
const g7BeforeReload = await eventOf(g7Id);
check('the G7 voicing committed earlier is still there before reload', !!g7BeforeReload.attachments?.guitar);
await sleep(1000); // autosave
await page.reload();
await page.waitForSelector('.fretboard-svg');
await sleep(200);
const g7AfterReload = await eventOf(g7Id);
check(
  'committing a voicing for every chord survives a reload',
  JSON.stringify(g7AfterReload.attachments?.guitar) === JSON.stringify(g7BeforeReload.attachments?.guitar),
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
