import { describe, expect, it } from 'vitest';
import { driveCurve } from '../src/audio/effects';
import { DEFAULT_PRESET_ID, getSoundPreset, SOUND_PRESETS } from '../src/audio/synth/presets';
import { volumeToGain } from '../src/audio/volume';

describe('sound presets', () => {
  it('ships the six presets from the plan, with unique ids', () => {
    expect(SOUND_PRESETS.map((p) => p.id)).toEqual([
      'acoustic',
      'classical',
      'clean',
      'jazz',
      'crunch',
      'highgain',
    ]);
    expect(new Set(SOUND_PRESETS.map((p) => p.id)).size).toBe(6);
    expect(getSoundPreset(DEFAULT_PRESET_ID).id).toBe(DEFAULT_PRESET_ID);
    expect(() => getSoundPreset('nope' as never)).toThrow();
  });

  it('keeps every parameter in a sane range', () => {
    for (const p of SOUND_PRESETS) {
      const s = p.string;
      expect(s.pluckLowpass, p.id).toBeGreaterThanOrEqual(0);
      expect(s.pluckLowpass + s.velocitySoftening * 1.5, p.id).toBeLessThan(1.5);
      expect(s.pickPosition, p.id).toBeGreaterThanOrEqual(0);
      expect(s.pickPosition, p.id).toBeLessThan(0.5);
      expect(s.sustain, p.id).toBeGreaterThan(0.5);
      expect(s.damping, p.id).toBeLessThan(0.9);
      expect(p.level, p.id).toBeGreaterThan(0);
      expect(p.level, p.id).toBeLessThanOrEqual(1);
      expect(p.reverb.mix, p.id).toBeGreaterThanOrEqual(0);
      expect(p.reverb.mix, p.id).toBeLessThan(0.5);
      for (const f of [
        ...p.body,
        ...(p.cab ?? []),
        ...(p.drive?.pre ?? []),
        ...(p.drive?.post ?? []),
      ]) {
        expect(f.freq, p.id).toBeGreaterThan(20);
        expect(f.freq, p.id).toBeLessThan(20000);
      }
    }
  });

  it('gives the presets their intended character', () => {
    const by = (id: Parameters<typeof getSoundPreset>[0]) => getSoundPreset(id).string;
    // Nylon and jazz are darker and shorter/rounder than steel.
    expect(by('classical').damping).toBeGreaterThan(by('acoustic').damping);
    expect(by('jazz').damping).toBeGreaterThan(by('clean').damping);
    expect(by('classical').sustain).toBeLessThan(by('acoustic').sustain);
    // Only the distorted presets have a drive stage; only high-gain gates its tail.
    expect(SOUND_PRESETS.filter((p) => p.drive).map((p) => p.id)).toEqual(['crunch', 'highgain']);
    expect(by('highgain').gate).toBeGreaterThan(0);
    expect(SOUND_PRESETS.filter((p) => p.string.gate > 0).map((p) => p.id)).toEqual(['highgain']);
    expect(getSoundPreset('highgain').drive!.amount).toBeGreaterThan(
      getSoundPreset('crunch').drive!.amount,
    );
  });
});

describe('drive curve', () => {
  it('is bounded, monotonic and passes through zero', () => {
    for (const spec of [
      { amount: 4, asymmetry: 0 },
      { amount: 22, asymmetry: 0.35 },
    ]) {
      const c = driveCurve(spec);
      expect(c.every((v) => Math.abs(v) <= 2)).toBe(true);
      for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
      expect(c[((c.length - 1) / 2) | 0]!).toBeCloseTo(0, 1);
    }
  });

  it('is odd-symmetric with no asymmetry and lopsided with it', () => {
    const sym = driveCurve({ amount: 6, asymmetry: 0 });
    expect(sym[0]!).toBeCloseTo(-sym[sym.length - 1]!, 6);
    const asym = driveCurve({ amount: 6, asymmetry: 0.4 });
    expect(Math.abs(asym[0]! + asym[asym.length - 1]!)).toBeGreaterThan(0.05);
  });

  it('clips harder with more drive', () => {
    const soft = driveCurve({ amount: 1, asymmetry: 0 });
    const hard = driveCurve({ amount: 20, asymmetry: 0 });
    const q = Math.floor(soft.length * 0.6);
    expect(hard[q]!).toBeGreaterThan(soft[q]!);
  });
});

describe('volume curve', () => {
  it('maps 0 → silence, 1 → unity, monotonic in between, clamped outside', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 10);
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(5)).toBe(1);
    let prev = 0;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      expect(volumeToGain(v)).toBeGreaterThanOrEqual(prev);
      prev = volumeToGain(v);
    }
  });
});
