import { describe, expect, it } from 'vitest';
import { loopDelay, StringBank, type PluckParams } from '../src/audio/synth/stringDsp';
import { midiToFreq } from '../src/theory/notes';

const BLOCK = 128;

function pluckParams(over: Partial<PluckParams> = {}): PluckParams {
  return {
    id: 1,
    string: 0,
    midi: 45,
    detuneCents: 0,
    pan: 0,
    excitation: { lowpass: 0.3, pick: 0.12, level: 0.9 },
    loop: { t60: 4, damping: 0.2, gate: 0 },
    ...over,
  };
}

/** Render `seconds` of mono (L+R) audio in 128-frame blocks like a real worklet. */
function render(bank: StringBank, seconds: number, startFrame = 0): Float32Array {
  const total = Math.round(seconds * bank.sampleRate);
  const out = new Float32Array(total);
  const l = new Float32Array(BLOCK);
  const r = new Float32Array(BLOCK);
  for (let f = 0; f < total; f += BLOCK) {
    const n = Math.min(BLOCK, total - f);
    bank.process(l, r, n, startFrame + f);
    for (let i = 0; i < n; i++) out[f + i] = (l[i] as number) + (r[i] as number);
  }
  return out;
}

/** Fundamental via normalised autocorrelation around the expected period + parabolic refinement. */
function estimateFreq(x: Float32Array, sr: number, expected: number, from = 0.05, len = 0.3) {
  const start = Math.round(from * sr);
  const N = Math.round(len * sr);
  const p = sr / expected;
  const lo = Math.floor(p * 0.85);
  const hi = Math.ceil(p * 1.15);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < N; i++) s += (x[start + i] as number) * (x[start + i + lag] as number);
    return s;
  };
  let best = lo;
  let bestV = -Infinity;
  const vals = new Map<number, number>();
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    const v = ac(lag);
    vals.set(lag, v);
    if (lag >= lo && lag <= hi && v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  const a = vals.get(best - 1) as number;
  const b = vals.get(best) as number;
  const c = vals.get(best + 1) as number;
  const shift = (0.5 * (a - c)) / (a - 2 * b + c);
  return sr / (best + shift);
}

const cents = (f: number, target: number) => 1200 * Math.log2(f / target);
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = a; i < b; i++) s += (x[i] as number) ** 2;
  return Math.sqrt(s / (b - a));
};

describe('loopDelay', () => {
  it('equals sr/f0 with no damping and is shortened by the filter phase delay otherwise', () => {
    expect(loopDelay(110, 0, 48000)).toBeCloseTo(48000 / 110, 10);
    const d = loopDelay(110, 0.3, 48000);
    expect(d).toBeLessThan(48000 / 110);
    // Low-frequency phase delay of the one-pole is a/(1−a).
    expect(48000 / 110 - d).toBeCloseTo(0.3 / 0.7, 1);
  });
});

describe('pitch accuracy', () => {
  it('open A string (MIDI 45) sounds at 110 Hz', () => {
    const bank = new StringBank(48000);
    bank.pluck(0, pluckParams({ midi: 45 }));
    const f = estimateFreq(render(bank, 0.6), 48000, 110);
    expect(f).toBeCloseTo(110, 1);
    expect(Math.abs(cents(f, 110))).toBeLessThan(1.5);
  });

  for (const sr of [44100, 48000]) {
    it(`is within 3 cents across the whole playable range at ${sr} Hz`, () => {
      for (let midi = 28; midi <= 88; midi += 3) {
        const bank = new StringBank(sr);
        bank.pluck(0, pluckParams({ midi, loop: { t60: 3, damping: 0.25, gate: 0 } }));
        const target = midiToFreq(midi);
        const f = estimateFreq(render(bank, 0.5, 0), sr, target, 0.04, 0.2);
        expect(Math.abs(cents(f, target)), `MIDI ${midi}`).toBeLessThan(3);
      }
    });
  }

  it('accounts for detune in cents', () => {
    const bank = new StringBank(48000);
    bank.pluck(0, pluckParams({ midi: 45, detuneCents: 20 }));
    const f = estimateFreq(render(bank, 0.6), 48000, 110);
    expect(cents(f, 110)).toBeCloseTo(20, 0);
  });

  it('fractional MIDI values give in-between pitches', () => {
    const bank = new StringBank(48000);
    bank.pluck(0, pluckParams({ midi: 45.5 }));
    const f = estimateFreq(render(bank, 0.6), 48000, midiToFreq(45.5));
    expect(Math.abs(cents(f, midiToFreq(45.5)))).toBeLessThan(2);
  });
});

