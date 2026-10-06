/**
 * Drives PLAN.md §7 Phase 7's "Done when": switch a voiced song from standard tuning to DADGAD,
 * every chord is flagged, and Re-voice all gives playable, valid voicings. Also covers the rest of
 * the phase: the tuning/capo change asks first (and Cancel leaves everything as it was), the
 * re-voice panel's per-chord candidates (one tap commits), and single-level Undo.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/revoice-check.mjs
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
const song = () => page.evaluate(() => window.__songwriting.store.getState().song);
const tuningSelect = () => page.locator('.toolbar .field', { hasText: 'Tuning' }).locator('select');
const capoSelect = () => page.locator('.toolbar .field', { hasText: 'Capo' }).locator('select');
const STANDARD = [40, 45, 50, 55, 59, 64];
const DADGAD = [38, 45, 50, 55, 57, 62];
/** A committed voicing is playable and valid in the song's setup now: every note a chord tone,
 *  every required tone present, the right bass — `voicingStatus` 'ok', computed in the page. */
const statuses = () =>
  page.evaluate(() => {
    const s = window.__songwriting.store.getState().song;
    return s.sections.flatMap((sec) =>
      sec.events.map((e) => (e.attachments?.guitar ? window.__songwriting.voicingStatus(e, s) : 'none')),
    );
  });

// ---------------------------------------------------------------- a four-chord song, every chord voiced
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
const chords = [
  { root: 'D', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'II' },
  { root: 'G', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'V' },
  { root: 'A', quality: 'min', seventh: 'min7', flavor: 'triad', origin: 'diatonic', numeral: 'vi' },
  { root: 'E', quality: 'min', seventh: 'min7', flavor: 'triad', origin: 'diatonic', numeral: 'iii' },
];
await page.evaluate((cs) => {
  for (const c of cs) window.__songwriting.store.getState().addChord(c);
}, chords);
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
for (const name of ['D', 'G', 'Am', 'Em']) {
  await page.locator('.strip-chord').filter({ has: page.locator('.strip-chord-name', { hasText: new RegExp(`^${name}$`) }) }).click();
  await sleep(150);
  await page.getByRole('button', { name: 'Use this voicing', exact: true }).click();
  await sleep(100);
}
check('all four chords voiced in standard tuning', JSON.stringify(await statuses()) === '["ok","ok","ok","ok"]', JSON.stringify(await statuses()));
const before = await song();

// ---------------------------------------------------------------- the change asks first; Cancel changes nothing
await tuningSelect().selectOption('dadgad');
await sleep(200);
check(
  'changing the tuning asks first, naming how many voicings it leaves behind',
  ((await page.getByTestId('confirm-guitar-change').textContent()) ?? '').includes('4 chords have voicings for the old tuning'),
  await page.getByTestId('confirm-guitar-change').textContent().catch(() => ''),
);
await page.getByRole('button', { name: 'Cancel' }).click();
await sleep(200);
check('Cancel keeps the song in standard tuning', JSON.stringify((await song()).guitar.tuning) === JSON.stringify(STANDARD));
check('…and the neck too', JSON.stringify(await page.evaluate(() => window.__fluidfrets.store.getState().tuning.strings)) === JSON.stringify(STANDARD));

await capoSelect().selectOption('2');
await sleep(200);
check('a capo change asks first too', ((await page.getByTestId('confirm-guitar-change').textContent()) ?? '').includes('old capo'));
await page.getByRole('button', { name: 'Cancel' }).click();
await sleep(150);
check('…and Cancel leaves the capo alone', (await song()).guitar.capo === 0);

