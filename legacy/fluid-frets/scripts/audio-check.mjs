/**
 * Renders the real audio chain (worklet + effects + master bus) offline in headless Chrome and
 * prints pitch / level / brightness / decay per preset, plus a rapid-retrigger stress test.
 * Usage: start `npm run dev -- --port 5199`, then `node scripts/audio-check.mjs`.
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
await page.goto(url);

const results = await page.evaluate(async () => {
  const { createMasterBus } = await import('/src/audio/engine.ts');
  const { SynthInstrument } = await import('/src/audio/synth/SynthInstrument.ts');
  const { SOUND_PRESETS } = await import('/src/audio/synth/presets.ts');

  const SR = 48000;

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) (([re[i], re[j]] = [re[j], re[i]]), ([im[i], im[j]] = [im[j], im[i]]));
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k),
            wi = Math.sin(ang * k);
          const ur = re[i + k],
            ui = im[i + k];
          const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
          const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
          re[i + k] = ur + vr;
          im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr;
          im[i + k + len / 2] = ui - vi;
        }
      }
    }
  }
  const centroid = (x, from) => {
    const N = 8192;
    const re = new Float64Array(N),
      im = new Float64Array(N);
    for (let i = 0; i < N; i++)
      re[i] = (x[from + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    let num = 0,
      den = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.hypot(re[k], im[k]);
      num += m * ((k * SR) / N);
      den += m;
    }
    return num / den;
  };
  const rms = (x, a, b) => {
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    return Math.sqrt(s / (b - a));
  };
  const peakOf = (x) => {
    let m = 0;
    for (const v of x) if (Math.abs(v) > m) m = Math.abs(v);
    return m;
  };
  const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
  function f0(x, expected, from = 0.05, len = 0.25) {
    const start = Math.round(from * SR),
      N = Math.round(len * SR),
      p = SR / expected;
    let best = 0,
      bestV = -Infinity;
    const vals = {};
    for (let lag = Math.floor(p * 0.9) - 1; lag <= Math.ceil(p * 1.1) + 1; lag++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += x[start + i] * x[start + i + lag];
      vals[lag] = s;
      if (s > bestV) {
        bestV = s;
        best = lag;
      }
    }
    const a = vals[best - 1],
      b = vals[best],
      c = vals[best + 1];
    return SR / (best + (0.5 * (a - c)) / (a - 2 * b + c));
  }

  async function render(seconds, schedule) {
    const ctx = new OfflineAudioContext(2, Math.round(seconds * SR), SR);
    const bus = createMasterBus(ctx);
    bus.gain.gain.value = 0.64; // default volume 0.8 → 0.8²
    const synth = new SynthInstrument(ctx, bus.input);
    await synth.ready;
    schedule(synth, ctx);
    // Messages reach the worklet thread asynchronously; an offline context renders far faster
    // than realtime, so let them land first or the render can finish before the notes arrive.
    await new Promise((r) => setTimeout(r, 150));
    const buf = await ctx.startRendering();
    const l = buf.getChannelData(0),
      r = buf.getChannelData(1);
    const mono = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) mono[i] = (l[i] + r[i]) / 2;
    return mono;
  }

  const out = { presets: [], stress: [] };
  for (const preset of SOUND_PRESETS) {
    const row = { id: preset.id };
    for (const [label, midi] of [
      ['A2', 45],
      ['E4', 64],
    ]) {
      const x = await render(2.2, (s) => {
        s.setPreset(preset.id);
        s.pluck(1, midi, { velocity: 0.8, when: 0.05 });
      });
      const freq = 440 * 2 ** ((midi - 69) / 12);
      const from = Math.round(0.05 * SR);
      // Distortion presets add harmonics; the autocorrelation still locks onto the fundamental period.
      row[label] = {
        hz: +f0(x, freq, 0.12, 0.2).toFixed(2),
        target: +freq.toFixed(2),
        peak: +peakOf(x).toFixed(3),
        rmsDb: +db(rms(x, from, from + Math.round(0.3 * SR))).toFixed(1),
        centroidHz: Math.round(centroid(x, from + Math.round(0.05 * SR))),
        rmsDb1s: +db(rms(x, Math.round(1.0 * SR), Math.round(1.2 * SR))).toFixed(1),
        rmsDb2s: +db(rms(x, Math.round(1.9 * SR), Math.round(2.1 * SR))).toFixed(1),
      };
    }
    out.presets.push(row);
  }

  // Stress: hammer every string with fast repeated taps + full-velocity strums, per preset.
  for (const preset of SOUND_PRESETS) {
    const x = await render(3, (s) => {
      s.setPreset(preset.id);
      for (let k = 0; k < 60; k++)
        s.pluck(k % 2, 40 + (k % 2) * 5 + (k % 7), { velocity: 1, when: 0.05 + k * 0.012 });
      for (let rep = 0; rep < 4; rep++)
        for (let st = 0; st < 6; st++)
          s.pluck(st, 40 + st * 5, { velocity: 1, when: 1 + rep * 0.15 + st * 0.012 });
    });
    let nan = 0,
      over = 0;
    for (const v of x) {
      if (!Number.isFinite(v)) nan++;
      if (Math.abs(v) > 1) over++;
    }
    out.stress.push({ id: preset.id, peak: +peakOf(x).toFixed(3), nan, over });
  }
  return out;
});

console.log(JSON.stringify(results, null, 1));
await browser.close();