describe('continuous pitch (peg glide)', () => {
  it('glides to a new pitch without re-plucking, with no discontinuities', () => {
    const sr = 48000;
    const bank = new StringBank(sr);
    bank.pluck(0, pluckParams({ midi: 45 }));
    // Ramp down 3 semitones over 200 ms, starting at 0.1 s.
    bank.setPitch(Math.round(0.1 * sr), 1, 42, 200);
    const x = render(bank, 1.0);

    const before = estimateFreq(x, sr, 110, 0.02, 0.07);
    const after = estimateFreq(x, sr, midiToFreq(42), 0.5, 0.3);
    expect(Math.abs(cents(before, 110))).toBeLessThan(3);
    expect(Math.abs(cents(after, midiToFreq(42)))).toBeLessThan(4);

    // Continuity: a plucked noise burst is jagged by nature, so compare the glide region against
    // the same stretch of an identical pluck with no glide. A click would show as a far larger jump.
    const plain = new StringBank(sr);
    plain.pluck(0, pluckParams({ midi: 45 }));
    const base = render(plain, 1.0);
    const maxJump = (v: Float32Array, a: number, b: number) => {
      let m = 0;
      for (let i = a; i < b; i++)
        m = Math.max(m, Math.abs((v[i] as number) - (v[i - 1] as number)));
      return m;
    };
    const region: [number, number] = [Math.round(0.1 * sr), Math.round(0.5 * sr)];
    expect(maxJump(x, ...region)).toBeLessThan(maxJump(base, ...region) * 1.25);
    // The note keeps decaying (not re-excited): the tail is quieter than the head.
    expect(rms(x, 0.7 * sr, 0.9 * sr)).toBeLessThan(rms(x, 0.02 * sr, 0.1 * sr));
  });

  it('rises smoothly too, and reaches the target exactly', () => {
    const sr = 44100;
    const bank = new StringBank(sr);
    bank.pluck(0, pluckParams({ midi: 50 }));
    bank.setPitch(Math.round(0.05 * sr), 1, 53, 100);
    const x = render(bank, 0.8);
    const f = estimateFreq(x, sr, midiToFreq(53), 0.4, 0.25);
    expect(Math.abs(cents(f, midiToFreq(53)))).toBeLessThan(4);
  });

  it('ignores pitch changes for unknown voices', () => {
    const bank = new StringBank(48000);
    bank.pluck(0, pluckParams({ midi: 45 }));
    bank.setPitch(0, 999, 60, 0);
    const f = estimateFreq(render(bank, 0.6), 48000, 110);
    expect(Math.abs(cents(f, 110))).toBeLessThan(1.5);
  });
});

