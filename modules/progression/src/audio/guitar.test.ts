import { describe, expect, it } from 'vitest';
import { renderPluck } from './engine';

const SR = 44100;
const rms = (a: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};

/** Dominant period via autocorrelation, converted to Hz. */
function pitch(a: Float32Array, lo: number, hi: number) {
  let best = 0;
  let bestLag = lo;
  for (let lag = lo; lag <= hi; lag++) {
    let c = 0;
    for (let i = 0; i < 8000; i++) c += a[2000 + i] * a[2000 + i + lag];
    if (c > best) (best = c), (bestLag = lag);
  }
  return SR / bestLag;
}

describe('renderPluck', () => {
  it('is in tune', () => {
    const a = renderPluck(45, SR); // A2 = 110 Hz
    expect(Math.abs(pitch(a, 300, 500) - 110)).toBeLessThan(1.5);
  });
  it('is deterministic and never clips', () => {
    const a = renderPluck(52, SR);
    expect(Array.from(renderPluck(52, SR).slice(0, 50))).toEqual(Array.from(a.slice(0, 50)));
    expect(a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(0.61);
  });
  it('decays gradually: audible ring at 1s, much quieter by 2.5s', () => {
    const a = renderPluck(52, SR);
    const early = rms(a, 2000, 6000);
    const oneSec = rms(a, SR, SR + 4000);
    const late = rms(a, Math.floor(SR * 2.5), Math.floor(SR * 2.5) + 4000);
    expect(oneSec / early).toBeGreaterThan(0.25);
    expect(late / early).toBeLessThan(0.15);
  });
});
