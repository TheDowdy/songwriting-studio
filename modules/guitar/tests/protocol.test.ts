import { describe, expect, it } from 'vitest';
import { applyWorkletMessage, type WorkletMessage } from '../src/audio/synth/protocol';
import { StringBank, type PluckParams } from '../src/audio/synth/stringDsp';

const SR = 44100;
const params = (over: Partial<PluckParams> = {}): PluckParams => ({
  id: 1,
  string: 0,
  midi: 45,
  detuneCents: 0,
  pan: 0,
  excitation: { lowpass: 0.5, pick: 0, level: 0.8 },
  loop: { t60: 2, damping: 0.3, gate: 0 },
  ...over,
});
const render = (bank: StringBank, frames: number, start = 0) => {
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  bank.process(l, r, frames, start);
  return l;
};
const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('applyWorkletMessage (shared by the AudioWorklet and the ScriptProcessor fallback)', () => {
  it('a pluck with no time sounds immediately', () => {
    const bank = new StringBank(SR);
    applyWorkletMessage(bank, { type: 'pluck', params: params() }, SR);
    expect(peak(render(bank, 2048))).toBeGreaterThan(0.01);
  });

  it('a pluck scheduled for a time (seconds) starts at that frame, not before', () => {
    const bank = new StringBank(SR);
    applyWorkletMessage(bank, { type: 'pluck', params: params({ when: 0.05 }) }, SR);
    const out = render(bank, SR / 5);
    const first = out.findIndex((v) => Math.abs(v) > 1e-4);
    expect(first).toBeGreaterThanOrEqual(Math.round(0.05 * SR));
    expect(first).toBeLessThan(Math.round(0.05 * SR) + 300);
  });

  it('a past time plays immediately', () => {
    const bank = new StringBank(SR);
    applyWorkletMessage(bank, { type: 'pluck', params: params({ when: 0.001 }) }, SR);
    // Start rendering well after that time.
    expect(peak(render(bank, 1024, SR))).toBeGreaterThan(0.01);
  });

  it('damp silences the voice, and a pitch message retunes it', () => {
    const bank = new StringBank(SR);
    const send = (m: WorkletMessage) => applyWorkletMessage(bank, m, SR);
    send({ type: 'pluck', params: params() });
    render(bank, 1024);
    send({ type: 'damp', id: 1 });
    render(bank, 4096, 1024);
    expect(peak(render(bank, 1024, 5120))).toBeLessThan(1e-3);

    // A pitch message changes what the voice does (the browser check measures the glide itself).
    const control = new StringBank(SR);
    applyWorkletMessage(control, { type: 'pluck', params: params({ id: 2 }) }, SR);
    const plain = render(control, 4096);
    const bent = new StringBank(SR);
    applyWorkletMessage(bent, { type: 'pluck', params: params({ id: 2 }) }, SR);
    applyWorkletMessage(bent, { type: 'pitch', id: 2, midi: 57, rampMs: 0 }, SR);
    const changed = render(bent, 4096);
    expect(peak(changed)).toBeGreaterThan(0.01);
    expect(changed.every((v) => Number.isFinite(v))).toBe(true);
    expect(changed.some((v, i) => Math.abs(v - (plain[i] as number)) > 1e-3)).toBe(true);
  });
});
