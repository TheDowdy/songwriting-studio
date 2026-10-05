/**
 * The strum pattern builder: make a pattern, edit its steps, use it for the song, a section or one
 * chord, see its strokes in the timeline, and hear exactly those strokes in both modules.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/patterns-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);
const song = () => page.evaluate(() => window.__songwriting.store.getState().song);
const strikes = () => page.evaluate(() => window.__songwriting.strikes());
const byChord = (all, id) => all.filter((s) => s.eventId === id);
const ownPattern = () => page.locator('label.pb-field:has(> span:text-is("Strum pattern")) select');

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('.map-node');
for (const i of [1, 1, 1]) {
  await page.locator('.map-node').nth(i).click();
  await page.getByRole('button', { name: '+ Add' }).click();
  await sleep(250);
}
let s = await song();
const [a, b] = s.sections[0].events;
check('start with three chords', s.sections[0].events.length === 3);

// ---------------------------------------------------------------- the lane, and making a pattern in it
const lane = (i) => page.getByRole('button', { name: /^Pattern for / }).nth(i);
const blockSelect = () => page.getByLabel('Block pattern');
const handle = () => page.getByRole('slider', { name: /^Chords in .+ block$/ });
const own = async () => (await song()).sections[0].events.map((e) => e.pattern ?? null);
check('no Strum patterns button in the transport bar', (await page.getByRole('button', { name: 'Strum patterns' }).count()) === 0);
check('every chord has a lane cell, all on the song default', (await page.getByRole('button', { name: /^Pattern for / }).count()) === 3 && (await lane(0).getAttribute('aria-label')).includes('song default'));
await lane(0).click();
check('selecting a lane cell shows the pattern block options', await page.getByRole('group', { name: 'Pattern block' }).isVisible());
await blockSelect().selectOption('new:Folk (D, DU, UDU)');
await sleep(300);
s = await song();
check('a new pattern from a preset is saved and given to that chord only', s.patterns?.length === 1 && s.patterns[0].steps.length === 8 && s.sections[0].events[0].pattern === `custom:${s.patterns[0].id}` && !s.sections[0].events[1].pattern && !s.sections[0].events[2].pattern, JSON.stringify(s.patterns?.[0]?.steps.map((x) => x && x.stroke[0])));
check('the pattern editor opens beside it', (await page.getByLabel('Pattern name').count()) === 1);
const pid = s.patterns[0].id;

// ---------------------------------------------------------------- edit steps
await page.getByRole('button', { name: /^Step 2 of 8/ }).click(); // a rest becomes a down strum
await sleep(150);
await page.getByRole('button', { name: 'Low strings' }).click();
await page.getByRole('button', { name: 'Accent' }).click();
await sleep(200);
s = await song();
const step2 = s.patterns[0].steps[1];
check('tapping a rest makes a down strum, and the step can be a partial, accented strum', step2?.stroke === 'down' && step2?.extent === 'low' && step2?.accent === true, JSON.stringify(step2));
await page.getByRole('button', { name: /^Step 2 of 8/ }).click(); // down -> up
await sleep(150);
s = await song();
check('tapping again makes it an up strum and keeps the other settings', s.patterns[0].steps[1]?.stroke === 'up' && s.patterns[0].steps[1]?.extent === 'low', JSON.stringify(s.patterns[0].steps[1]));
await page.getByLabel('Length in beats').selectOption('3');
await sleep(200);
s = await song();
check('shortening the pattern to 3 beats keeps its first steps', s.patterns[0].beats === 3 && s.patterns[0].steps.length === 6 && s.patterns[0].steps[1]?.stroke === 'up');
await page.getByLabel('Length in beats').selectOption('4');
await page.getByLabel('Steps in each beat').selectOption('4');
await sleep(200);
s = await song();
check('changing the grid to sixteenths keeps each stroke at the same moment', s.patterns[0].steps.length === 16 && s.patterns[0].steps[2]?.stroke === 'up');
await page.getByLabel('Steps in each beat').selectOption('2');
await sleep(200);
// Step 2 again: up, then rest, down and up. A rest forgets the step's settings, so make it partial again.
await page.getByRole('button', { name: /^Step 2 of 8/ }).click(); // up -> rest
await page.getByRole('button', { name: /^Step 2 of 8/ }).click(); // rest -> down
await page.getByRole('button', { name: /^Step 2 of 8/ }).click(); // down -> up
await page.getByRole('button', { name: 'Low strings' }).click();
await sleep(150);

// ---------------------------------------------------------------- use it for the whole song
await page.getByRole('button', { name: 'Whole song', exact: true }).click();
await sleep(300);
s = await song();
check('Whole song makes it the song’s pattern and clears every chord’s own', s.pattern === `custom:${pid}` && s.sections[0].events.every((e) => !e.pattern), s.pattern);
let all = await strikes();
const first = byChord(all, a.id);
// Shortening to 3 beats and back dropped the last two steps (beat 4), so 5 strokes are left.
check('the first chord plays the pattern’s strokes (one strike for each stroke)', first.length === 5, `${first.length} strikes at ${first.map((x) => x.offsetBeats).join(',')}`);
const upStroke = first.find((x) => x.strumSeconds < 0);
const downStroke = first.find((x) => x.strumSeconds > 0);
check('a down stroke sounds low to high and an up stroke high to low', downStroke && upStroke && downStroke.midi[0] < downStroke.midi.at(-1) && upStroke.midi[0] > upStroke.midi.at(-1), JSON.stringify({ down: downStroke?.midi, up: upStroke?.midi }));
const partial = first.find((x) => x.midi.length < downStroke.midi.length);
check('the partial strum sounds fewer strings', !!partial);

// strokes are drawn in the lane, not on the chord blocks
const laneArrows = await page.locator('[data-lane-cell] [data-stroke]').count();
const blockArrows = await page.locator('.timeline-scroll li > div:not([data-lane-cell]) span[title*="strum"]').count();
check('the lane shows every chord’s strokes, and the chord blocks show none', laneArrows === 15 && blockArrows === 0, `${laneArrows} in the lane, ${blockArrows} on chord blocks`);

// ---------------------------------------------------------------- a pattern keeps its phase across a block
await page.evaluate(([x, y]) => {
  const st = window.__songwriting.store.getState();
  st.setEventBeats(x, 2);
  st.setEventBeats(y, 2);
}, [a.id, b.id]);
await sleep(250);
all = await strikes();
const secondChord = byChord(all, b.id).filter((x) => x.midi.length > 0).map((x) => x.offsetBeats - 2);
const expectedPhase = await page.evaluate((id) => window.__songwriting.chordStrokes(window.__songwriting.store.getState().song, id).map((h) => h.offsetBeats), b.id);
check('the second 2-beat chord plays the second half of the pattern, not its start again', JSON.stringify(secondChord) === JSON.stringify(expectedPhase) && expectedPhase[0] === 0.5, `${secondChord} vs ${expectedPhase}`);
await page.evaluate(([x, y]) => {
  const st = window.__songwriting.store.getState();
  st.setEventBeats(x, 4);
  st.setEventBeats(y, 4);
}, [a.id, b.id]);
await sleep(200);

// ---------------------------------------------------------------- one chord with its own pattern
await lane(1).click();
await blockSelect().selectOption('strum-down');
await sleep(250);
s = await song();
check('one chord can have its own pattern', s.sections[0].events[1].pattern === 'strum-down' && !s.sections[0].events[0].pattern, String(s.sections[0].events[1].pattern));
all = await strikes();
check('that chord plays the built-in strum while the others play the custom pattern', byChord(all, b.id).length !== byChord(all, a.id).length || JSON.stringify(byChord(all, b.id).map((x) => x.offsetBeats)) !== JSON.stringify(byChord(all, a.id).map((x) => x.offsetBeats)));
await blockSelect().selectOption('');
await sleep(250);
s = await song();
check('choosing the song default clears it', !s.sections[0].events[1].pattern);

// a second pattern: made from the lane for one chord, then grown, dragged and nudged
await blockSelect().selectOption('new:Off-beat chops');
await sleep(300);
s = await song();
const second = s.patterns[1];
const cs = `custom:${second.id}`;
check('a second pattern is added for that chord and opens for editing', s.patterns.length === 2 && (await page.getByLabel('Pattern name').inputValue()) === second.name && JSON.stringify(await own()) === JSON.stringify([null, cs, null]));
await page.getByRole('button', { name: '+ Longer block' }).click();
await sleep(200);
check('+ Longer block extends the block over the next chord', JSON.stringify(await own()) === JSON.stringify([null, cs, cs]));
await page.getByRole('button', { name: 'Just this chord' }).click();
await sleep(200);
check('Just this chord keeps it on the selected chord only', JSON.stringify(await own()) === JSON.stringify([null, cs, null]));
// drag the block’s handle across the next chord
const hb = await handle().boundingBox();
const target = await lane(2).boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(target.x + target.width / 2 + 4, hb.y + hb.height / 2, { steps: 8 });
await page.mouse.up();
await sleep(250);
check('dragging the handle over the next chord grows the block', JSON.stringify(await own()) === JSON.stringify([null, cs, cs]), JSON.stringify(await own()));
await handle().focus();
await page.keyboard.press('ArrowLeft');
await sleep(150);
check('the handle’s left arrow shortens the block', JSON.stringify(await own()) === JSON.stringify([null, cs, null]));
await page.keyboard.press('ArrowRight');
await sleep(150);
check('the handle’s right arrow grows it again', JSON.stringify(await own()) === JSON.stringify([null, cs, cs]));
await page.getByRole('button', { name: '− Shorter block' }).click();
await page.getByRole('button', { name: '+ Longer block' }).click();
await sleep(150);
check('the Shorter and Longer buttons do the same', JSON.stringify(await own()) === JSON.stringify([null, cs, cs]));
await page.getByRole('button', { name: 'Whole section' }).click();
await sleep(250);
s = await song();
check('Whole section gives every chord in it the pattern', s.sections[0].events.every((e) => e.pattern === cs));
await page.getByRole('button', { name: 'Remove pattern' }).click();
await sleep(200);
check('Remove pattern puts the block back on the song default', (await own()).every((p) => p === null));
await page.keyboard.press('Escape');
check('Escape closes the block options', (await page.getByRole('group', { name: 'Pattern block' }).count()) === 0);

// ---------------------------------------------------------------- a new chord continues the block before it
await lane(0).click();
await blockSelect().selectOption(cs);
await page.getByRole('button', { name: 'Whole section' }).click();
await sleep(200);
await page.locator('.map-node').nth(1).click();
await page.getByRole('button', { name: '+ Add' }).click();
await sleep(250);
s = await song();
check('a chord added after a patterned chord continues its block', s.sections[0].events.length === 4 && s.sections[0].events[3].pattern === cs);
await page.getByRole('button', { name: /^Chord: / }).nth(3).click();
await page.getByRole('button', { name: 'Remove', exact: true }).click();
await sleep(250);
s = await song();
check('removing it leaves the other three as they were', s.sections[0].events.length === 3 && s.sections[0].events.every((e) => e.pattern === cs));

// ---------------------------------------------------------------- on a phone
await page.setViewportSize({ width: 390, height: 844 });
await sleep(300);
await lane(0).click();
await sleep(300);
const bar = await page.getByRole('group', { name: 'Pattern block' }).boundingBox();
check('on a phone the block options are on screen after selecting a block', !!bar && bar.y >= 0 && bar.y < 844);
await page.getByRole('button', { name: '− Shorter block' }).click();
await sleep(150);
check('Shorter block works by tap', JSON.stringify(await own()) === JSON.stringify([cs, cs, null]));
await page.getByRole('button', { name: '+ Longer block' }).click();
await page.setViewportSize({ width: 1280, height: 1100 });
await sleep(200);

// ---------------------------------------------------------------- the song’s own default is still the first pattern
await page.keyboard.press('Escape');
check('the song default is still the first pattern', (await song()).pattern === `custom:${pid}`);

// ---------------------------------------------------------------- it is saved with the song
await sleep(1200); // the song store autosaves after a short debounce
await page.reload();
await page.waitForSelector('.map-node');
s = await song();
check('patterns and where they are used survive a reload', s.schemaVersion === 3 && s.patterns?.length === 2 && s.sections[0].events.every((e) => e.pattern === cs) && s.pattern === `custom:${pid}`);

// ---------------------------------------------------------------- the guitar module
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await sleep(300);
check('the guitar module has no separate pattern builder or Strum patterns button', (await page.getByRole('button', { name: 'Strum patterns' }).count()) === 0 && (await page.getByLabel('Pattern name').count()) === 0);
const stripArrows = await page.locator('.strip-chord').first().locator('.strip-stroke').count();
const stripSlashes = await page.locator('.strip-chord').first().locator('.strip-slash').count();
check('a chord with a custom pattern shows its strokes as arrows in the guitar strip', stripArrows === s.patterns[1].steps.filter(Boolean).length && stripSlashes === 0, `${stripArrows} arrows, ${stripSlashes} slashes`);
const gs = await page.evaluate(() => {
  const song = window.__songwriting.store.getState().song;
  return window.__fluidfrets.progressionStrikes(song, null).strikes.map((k) => ({ id: k.eventId, at: k.atSeconds, n: k.notes.length, midi: k.notes.map((x) => x.midi) }));
});
const secondPat = s.patterns[1];
const firstGtr = gs.filter((k) => k.id === a.id);
const expected = secondPat.steps.filter(Boolean).length;
check('the guitar module plays the section’s pattern for its chords (one strike per stroke, plus a silent start marker)', firstGtr.filter((k) => k.n > 0).length === expected, `${firstGtr.filter((k) => k.n > 0).length} vs ${expected}`);
check('up strokes there sound high to low', firstGtr.some((k) => k.n > 1 && k.midi[0] > k.midi.at(-1)));
// per-chord picker in the strip toolbar
await page.locator('.strip-chord').nth(1).click();
await ownPattern().selectOption(`custom:${pid}`);
await sleep(250);
s = await song();
check('the chord toolbar in the guitar module sets a chord’s own pattern', s.sections[0].events[1].pattern === `custom:${pid}`);
// ---------------------------------------------------------------- delete (from the progression's editor)
await page.getByRole('tab', { name: 'Progression' }).click();
await page.waitForSelector('.map-node');
await lane(1).click();
await blockSelect().selectOption(`custom:${pid}`);
await page.getByRole('button', { name: 'Edit pattern' }).click();
await page.getByRole('button', { name: 'Delete pattern' }).click();
await sleep(300);
s = await song();
check('deleting a pattern puts everything that used it back to the song default', s.patterns.length === 1 && s.pattern === 'block' && !s.sections[0].events[1].pattern, JSON.stringify({ pattern: s.pattern, own: s.sections[0].events[1].pattern }));

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
