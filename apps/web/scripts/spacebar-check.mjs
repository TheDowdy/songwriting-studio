/**
 * The space bar starts and stops playback of the progression, in both modules, without breaking
 * what Space already does: typing a space, pressing a keyboard-focused button, and anything while a
 * dialog is open. After a mouse click on "+ Add" (which leaves focus on that button), Space must
 * toggle playback rather than adding another chord.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/spacebar-check.mjs
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
const progPlaying = () => page.evaluate(() => window.__songwriting.store.getState().isPlaying);
const gtrPlaying = () => page.evaluate(() => window.__fluidfrets.store.getState().progressionPlaying);
const chordCount = () =>
  page.evaluate(() => window.__songwriting.store.getState().song.sections.reduce((n, s) => n + s.events.length, 0));
const scrollY = () => page.evaluate(() => window.scrollY);
// Headless Chrome may not be able to start audio, so playback can flip straight back to "stopped".
// Record every change to the play flags instead of sampling them.
const watch = () =>
  page.evaluate(() => {
    window.__plays = [];
    const log = (who) => (s, p) => s !== p && window.__plays.push(who + ':' + s);
    const prog = window.__songwriting.store;
    prog.subscribe((s, p) => s.isPlaying !== p.isPlaying && window.__plays.push('prog:' + s.isPlaying));
    const gtr = window.__fluidfrets?.store;
    gtr?.subscribe((s, p) => s.progressionPlaying !== p.progressionPlaying && window.__plays.push('gtr:' + s.progressionPlaying));
    void log;
  });
const plays = () => page.evaluate(() => window.__plays.slice());
const clearPlays = () => page.evaluate(() => (window.__plays = []));

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('.map-node');
await watch();

// ---------------------------------------------------------------- nothing to play yet
await page.mouse.click(5, 400); // focus the page, not a control
await page.keyboard.press('Space');
await sleep(150);
check('with no chords, Space does not start playback', (await plays()).length === 0);

// ---------------------------------------------------------------- progression module
// Build a short progression with the mouse: the last click is on "+ Add", which keeps focus.
for (const i of [1, 2]) {
  await page.locator('.map-node').nth(i).click();
  await page.getByRole('button', { name: '+ Add' }).click();
}
await page.locator('.map-node').nth(1).click(); // focus a chord so the "+ Add" button appears
const before = await chordCount();
// Click it the way a mouse user does, then add nothing: focus stays on the button.
await page.getByRole('button', { name: '+ Add' }).click();
const afterAdd = await chordCount();
await clearPlays();
await page.keyboard.press('Space');
await sleep(250);
check('Space starts playback in the progression module', (await plays()).includes('prog:true'), (await plays()).join());
check(
  'Space after clicking "+ Add" toggles playback and does not add another chord',
  afterAdd === before + 1 && (await chordCount()) === afterAdd,
  `${before} → ${afterAdd} → ${await chordCount()}`,
);
await page.keyboard.press('Space');
await sleep(250);
check('Space stops it again', !(await progPlaying()) && (await plays()).at(-1) === 'prog:false', (await plays()).join());

// After clicking a chord on the map (an SVG role=button that keeps focus), Space still toggles.
await page.locator('.map-node').nth(1).click();
const y0 = await scrollY();
await clearPlays();
await page.keyboard.press('Space');
await sleep(250);
check('Space toggles playback with a chord on the map focused', (await plays()).includes('prog:true'), (await plays()).join());
check('Space does not scroll the page', (await scrollY()) === y0, `${y0} → ${await scrollY()}`);
await page.keyboard.press('Space');
await sleep(250);

// ---------------------------------------------------------------- the timeline follows each beat
// At a fast tempo, play and record which beat of which chord is lit. Headless Chrome may not be able to
// start audio, so this only asserts when playback produced beats at all.
await page.evaluate(() => {
  const st = window.__songwriting.store;
  st.getState().setBpm(240);
  window.__beats = [];
  st.subscribe((s, p) => (s.playingBeat !== p.playingBeat || s.playingEventId !== p.playingEventId) && window.__beats.push([s.playingEventId, s.playingBeat]));
});
await page.keyboard.press('Space');
await sleep(2200);
await page.keyboard.press('Space');
await sleep(250);
const beats = await page.evaluate(() => window.__beats.filter((b) => b[0] !== null));
const steps = beats.map((b) => b[1]);
check(
  'playing lights each beat of a chord in turn, from the first, never repeating the last beat of the chord before',
  beats.length === 0 || (steps[0] === 0 && steps.every((b, i) => i === 0 || b === (steps[i - 1] + 1) % 4 || (beats[i][0] !== beats[i - 1][0] && b === 0))),
  steps.join(','),
);

// ---------------------------------------------------------------- Space keeps its other meanings
// Typing a space in the song title.
await page.getByTitle('Rename song').click();
const titleInput = page.getByLabel('Song title');
await clearPlays();
await titleInput.fill('a');
await page.keyboard.press('Space');
await page.keyboard.type('b');
await sleep(150);
check('Space in a text field types a space and does not start playback', (await titleInput.inputValue()) === 'a b' && (await plays()).length === 0, await titleInput.inputValue());

// A button reached with the keyboard is pressed by Space, not hijacked.
await page.getByRole('button', { name: 'Tap' }).focus();
await page.keyboard.press('Tab'); // move on and back so :focus-visible is on, as for a keyboard user
await page.keyboard.press('Shift+Tab');
const bpmBefore = await page.evaluate(() => window.__songwriting.store.getState().song.bpm);
await page.keyboard.press('Space');
await sleep(250);
const bpmAfter = await page.evaluate(() => window.__songwriting.store.getState().song.bpm);
check('Space on a keyboard-focused button does not start playback', (await plays()).length === 0, `${(await plays()).join()} bpm ${bpmBefore} → ${bpmAfter}`);

// A dialog owns Space.
await page.getByRole('button', { name: /Settings|Preferences/ }).first().click();
await page.waitForSelector('dialog[open]');
await clearPlays();
await page.keyboard.press('Space');
await sleep(250);
check('Space does nothing to playback while a dialog is open', (await plays()).length === 0);
await page.keyboard.press('Escape');
await sleep(200);

// ---------------------------------------------------------------- guitar module (song context)
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await watch();
await page.mouse.click(5, 300);
await page.keyboard.press('Space');
await sleep(300);
check('Space starts the progression in the guitar module', (await plays()).includes('gtr:true'), (await plays()).join());
await page.keyboard.press('Space');
await sleep(300);
check('Space stops it in the guitar module', !(await gtrPlaying()) && (await plays()).at(-1) === 'gtr:false', (await plays()).join());

// A select in the guitar toolbar keeps Space.
await page.locator('label.field select').first().focus();
await clearPlays();
await page.keyboard.press('Space');
await sleep(250);
check('Space on a select does not start the progression', (await plays()).length === 0);

// ---------------------------------------------------------------- the stand-alone tool has no progression
await page.goto(url.replace('?debug', '?debug#/tools/guitar'));
await page.waitForSelector('.fretboard-svg');
await watch();
await page.mouse.click(5, 300);
await page.keyboard.press('Space');
await sleep(300);
check('in the stand-alone guitar tool, Space starts nothing', (await plays()).length === 0 && !(await gtrPlaying()));

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