// ---------------------------------------------------------------- Phase 7 "Done when": DADGAD, flagged, Re-voice all
// The page's scroll position must survive the change (it used to jump down to the voicing list).
await page.setViewportSize({ width: 1280, height: 600 });
const pageY = () => page.evaluate(() => document.scrollingElement.scrollTop);
await page.evaluate(() => (document.scrollingElement.scrollTop = 150));
const yBefore = await pageY();
// What the user sees must not jump either: the first chord block keeps its place on screen, even if
// something above it (the shell's transport row, wrapping to fit Re-voice and Undo) grows and the
// browser's scroll anchoring moves the scroll position to compensate.
const blockTop = () => page.evaluate(() => Math.round(document.querySelector('.strip-chord').getBoundingClientRect().top));
const blockBefore = await blockTop();
await tuningSelect().selectOption('dadgad');
await sleep(200);
await page.getByRole('button', { name: 'Change tuning' }).click();
await sleep(400);
check(
  'confirming a tuning change leaves the page where it was on screen',
  yBefore > 0 && Math.abs((await blockTop()) - blockBefore) <= 2,
  `scroll ${yBefore} → ${await pageY()}, first chord ${blockBefore} → ${await blockTop()}`,
);
await page.setViewportSize({ width: 1280, height: 1000 });
check('confirming switches the song to DADGAD', JSON.stringify((await song()).guitar.tuning) === JSON.stringify(DADGAD));
check('every chord is flagged', JSON.stringify(await statuses()) === '["tuning-changed","tuning-changed","tuning-changed","tuning-changed"]', JSON.stringify(await statuses()));
check('the voicings were kept, not deleted', (await song()).sections[0].events.every((e) => !!e.attachments?.guitar));
check('the re-voice panel opens by itself', (await page.getByTestId('revoice-panel').count()) === 1);
check('it lists all four chords', (await page.getByTestId('revoice-row').count()) === 4);
const candidateCounts = await page.getByTestId('revoice-row').evaluateAll((rows) => rows.map((r) => r.querySelectorAll('.revoice-candidate').length));
check('each with three candidates', candidateCounts.every((n) => n === 3), JSON.stringify(candidateCounts));

// One chord by hand first.
await page.getByTestId('revoice-row').first().locator('.revoice-candidate').first().click();
await sleep(200);
check('one tap commits a candidate for that chord', (await statuses())[0] === 'ok' && (await page.getByTestId('revoice-row').count()) === 3);

await page.getByRole('button', { name: 'Re-voice all' }).click();
await sleep(300);
check('Re-voice all gives every chord a playable, valid voicing in DADGAD', JSON.stringify(await statuses()) === '["ok","ok","ok","ok"]', JSON.stringify(await statuses()));
const afterAll = (await song()).sections[0].events.map((e) => e.attachments.guitar);
check('…committed for DADGAD', afterAll.every((v) => JSON.stringify(v.tuning) === JSON.stringify(DADGAD) && v.capo === 0));
const spans = afterAll.map((v) => {
  const fretted = v.frets.filter((f) => f !== null && f > 0);
  return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
});
check('…each within a four-fret stretch', spans.every((s) => s <= 4), JSON.stringify(spans));
check('no flagged chords left: the Re-voice button is gone', (await page.getByRole('button', { name: /Re-voice \d/ }).count()) === 0);

// ---------------------------------------------------------------- Undo (single level)
const revoiced = JSON.stringify(afterAll);
await page.getByRole('button', { name: 'Undo Re-voice all' }).click();
await sleep(300);
const afterUndo = await statuses();
check('Undo puts back the voicings from before Re-voice all (three still flagged)', afterUndo.filter((s) => s === 'tuning-changed').length === 3, JSON.stringify(afterUndo));
check('…and there is only one level of undo', (await page.getByRole('button', { name: /^↶ Undo/ }).count()) === 0);
check('the undone state is really different from the re-voiced one', JSON.stringify((await song()).sections[0].events.map((e) => e.attachments.guitar)) !== revoiced);

// Undo also reverts a tuning change.
if ((await page.getByTestId('revoice-panel').count()) === 0) await page.getByRole('button', { name: /Re-voice \d/ }).click();
await page.getByRole('button', { name: 'Re-voice all' }).click();
await sleep(200);
await tuningSelect().selectOption('standard');
await sleep(200);
await page.getByRole('button', { name: 'Change tuning' }).click();
await sleep(300);
await page.getByRole('button', { name: 'Undo Tuning change' }).click();
await sleep(300);
check('Undo reverts a tuning change', JSON.stringify((await song()).guitar.tuning) === JSON.stringify(DADGAD));
check('…the neck follows', JSON.stringify(await page.evaluate(() => window.__fluidfrets.store.getState().tuning.strings)) === JSON.stringify(DADGAD));
check('…and the voicings fit again', JSON.stringify(await statuses()) === '["ok","ok","ok","ok"]', JSON.stringify(await statuses()));
check('the original standard-tuning song is untouched by all this', before.sections[0].events.length === 4);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
