/**
 * Drives the real app in headless Chrome: unlock on first tap, correct pitch, mute, preset
 * switching, rapid taps. Works against `npm run dev` or `npm run preview` (append ?debug).
 * Usage: URL=http://localhost:5199/?debug node scripts/app-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);

// Choosing a tuning strums the open strings (Phase 4); switch that off so it can't colour the pitch
// measurements below, which look at one string at a time.
await page.evaluate(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));

const status = () => page.evaluate(() => window.__fluidfrets.audioEngine.getStatus());
const peak = () => page.evaluate(() => window.__fluidfrets.audioEngine.getOutputPeak());
const marker = (string, fret) => page.locator(`[data-string="${string}"][data-fret="${fret}"]`);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

check(
  'starts idle with a "Tap to enable sound" banner',
  (await status()) === 'idle' &&
    (await page.getByRole('button', { name: /Tap to enable sound/ }).isVisible()),
);

// Open A string (string index 1) — behind the nut.
await marker(1, 0).click();
await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running', null, {
  timeout: 5000,
});
check('audio unlocks and reaches "running" after a tap', true);
check(
  'banner disappears once running',
  !(await page.getByRole('button', { name: /Tap to enable sound/ }).isVisible()),
);

async function measure(string, fret, expectedHz) {
  await marker(string, fret).click();
  await page.waitForTimeout(120);
  return page.evaluate((expected) => {
    const x = window.__fluidfrets.audioEngine.getOutputSnapshot();
    const sr = window.__fluidfrets.audioEngine.context.sampleRate;
    const p = sr / expected;
    let best = 0,
      bestV = -Infinity;
    const vals = {};
    const N = x.length - Math.ceil(p * 1.1) - 2;
    for (let lag = Math.floor(p * 0.9) - 1; lag <= Math.ceil(p * 1.1) + 1; lag++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += x[i] * x[i + lag];
      vals[lag] = s;
      if (s > bestV) {
        bestV = s;
        best = lag;
      }
    }
    const a = vals[best - 1],
      b = vals[best],
      c = vals[best + 1];
    const hz = sr / (best + (0.5 * (a - c)) / (a - 2 * b + c));
    return { hz, peak: x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) };
  }, expectedHz);
}

let m = await measure(1, 0, 110);
check(
  'open A string plays 110 Hz',
  Math.abs(m.hz - 110) < 1.0 && m.peak > 0.01,
  `${m.hz.toFixed(2)} Hz, peak ${m.peak.toFixed(3)}`,
);
m = await measure(0, 5, 110); // low E string, 5th fret = A2
check(
  'low E string, fret 5 also plays 110 Hz',
  Math.abs(m.hz - 110) < 1.0,
  `${m.hz.toFixed(2)} Hz`,
);
// Let the A2 notes above decay first: their 6th harmonic (660 Hz) would bias a short window.
await page.waitForTimeout(2500);
m = await measure(5, 12, 659.26);
check(
  'high E string, fret 12 plays E5 (659 Hz)',
  Math.abs(m.hz - 659.26) < 4,
  `${m.hz.toFixed(1)} Hz`,
);

// Retuning: switch to Drop D → low string open is D2 (73.4 Hz).
await page.locator('select').first().selectOption('drop-d');
await page.waitForTimeout(500); // let the 300 ms label slide finish before targeting markers
m = await measure(0, 0, 73.42);
check(
  'Drop D: open low string plays D2 (73.4 Hz)',
  Math.abs(m.hz - 73.42) < 1.0,
  `${m.hz.toFixed(2)} Hz`,
);
await page.locator('select').first().selectOption('standard');
await page.waitForTimeout(500);

// Mute.
await page.getByRole('button', { name: 'Mute' }).click();
await marker(1, 0).click();
await page.waitForTimeout(300);
const muted = await peak();
check('Mute silences output', muted < 1e-4, `peak ${muted.toExponential(1)}`);
await page.getByRole('button', { name: 'Unmute' }).click();

// Presets: each one makes sound.
const presetSelect = page.locator('label.field:has(span:text("Sound")) select');
for (const id of ['acoustic', 'classical', 'clean', 'jazz', 'crunch', 'highgain']) {
  await presetSelect.selectOption(id);
  await marker(2, 3).click();
  await page.waitForTimeout(120);
  const p = await peak();
  check(`preset "${id}" produces sound`, p > 0.005 && p <= 1, `peak ${p.toFixed(3)}`);
}

// Volume slider affects level.
await presetSelect.selectOption('acoustic');
await page.locator('input[type=range]').fill('100');
await marker(1, 0).click();
await page.waitForTimeout(150);
const loud = await peak();
await page.locator('input[type=range]').fill('20');
await page.waitForTimeout(200);
await marker(1, 0).click();
await page.waitForTimeout(150);
const quiet = await peak();
check(
  'volume slider lowers the level',
  quiet < loud * 0.5,
  `100%: ${loud.toFixed(3)}, 20%: ${quiet.toFixed(3)}`,
);

// Rapid taps across the neck: never clips past 1, no errors.
await page.locator('input[type=range]').fill('100');
let maxPeak = 0;
for (let i = 0; i < 80; i++) {
  await marker(i % 6, i % 12).click();
  if (i % 4 === 0) maxPeak = Math.max(maxPeak, await peak());
  await page.waitForTimeout(8);
}
check('80 rapid taps stay below clipping', maxPeak <= 1, `max peak ${maxPeak.toFixed(3)}`);

check('no console/page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
