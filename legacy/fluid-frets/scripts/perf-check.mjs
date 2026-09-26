/**
 * Frame-rate under load: with the CPU throttled to imitate a mid-range phone, a tuning-peg drag,
 * a strum and a chord change must not drop frames. Frame times come from a requestAnimationFrame
 * loop running during the interaction. Usage: node scripts/perf-check.mjs
 * (PERF_URL=... to test another build; CPU_RATE=6 for a slower device)
 */
import { chromium } from 'playwright-core';

const url = process.env.PERF_URL ?? 'http://localhost:5198/?debug';
const rate = Number(process.env.CPU_RATE ?? 4);
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  hasTouch: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(url);
await page.evaluate(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));
await page.locator('[data-string="1"][data-fret="0"]').click(); // unlock audio
await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running');
await page.waitForTimeout(300);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

/** Runs `action` while sampling frame intervals; returns stats in ms. */
async function frames(action) {
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    window.__frameLoop = true;
    const tick = () => {
      const now = performance.now();
      window.__frames.push(now - last);
      last = now;
      if (window.__frameLoop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await action();
  const list = await page.evaluate(() => {
    window.__frameLoop = false;
    return window.__frames;
  });
  const sorted = [...list].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    n: list.length,
    p50: pct(0.5),
    p95: pct(0.95),
    max: sorted[sorted.length - 1],
    slow: list.filter((d) => d > 34).length,
  };
}
const fmt = (s) =>
  `${s.n} frames, median ${s.p50.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms, worst ${s.max.toFixed(0)} ms, ${s.slow} over 34 ms`;

async function pegDrag() {
  const box = await page.locator('[data-peg="2"]').boundingBox();
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // 8 semitones up over ~2 s, in small mouse steps like a real drag, then back down.
  for (let i = 1; i <= 60; i++) {
    await page.mouse.move(cx, cy - (8 * 24 * i) / 60);
    await page.waitForTimeout(16);
  }
  for (let i = 59; i >= 0; i--) {
    await page.mouse.move(cx, cy - (8 * 24 * i) / 60);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

for (const [label, cpu] of [
  ['unthrottled', 1],
  [`CPU ×${rate} (mid-range phone)`, rate],
]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.waitForTimeout(300);
  const drag = await frames(pegDrag);
  console.log(`   ${label}: peg drag — ${fmt(drag)}`);
  if (cpu === rate)
    check(
      `peg drag at CPU ×${rate}: 95 % of frames within 25 ms, none over 100 ms`,
      drag.p95 <= 25 && drag.max <= 100,
      fmt(drag),
    );
  if (cpu === rate)
    check(
      `peg drag at CPU ×${rate}: fewer than 5 % of frames over 34 ms`,
      drag.slow / drag.n < 0.05,
      `${drag.slow}/${drag.n}`,
    );
}

// A scale/chord workload at the same throttle.
await page.evaluate(() => window.__fluidfrets.store.getState().setMode('chord'));
await page.waitForTimeout(400);
const chordChange = await frames(async () => {
  for (const spec of [
    { seventh: '7', extension: '13' },
    { quality: 'minor', extension: '11' },
    { seventh: 'maj7' },
  ]) {
    await page.evaluate((spec) => {
      const s = window.__fluidfrets.store;
      s.getState().setChordSpec({
        ...s.getState().chordSpec,
        quality: 'major',
        seventh: 'none',
        extension: 'none',
        alterations: [],
        ...spec,
      });
    }, spec);
    await page.waitForTimeout(250);
  }
});
console.log(`   chord changes — ${fmt(chordChange)}`);
check(
  `chord changes at CPU ×${rate}: no frame over 200 ms`,
  chordChange.max <= 200,
  fmt(chordChange),
);

await page.evaluate(() => window.__fluidfrets.store.getState().setMode('scale'));
// The panel starts folded on a short (phone landscape) screen; open it to reach Play.
await page
  .getByRole('button', { name: /Show panel/ })
  .click()
  .catch(() => {});
await page.evaluate(() =>
  window.__fluidfrets.store
    .getState()
    .setPlayback({ tempo: 240, range: 'neck', direction: 'updown' }),
);
const scalePlay = await frames(async () => {
  await page.getByRole('button', { name: /Play/ }).first().click();
  await page.waitForTimeout(4000);
  await page
    .getByRole('button', { name: /Stop/ })
    .click()
    .catch(() => {});
});
console.log(`   scale playback at 240 BPM — ${fmt(scalePlay)}`);
check(
  `scale playback at CPU ×${rate}: 95 % of frames within 25 ms`,
  scalePlay.p95 <= 25,
  fmt(scalePlay),
);

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
