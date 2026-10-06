/**
 * Every module's notes are scheduled on the same clock they play on. Tone creates its own default
 * AudioContext when it's imported; if any node gets built on that one before `@sw/audio` swaps in
 * the shared context, `Tone.now()` and the node run on different clocks and every note is scheduled
 * in the past by however long the page sat before the first tap, so the browser skips that far into
 * each sample (short chords went silent). Chrome is launched with autoplay allowed, as it is on a
 * site you use a lot, so Tone's default context starts running at page load, then the first tap
 * comes a few seconds later.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/clock-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => {
  window.__offsets = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
    window.__offsets.push(when - this.context.currentTime);
    return start.call(this, when, ...rest);
  };
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const offsets = async () => (await page.evaluate(() => window.__offsets.splice(0))).map((o) => +o.toFixed(2));
const onTime = (list) => list.length > 0 && list.every((o) => o > -0.02);

await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForTimeout(3000);

// First sound in the progression module (the order that used to build its instruments on Tone's
// default context), then a timeline chord preview, then the guitar module.
await page.locator('.map-node').nth(1).click();
await page.waitForTimeout(1500);
let o = await offsets();
check('progression: the first chord is scheduled on the clock it plays on', onTime(o), o.slice(-4).join(' ') + ' s ahead');

await page.getByRole('button', { name: '+ Add' }).click();
await page.getByRole('button', { name: /^Chord: / }).first().click();
await page.waitForTimeout(800);
o = await offsets();
check('progression: a timeline chord preview is scheduled on time', onTime(o), o.slice(-4).join(' ') + ' s ahead');

await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await page.locator('[data-string][data-fret]').first().click();
await page.waitForTimeout(800);
await page.getByRole('tab', { name: 'Chords' }).click();
await page.getByRole('button', { name: /^Chord: / }).first().click();
await page.waitForTimeout(800);
o = await offsets();
check('after using the guitar module, previews are still on time', onTime(o), o.slice(-4).join(' ') + ' s ahead');

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
