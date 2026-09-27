/**
 * Drives the merged app (PLAN.md §7 Phase 2, "Done when"): opens the library, creates a song,
 * switches between modules, and confirms audio starts after one tap in either module.
 *
 * Also proves the first chord played on the guitar instrument uses the recorded acoustic-guitar
 * sample, not the synthesized Karplus-Strong fallback (the "Fix first chord playing the
 * synthesized guitar..." commit, ported into the shell's startup): hooks
 * `AudioBufferSourceNode.prototype.start` before the app loads and checks that none of the
 * buffers played on the first tap are the fallback's fixed 3.0 s length.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/shell-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// Installed before any app script runs, so it catches every AudioBufferSourceNode ever started,
// the very first one included. Records each buffer's duration in seconds.
await page.addInitScript(() => {
  window.__starts = [];
  const proto = AudioBufferSourceNode.prototype;
  const realStart = proto.start;
  proto.start = function start(...args) {
    if (this.buffer) window.__starts.push(this.buffer.duration);
    return realStart.apply(this, args);
  };
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

await page.goto(url);
// Give the startup sample prefetch (fetch, not audio — no gesture needed) a moment to populate
// the HTTP cache, exactly as a real visitor's browser would before they get around to tapping.
await page.waitForTimeout(1000);

check(
  'the library opens',
  await page.getByRole('heading', { name: 'Songwriting Studio' }).isVisible(),
);
check('a "New song" button is there', await page.getByRole('button', { name: 'New song' }).isVisible());

await page.getByRole('button', { name: 'New song' }).click();
await page.waitForFunction(() => location.hash.startsWith('#/song/'));
check('creating a song opens it', /#\/song\//.test(await page.evaluate(() => location.hash)));
check('the progression module is showing', await page.locator('[aria-label="Chord map"]').isVisible());

// Switch to the guitar module and confirm a tap there starts audio too.
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
check('switching to the guitar module shows the fretboard', (await page.locator('[data-string]').count()) > 0);
await page.locator('[data-string="1"][data-fret="0"]').click();
await page.waitForFunction(() => window.__fluidfrets?.audioEngine.getStatus() === 'running', null, {
  timeout: 5000,
});
check('audio starts after one tap in the guitar module', true);

// Switch back to the progression module (this also proves switching stops the guitar's own
// gesture listeners from interfering — see each module's `onDeactivate`).
await page.getByRole('tab', { name: 'Progression' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
check('switching back shows the progression module', await page.locator('[aria-label="Chord map"]').isVisible());

// Force the guitar instrument, then tap the first suggested chord: the recorded-guitar assertion.
await page.getByRole('button', { name: 'More playback settings' }).click();
await page.locator('#instrument').selectOption('guitar');
// Only count buffers from here on (the guitar module's own gesture above starts at least one
// silent unlock buffer, which isn't what this specific assertion is about).
await page.evaluate(() => (window.__starts.length = 0));
// The map's centre button is a no-op until a chord is already selected (it re-previews the
// current one); on a brand-new song, the clickable chord is one of the ring nodes around it.
await page.getByRole('button', { name: /Start here|is in the key/ }).first().click();

await page
  .waitForFunction(() => window.__starts.length > 0, null, { timeout: 8000 })
  .catch(() => {});
await page.waitForTimeout(300);
const starts = await page.evaluate(() => window.__starts);
const synthesized = starts.filter((d) => Math.abs(d - 3.0) < 0.01);
check('audio starts after one tap in the progression module', starts.length > 0, `${starts.length} buffer(s) started`);
check(
  'the first tap plays the recorded guitar, not the synthesized fallback (0 buffers 3.0 s long)',
  synthesized.length === 0,
  `${synthesized.length}/${starts.length} buffer(s) were the 3.0 s synthesized pluck`,
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