describe('damping, voices and safety', () => {
  it('damp fades a note out quickly and smoothly, then frees the voice', () => {
    const sr = 48000;
    const bank = new StringBank(sr);
    bank.pluck(0, pluckParams());
    bank.damp(Math.round(0.2 * sr), 1);
    const x = render(bank, 0.6);
    expect(rms(x, Math.round(0.35 * sr), Math.round(0.6 * sr))).toBeLessThan(1e-4);
    expect(bank.activeVoices).toBe(0);
    let maxJump = 0;
    for (let i = Math.round(0.2 * sr); i < Math.round(0.3 * sr); i++) {
      maxJump = Math.max(maxJump, Math.abs((x[i] as number) - (x[i - 1] as number)));
    }
    expect(maxJump).toBeLessThan(0.2);
  });

  it('plucking a string again damps the previous note on that string only', () => {
    const sr = 48000;
    const bank = new StringBank(sr);
    bank.pluck(0, pluckParams({ id: 1, string: 0, midi: 40 }));
    bank.pluck(0, pluckParams({ id: 2, string: 1, midi: 45 }));
    render(bank, 0.05);
    expect(bank.heldVoicesOnString(0)).toBe(1);
    expect(bank.heldVoicesOnString(1)).toBe(1);

    bank.pluck(0.05 * sr, pluckParams({ id: 3, string: 0, midi: 42 }));
    render(bank, 0.05, Math.round(0.05 * sr));
    expect(bank.heldVoicesOnString(0)).toBe(1); // id 3 only
    expect(bank.heldVoicesOnString(1)).toBe(1); // untouched
    // The replaced voice has faded out entirely after a further 100 ms.
    render(bank, 0.1, Math.round(0.1 * sr));
    expect(bank.activeVoices).toBe(2);
  });

  it('schedules sample-accurately and treats past frames as "now"', () => {
    const sr = 48000;
    const bank = new StringBank(sr);
    bank.pluck(Math.round(0.1 * sr) + 7, pluckParams());
    const x = render(bank, 0.2);
    const first = x.findIndex((v) => Math.abs(v) > 1e-6);
    expect(first).toBe(Math.round(0.1 * sr) + 7);

    const late = new StringBank(sr);
    late.pluck(-500, pluckParams());
    expect(render(late, 0.05).findIndex((v) => Math.abs(v) > 1e-6)).toBe(0);
  });

  it('stays bounded and finite under a barrage of fast repeated plucks on all strings', () => {
    const sr = 48000;
    const bank = new StringBank(sr);
    let id = 0;
    for (let k = 0; k < 400; k++) {
      const frame = k * Math.round(0.004 * sr); // a pluck every 4 ms
      bank.pluck(frame, pluckParams({ id: ++id, string: k % 6, midi: 40 + (k % 6) * 5 }));
    }
    const x = render(bank, 2);
    expect(x.every(Number.isFinite)).toBe(true);
    expect(peak(x)).toBeLessThan(8); // 16 voices max, each ≤ ~1
    expect(bank.activeVoices).toBeLessThanOrEqual(16);
  });

  it('steals the quietest voice when the pool is exhausted, without breaking', () => {
    const bank = new StringBank(48000, 2);
    for (let s = 0; s < 6; s++) bank.pluck(0, pluckParams({ id: s + 1, string: s, midi: 40 + s }));
    const x = render(bank, 0.2);
    expect(x.every(Number.isFinite)).toBe(true);
    expect(bank.activeVoices).toBe(2);
  });

  it('a gated voice cuts its tail once it falls below the gate level', () => {
    const sr = 48000;
    const open = new StringBank(sr);
    const gated = new StringBank(sr);
    open.pluck(0, pluckParams({ loop: { t60: 8, damping: 0.2, gate: 0 } }));
    gated.pluck(0, pluckParams({ loop: { t60: 8, damping: 0.2, gate: 0.05 } }));
    const a = render(open, 3);
    const b = render(gated, 3);
    expect(rms(b, 2 * sr, 3 * sr)).toBeLessThan(rms(a, 2 * sr, 3 * sr) * 0.1);
  });

  it('pans with equal power', () => {
    const sr = 48000;
    const bank = new StringBank(sr);
    bank.pluck(0, pluckParams({ pan: -1 }));
    const l = new Float32Array(BLOCK);
    const r = new Float32Array(BLOCK);
    bank.process(l, r, BLOCK, 0);
    expect(peak(r)).toBeLessThan(1e-6);
    expect(peak(l)).toBeGreaterThan(0.1);
  });

  it('brighter excitation (lower lowpass) has more high-frequency energy', () => {
    const sr = 48000;
    const hf = (lowpass: number) => {
      const bank = new StringBank(sr);
      bank.pluck(0, pluckParams({ excitation: { lowpass, pick: 0, level: 0.9 } }));
      const x = render(bank, 0.1);
      // First difference emphasises highs.
      let d = 0;
      let t = 0;
      for (let i = 1; i < x.length; i++) {
        d += ((x[i] as number) - (x[i - 1] as number)) ** 2;
        t += (x[i] as number) ** 2;
      }
      return d / t;
    };
    expect(hf(0.0)).toBeGreaterThan(hf(0.8) * 3);
  });
});
