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

// ---------------------------------------------------------------- make a pattern
await page.getByRole('button', { name: 'Strum patterns' }).click();
await page.getByLabel('New pattern from').selectOption('Folk (D, DU, UDU)');
await sleep(300);
s = await song();
check('a new pattern from a preset is saved in the song', s.patterns?.length === 1 && s.patterns[0].steps.length === 8, JSON.stringify(s.patterns?.[0]?.steps.map((x) => x && x.stroke[0])));
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
await page.getByRole('button', { name: 'Entire song' }).click();
await sleep(300);
s = await song();
check('Entire song makes it the song’s pattern', s.pattern === `custom:${pid}`, s.pattern);
let all = await strikes();
const first = byChord(all, a.id);
// Shortening to 3 beats and back dropped the last two steps (beat 4), so 5 strokes are left.
check('the first chord plays the pattern’s strokes (one strike for each stroke)', first.length === 5, `${first.length} strikes at ${first.map((x) => x.offsetBeats).join(',')}`);
const upStroke = first.find((x) => x.strumSeconds < 0);
const downStroke = first.find((x) => x.strumSeconds > 0);
check('a down stroke sounds low to high and an up stroke high to low', downStroke && upStroke && downStroke.midi[0] < downStroke.midi.at(-1) && upStroke.midi[0] > upStroke.midi.at(-1), JSON.stringify({ down: downStroke?.midi, up: upStroke?.midi }));
const partial = first.find((x) => x.midi.length < downStroke.midi.length);
check('the partial strum sounds fewer strings', !!partial);

// strokes are shown in the timeline
await page.getByRole('button', { name: new RegExp('^Chord: ') }).first().click();
const arrows = await page.locator('.timeline-scroll li span[title$="strum"], .timeline-scroll li span[title*="strum,"]').count();
check('each chord block shows the strokes of its pattern', arrows >= 15, String(arrows));

// ---------------------------------------------------------------- one chord with its own pattern
await page.getByRole('button', { name: new RegExp('^Chord: ') }).nth(1).click();
await ownPattern().selectOption('strum-down');
await sleep(250);
s = await song();
check('one chord can have its own pattern', s.sections[0].events[1].pattern === 'strum-down' && !s.sections[0].events[0].pattern, String(s.sections[0].events[1].pattern));
all = await strikes();
check('that chord plays the built-in strum while the others play the custom pattern', byChord(all, b.id).length !== byChord(all, a.id).length || JSON.stringify(byChord(all, b.id).map((x) => x.offsetBeats)) !== JSON.stringify(byChord(all, a.id).map((x) => x.offsetBeats)));
await ownPattern().selectOption('');
await sleep(250);
s = await song();
check('choosing "Same as song" clears it', !s.sections[0].events[1].pattern);

// a second pattern, used for the selected chord only
await page.getByLabel('New pattern from').selectOption('Off-beat chops');
await sleep(300);
s = await song();
const second = s.patterns[1];
check('a second pattern is added and selected for editing', s.patterns.length === 2 && (await page.getByLabel('Pattern name').inputValue()) === second.name);
await page.getByRole('button', { name: 'Selected chord' }).click();
await sleep(250);
s = await song();
check('Selected chord uses it for that chord only', s.sections[0].events[1].pattern === `custom:${second.id}` && !s.sections[0].events[0].pattern && !s.sections[0].events[2].pattern);
await page.getByRole('button', { name: 'Rest of section' }).click();
await sleep(250);
s = await song();
check('Rest of section uses it for that chord and the ones after', s.sections[0].events[2].pattern === `custom:${second.id}` && !s.sections[0].events[0].pattern);
await page.getByRole('button', { name: 'Whole section' }).click();
await sleep(250);
s = await song();
check('Whole section sets the section’s pattern and clears its chords’ own', s.sections[0].pattern === `custom:${second.id}` && s.sections[0].events.every((e) => !e.pattern));

// ---------------------------------------------------------------- it is saved with the song
await sleep(1200); // the song store autosaves after a short debounce
await page.reload();
await page.waitForSelector('.map-node');
s = await song();
check('patterns and where they are used survive a reload', s.patterns?.length === 2 && s.sections[0].pattern === `custom:${second.id}` && s.pattern === `custom:${pid}`);

// ---------------------------------------------------------------- the guitar module
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await sleep(300);
await page.getByRole('button', { name: 'Strum patterns' }).click();
await page.waitForSelector('[aria-label="Strum patterns"]');
check('the guitar module has the same builder', (await page.getByLabel('Pattern to edit').count()) === 1);
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
await page.evaluate(() => {
  window.__plays = [];
  window.__fluidfrets.store.subscribe((st, prev) => st.progressionPlaying !== prev.progressionPlaying && window.__plays.push(st.progressionPlaying));
});
await page.getByRole('button', { name: '▶ Preview' }).click();
await sleep(400);
check('Preview plays the pattern on the focused chord', (await page.evaluate(() => window.__plays)).includes(true));

// ---------------------------------------------------------------- delete
await page.getByLabel('Pattern to edit').selectOption(pid);
await page.getByRole('button', { name: 'Delete pattern' }).click();
await sleep(300);
s = await song();
check('deleting a pattern puts everything that used it back a level', s.patterns.length === 1 && s.pattern === 'block' && !s.sections[0].events[1].pattern, JSON.stringify({ pattern: s.pattern, own: s.sections[0].events[1].pattern }));

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
