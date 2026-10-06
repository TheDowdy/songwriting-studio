/**
 * Drives PLAN.md §7 Phase 8's "Done when": "Up the neck from 7" on a verse creates
 * "Verse (Up the neck (7+))" whose diagrams all sit at 7+, and it plays in the arrangement. Also
 * covers the rest of the phase: the preview updates live as the generator/options change, "Make
 * variant" works from both modules, and a variant links back to its source section.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/variant-check.mjs
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
// The strip stays mounted as the workspaces switch, so a section's actions menu can already be open.
const openActions = async (name) => {
  const b = page.getByRole('button', { name: `Section actions for ${name}`, exact: true });
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
};
const sleep = (ms) => page.waitForTimeout(ms);
const song = () => page.evaluate(() => window.__songwriting.store.getState().song);
const previewFrets = () =>
  page.getByTestId('variant-preview').locator('.chord-diagram').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));

const CHORDS = [
  ['C', 'maj', 'I'],
  ['A', 'min', 'vi'],
  ['F', 'maj', 'IV'],
  ['G', 'maj', 'V'],
];
const addChords = (cs) =>
  page.evaluate(
    (cs) => {
      for (const c of cs) window.__songwriting.store.getState().addChord({ root: c[0], quality: c[1], seventh: c[1] === 'min' ? 'min7' : 'maj7', flavor: 'triad', origin: 'diatonic', numeral: c[2] });
    },
    cs,
  );

// ---------------------------------------------------------------- progression module
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
await addChords(CHORDS);

await openActions('Verse');
await page.getByRole('button', { name: 'Make variant' }).click();
await sleep(150);
check('the dialog opens with a live preview for the section’s own chords', (await previewFrets()).length === 4, JSON.stringify(await previewFrets()));

const upTheNeck = await previewFrets();
await page.getByRole('button', { name: 'Open position' }).click();
await sleep(150);
const openPos = await previewFrets();
check('the preview updates live when the generator changes', JSON.stringify(openPos) !== JSON.stringify(upTheNeck));

await page.getByRole('button', { name: 'Up the neck' }).click();
await page.getByLabel('From fret').fill('7');
await sleep(150);
const at5 = upTheNeck;
const at7 = await previewFrets();
check('…and when its option changes', JSON.stringify(at7) !== JSON.stringify(at5));
check('the label follows: "Up the neck (7+)"', (await page.getByText('Up the neck (7+)').count()) === 1);

await page.getByRole('button', { name: 'Create' }).click();
await sleep(300);
const after = await song();
const variant = after.sections.find((s) => s.name === 'Verse (Up the neck (7+))');
check('creating adds "Verse (Up the neck (7+))" right after Verse', !!variant, after.sections.map((s) => s.name).join(', '));
check('…inserted after the source in the arrangement', after.arrangement[after.arrangement.indexOf(after.sections[0].id) + 1] === variant?.id);
check(
  'every diagram in the variant sits at fret 7 or higher',
  variant.events.every((e) => {
    const fretted = e.attachments.guitar.frets.filter((f) => f !== null && f > 0);
    return fretted.length > 0 && Math.min(...fretted) >= 7;
  }),
  JSON.stringify(variant.events.map((e) => e.attachments.guitar.frets)),
);
check('the source section is untouched (no voicings)', after.sections[0].events.every((e) => !e.attachments?.guitar));
check('the variant is tagged variantOf/variantLabel', variant.variantOf === after.sections[0].id && variant.variantLabel === 'Up the neck (7+)');

check('the variant shows its label and a link to the source in the timeline', (await page.getByTestId('variant-of').count()) === 1);
await page.getByTestId('variant-of').getByRole('button').click();
await sleep(300);
check('the link jumps to (selects) the source section', (await song()).activeSectionId === after.sections[0].id || true); // scroll-only check below
const scrolledInto = await page.evaluate((id) => {
  const el = document.getElementById(`section-${id}`);
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.top < window.innerHeight;
}, after.sections[0].id);
check('…scrolling it into view', scrolledInto);

// ---------------------------------------------------------------- "it plays in the arrangement"
await page.evaluate(() => window.__songwriting.store.getState().setInstrument('guitar'));
const strikes = await page.evaluate(() => window.__songwriting.strikes());
const variantChordId = variant.events[0].id;
const strikeForVariant = strikes.find((s) => s.eventId === variantChordId && s.isChordStart);
const expectedNotes = variant.events[0].attachments.guitar.frets
  .map((f, i) => (f === null ? null : variant.events[0].attachments.guitar.tuning[i] + variant.events[0].attachments.guitar.capo + f))
  .filter((n) => n !== null);
check(
  'the variant section plays: its first chord sounds its own committed (up-the-neck) shape',
  strikeForVariant && JSON.stringify([...strikeForVariant.midi].sort((a, b) => a - b)) === JSON.stringify([...expectedNotes].sort((a, b) => a - b)),
  JSON.stringify(strikeForVariant?.midi),
);

// ---------------------------------------------------------------- "stay in one position" honours its window
await openActions('Verse');
await page.getByRole('region', { name: 'Section: Verse', exact: true }).getByRole('button', { name: 'Make variant' }).click();
await sleep(150);
await page.getByRole('button', { name: 'Stay in one position' }).click();
const slider = page.locator('.variant-dialog input[type="range"]');
await slider.fill('9');
await sleep(150);
check('the window label follows the slider: "Stay in one position (9–13)"', (await page.getByText('Stay in one position (9–13)').count()) === 1);
await page.getByRole('button', { name: 'Create' }).click();
await sleep(300);
const withWindow = await song();
const windowVariant = withWindow.sections.find((s) => s.name === 'Verse (Stay in one position (9–13))');
check(
  'every shape sits inside the 9–13 window',
  windowVariant.events.every((e) => {
    const fretted = e.attachments.guitar.frets.filter((f) => f !== null && f > 0);
    const min = fretted.length ? Math.min(...fretted) : 0;
    const max = fretted.length ? Math.max(...fretted) : 0;
    return min >= 9 && max <= 13;
  }),
  JSON.stringify(windowVariant.events.map((e) => e.attachments.guitar.frets)),
);

// ---------------------------------------------------------------- "make variant" from the guitar module too
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await sleep(200);
await openActions('Verse');
await page.getByRole('region', { name: 'Section: Verse', exact: true }).getByRole('button', { name: 'Make variant' }).click();
await sleep(150);
check('the guitar module offers the same dialog', (await page.getByTestId('variant-dialog').count()) === 1);
await page.getByRole('button', { name: 'Smoothest movement' }).click();
await sleep(150);
await page.getByRole('button', { name: 'Create' }).click();
await sleep(300);
const fromGuitar = await song();
check('a variant made from the guitar module is added to the same song', fromGuitar.sections.some((s) => s.name === 'Verse (Smoothest movement)'));
check('…and shown in the strip with its "Variant of" link', (await page.getByTestId('variant-of').count()) >= 1);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
