/**
 * The circle-of-fifths chord map, Major/Minor switching in both map modes and on placed chords, and
 * a different key per section.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/circle-check.mjs
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
const chords = async () => (await song()).sections.flatMap((s) => s.events.map((e) => ({ root: e.chord.root, quality: e.chord.quality, numeral: e.chord.numeral, origin: e.chord.origin, section: s.name })));
const circle = () => page.locator('[aria-label="Circle of fifths"]');
const toolbar = () => page.locator('[aria-label^="Actions for"]');
const seg = (label) => page.locator(`[aria-label="Circle of fifths"] .map-node[aria-label^="${label}"]`);

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('.map-node');

// ---------------------------------------------------------------- the circle
await page.getByRole('button', { name: 'Circle of fifths' }).click();
await page.waitForSelector('[aria-label="Circle of fifths"] .map-node');
check('the circle shows 36 chords: major, minor and diminished', (await page.locator('[aria-label="Circle of fifths"] .map-node').count()) === 36);
check('the key chord is marked', (await seg('C, major').getAttribute('aria-label')).includes('Key chord'));
check('another chord of the key is marked as in the key', (await seg('Dm').getAttribute('aria-label')).includes('In the key'));
const labels = await page.locator('[aria-label="Circle of fifths"] .map-node').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
check('the key’s diminished chord is on the circle and in the key', labels.some((l) => /^B°, diminished\. In the key/.test(l)), labels.find((l) => /^B°/.test(l)));
check('chords of the parallel minor read as borrowed', labels.some((l) => /^B ?♭, major\. Borrowed/.test(l.replace('♭', ' ♭').replace('  ', ' '))) || labels.some((l) => /Borrowed/.test(l)));
check('a distant chord is outside the key', labels.some((l) => /^F♯, major\. Outside the key/.test(l)), labels.find((l) => /^F♯, major/.test(l)));

// Add G (in the key), then a borrowed and a distant chord.
await seg('G, major').click();
await circle().getByRole('button', { name: '+ Add' }).click();
await sleep(250);
await seg('B♭, major').click();
await circle().getByRole('button', { name: '+ Add' }).click();
await sleep(250);
await seg('F♯, major').click();
await circle().getByRole('button', { name: '+ Add' }).click();
await sleep(250);
let cs = await chords();
check('picking a chord on the circle adds it, labelled for the key', cs[0]?.root === 'G' && cs[0]?.numeral === 'V' && cs[0]?.origin === 'diatonic', JSON.stringify(cs[0]));
check('a borrowed chord is added as borrowed', cs[1]?.root === 'Bb' && cs[1]?.origin === 'borrowed', JSON.stringify(cs[1]));
check('a distant chord can be added too', cs[2]?.root === 'F#', JSON.stringify(cs[2]));

// ---------------------------------------------------------------- major to minor, same key
await seg('F, major').click();
await circle().getByRole('button', { name: 'Make minor' }).click();
await circle().getByRole('button', { name: '+ Add' }).click();
await sleep(250);
cs = await chords();
const f = cs[3];
check('Make minor on the circle adds the minor chord', f?.root === 'F' && f?.quality === 'min' && f?.numeral === 'iv', JSON.stringify(f));
check('the song’s key did not change', (await song()).key.tonic === 'C' && (await song()).key.mode === 'major');
await seg('B°').click();
check('a diminished chord cannot be switched', await circle().getByRole('button', { name: /Make (minor|major)/ }).isDisabled());

// the suggestion map has it too
await page.getByRole('button', { name: 'Suggestions' }).click();
await page.waitForSelector('.map-node');
await page.locator('.map-node').nth(1).click();
check('the suggestions map also has a Make minor / major button', (await page.getByRole('region', { name: 'Chord map' }).getByRole('button', { name: /Make (minor|major)/ }).count()) === 1);

// ---------------------------------------------------------------- a placed chord
await page.getByRole('button', { name: /^Chord: Fm/ }).first().click();
await toolbar().getByRole('button', { name: 'Make major' }).click();
await sleep(250);
cs = await chords();
check('Make major on a placed chord switches it in the song', cs[3]?.quality === 'maj' && cs[3]?.numeral === 'IV', JSON.stringify(cs[3]));

// ---------------------------------------------------------------- a different key per section
await page.getByRole('button', { name: '+ Chorus' }).click();
await sleep(250);
check('with two sections, the key can apply to the whole song or just the section', (await page.getByRole('group', { name: 'Key applies to' }).count()) === 1);
await page.getByRole('group', { name: 'Key applies to' }).getByRole('button', { name: /^Only/ }).click();
await page.getByRole('group', { name: 'Key' }).first().getByRole('button', { name: 'G', exact: true }).click().catch(async () => {
  await page.locator('[aria-label="Key"] [aria-pressed]').filter({ hasText: /^G$/ }).first().click();
});
await sleep(300);
let s = await song();
check('choosing a key for one section gives only that section a key', s.sections[1].key?.tonic === 'G' && !s.sections[0].key && s.key.tonic === 'C', JSON.stringify(s.sections.map((x) => x.key)));
check('the section shows its key', (await page.getByText('Key: G Major').count()) >= 1);
await page.getByRole('button', { name: 'Circle of fifths' }).click();
await page.waitForSelector('[aria-label="Circle of fifths"] .map-node');
check('the circle follows the active section’s key (G is now the key chord)', (await seg('G, major').getAttribute('aria-label')).includes('Key chord'));

// "Use as key" from the circle shifts the section again.
await seg('D, major').click();
await circle().getByRole('button', { name: 'Use as key' }).click();
await sleep(300);
s = await song();
check('Use as key on the circle changes the section’s key', s.sections[1].key?.tonic === 'D' && s.key.tonic === 'C', JSON.stringify(s.sections[1].key));
await page.getByRole('button', { name: 'Back to the song’s key' }).click();
await sleep(300);
s = await song();
check('Back to the song’s key removes the section key', !s.sections[1].key);

// the choice of map type is remembered
await page.reload();
await page.waitForSelector('[aria-label="Circle of fifths"], .map-node');
check('the chosen map type is remembered', (await page.locator('[aria-label="Circle of fifths"]').count()) === 1);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
