/**
 * The audio engine must still work where AudioWorklet is missing (a page served over plain http
 * on a LAN): it falls back to a ScriptProcessorNode. Emulates that by removing `audioWorklet`
 * before the app loads. Usage: URL=http://localhost:5199/?debug node scripts/fallback-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function session(label, { insecure, flag }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (insecure) {
    // What a non-secure context looks like: BaseAudioContext has no audioWorklet.
    await page.addInitScript(() => {
      Object.defineProperty(BaseAudioContext.prototype, 'audioWorklet', { get: () => undefined });
    });
  }
  await page.goto(flag ? url + '&noworklet' : url);
  await page.evaluate(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));
  const marker = (s, f) => page.locator(`[data-string="${s}"][data-fret="${f}"]`);
  await marker(1, 0).click();
  await page.waitForFunction(
    () => window.__fluidfrets.audioEngine.getStatus() === 'running',
    null,
    {
      timeout: 8000,
    },
  );
  const engine = await page.evaluate(() => window.__fluidfrets.audioEngine.synthEngine);
  const pitch = (expectedHz) =>
    page.evaluate((hz) => {
      const e = window.__fluidfrets.audioEngine;
      const x = e.getOutputSnapshot();
      const sr = e.context.sampleRate;
      let best = 0,
        bestV = -Infinity;
      for (let lag = Math.floor(sr / (hz * 1.2)); lag <= Math.ceil(sr / (hz * 0.8)); lag++) {
        let sum = 0;
        for (let i = 0; i + lag < x.length; i++) sum += x[i] * x[i + lag];
        if (sum > bestV) {
          bestV = sum;
          best = lag;
        }
      }
      return sr / best;
    }, expectedHz);
  return { page, errors, marker, engine, pitch, label };
}

for (const [label, opts, expected] of [
  ['no AudioWorklet (plain-http page)', { insecure: true }, 'script-processor'],
  ['?noworklet flag', { flag: true }, 'script-processor'],
  ['normal secure page', {}, 'worklet'],
]) {
  const s = await session(label, opts);
  check(`${label}: engine is ${expected}`, s.engine === expected, s.engine);
  await s.page.waitForTimeout(150);
  await s.marker(1, 0).click(); // A2
  await s.page.waitForTimeout(150);
  const hz = await s.pitch(110);
  check(`${label}: plays A2 at 110 Hz`, Math.abs(hz - 110) < 1.5, `${hz.toFixed(2)} Hz`);
  const peak = await s.page.evaluate(() => window.__fluidfrets.audioEngine.getOutputPeak());
  check(`${label}: audible`, peak > 0.02 && peak < 1, peak.toFixed(3));

  // A tuning peg drag bends the ringing note (setPitch) without re-plucking.
  const peg = s.page.locator('[data-peg="1"]');
  const box = await peg.boundingBox();
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await s.page.mouse.move(cx, cy);
  await s.page.mouse.down();
  for (let i = 1; i <= 8; i++) await s.page.mouse.move(cx, cy - (12 * 24 * i) / 8 / 1); // up 12 semitones
  await s.page.waitForTimeout(150);
  const bent = await s.pitch(220);
  await s.page.mouse.up();
  check(
    `${label}: dragging a peg glides the ringing note (legato)`,
    bent > 150,
    `${bent.toFixed(1)} Hz`,
  );
  await s.page.waitForTimeout(300);

  // Strum: six notes, then silence after Mute.
  await s.page.evaluate(() => window.__fluidfrets.store.getState().setMuted(true));
  await s.page.waitForTimeout(150);
  const muted = await s.page.evaluate(() => window.__fluidfrets.audioEngine.getOutputPeak());
  check(`${label}: Mute silences it`, muted < 1e-3, muted.toExponential(1));
  check(`${label}: no console or page errors`, s.errors.length === 0, s.errors.join(' | '));
  await s.page.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
