/**
 * A chord built or identified on the guitar neck can be added to the song's progression with its
 * shape as the voicing, and the Progression module then opens centred on it.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/addchord-check.mjs
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
const events = () =>
  page.evaluate(() => window.__songwriting.store.getState().song.sections.flatMap((s) => s.events.map((e) => ({ id: e.id, root: e.chord.root, quality: e.chord.quality, numeral: e.chord.numeral, origin: e.chord.origin, frets: e.attachments?.guitar?.frets ?? null }))));

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('.map-node');
for (const i of [1, 1]) {
  // First the start ring's C, then the first suggestion after it.
  await page.locator('.map-node').nth(i).click();
  await page.getByRole('button', { name: '+ Add' }).click();
  await sleep(300);
}
const base = await events();
check('start with two chords', base.length === 2, base.map((e) => e.root).join());

await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await sleep(400);

// ---------------------------------------------------------------- the Chords tab
await page.locator('.sw-strip button[aria-label^="Chord:"]').first().click(); // focus the first chord (C)
await sleep(300);
await page.getByRole('button', { name: 'Add to progression' }).click();
await sleep(400);
let ev = await events();
check('Add to progression on the Chords tab adds a chord after the focused one', ev.length === 3 && ev[1].id !== base[1].id, ev.map((e) => e.root).join());
check('the added chord has the shape on the neck as its voicing', Array.isArray(ev[1].frets), JSON.stringify(ev[1].frets));

// ---------------------------------------------------------------- Identify: an A minor shape
await page.evaluate(() => {
  const s = window.__fluidfrets.store.getState();
  s.setMode('identify');
  s.setIdentifySel([null, 0, 2, 2, 1, 0]);
});
await sleep(300);
check('Identify names the chord', (await page.getByTestId('identify-name').textContent()) === 'Am', await page.getByTestId('identify-name').textContent());
await page.getByRole('button', { name: 'Add to progression' }).click();
await sleep(400);
ev = await events();
const am = ev.find((e) => e.root === 'A' && e.quality === 'min');
check('Add to progression on Identify adds the identified chord', !!am, ev.map((e) => e.root + e.quality).join());
check('it carries the picked shape as its voicing', JSON.stringify(am?.frets) === JSON.stringify([null, 0, 2, 2, 1, 0]), JSON.stringify(am?.frets));
check('an in-key chord keeps its diatonic numeral', am?.numeral === 'vi' && am?.origin === 'diatonic', `${am?.numeral} ${am?.origin}`);

// ---------------------------------------------------------------- the hand-off
await page.getByRole('tab', { name: 'Chords' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
await sleep(400);
const selected = await page.evaluate(() => window.__songwriting.store.getState().selectedEventId);
check('the Progression module opens with the added chord selected', selected === am?.id, `${selected} vs ${am?.id}`);
const centre = await page.locator('.map-node[aria-label^="Current chord"]').getAttribute('aria-label');
check('the chord map is centred on it, so suggestions follow from it', /Am/.test(centre ?? ''), centre ?? '');

// ---------------------------------------------------------------- the stand-alone tool has no song to add to
await page.goto(url.replace('?debug', '?debug#/tools/guitar'));
await page.waitForSelector('.fretboard-svg');
await page.evaluate(() => window.__fluidfrets.store.getState().setMode('identify'));
await sleep(300);
check('the stand-alone tool has no Add to progression button', (await page.getByRole('button', { name: 'Add to progression' }).count()) === 0);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
