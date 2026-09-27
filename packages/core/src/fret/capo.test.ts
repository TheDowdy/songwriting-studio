import { describe, expect, it } from 'vitest';
import {
  capoedFretCount,
  capoedTuning,
  isBehindCapo,
  MAX_CAPO,
  sanitizeCapo,
  toPhysicalFret,
  toRelativeFret,
} from './capo';

describe('sanitizeCapo (untrusted storage/import input, §8)', () => {
  it('clamps to 0–12', () => {
    expect(sanitizeCapo(-3)).toBe(0);
    expect(sanitizeCapo(20)).toBe(MAX_CAPO);
    expect(sanitizeCapo(12)).toBe(12);
    expect(sanitizeCapo(0)).toBe(0);
  });
  it('rounds fractional input', () => {
    expect(sanitizeCapo(2.6)).toBe(3);
    expect(sanitizeCapo(2.4)).toBe(2);
  });
  it('defaults to 0 for anything not a finite number', () => {
    expect(sanitizeCapo(undefined)).toBe(0);
    expect(sanitizeCapo(null)).toBe(0);
    expect(sanitizeCapo('capo')).toBe(0);
    expect(sanitizeCapo(NaN)).toBe(0);
    expect(sanitizeCapo(Infinity)).toBe(0); // not finite either — defaults, rather than clamping
  });
  it('accepts numeric strings (JSON round-trips as numbers, but be lenient)', () => {
    expect(sanitizeCapo('5')).toBe(5);
  });
});

describe('capoedTuning', () => {
  it('raises every open string by the capo', () => {
    expect(capoedTuning([40, 45, 50, 55, 59, 64], 2)).toEqual([42, 47, 52, 57, 61, 66]);
  });
  it('is the identity at capo 0', () => {
    const strings = [40, 45, 50, 55, 59, 64];
    expect(capoedTuning(strings, 0)).toEqual(strings);
  });
});

describe('capoedFretCount', () => {
  it('shortens the neck by the capo', () => {
    expect(capoedFretCount(22, 3)).toBe(19);
  });
  it('never goes negative, even past the fret count', () => {
    expect(capoedFretCount(12, 20)).toBe(0);
  });
  it('is the identity at capo 0', () => {
    expect(capoedFretCount(22, 0)).toBe(22);
  });
});

describe('toPhysicalFret / toRelativeFret (round-trip, §7 Phase 3 item 4)', () => {
  it('adds/subtracts the capo', () => {
    expect(toPhysicalFret(0, 3)).toBe(3);
    expect(toPhysicalFret(2, 3)).toBe(5);
    expect(toRelativeFret(5, 3)).toBe(2);
    expect(toRelativeFret(3, 3)).toBe(0);
  });
  it('passes muted (null) through unchanged either way', () => {
    expect(toPhysicalFret(null, 5)).toBeNull();
    expect(toRelativeFret(null, 5)).toBeNull();
  });
  it('a fret behind the capo has no relative position', () => {
    expect(toRelativeFret(1, 3)).toBeNull();
    expect(toRelativeFret(0, 3)).toBeNull();
  });
  it('round-trips for every fret at or past the capo', () => {
    for (let capo = 0; capo <= 12; capo++) {
      for (let physical = capo; physical <= 22; physical++) {
        const rel = toRelativeFret(physical, capo);
        expect(rel).not.toBeNull();
        expect(toPhysicalFret(rel, capo)).toBe(physical);
      }
    }
  });
  it('is the identity at capo 0', () => {
    expect(toPhysicalFret(4, 0)).toBe(4);
    expect(toRelativeFret(4, 0)).toBe(4);
  });
});

describe('isBehindCapo', () => {
  it('the open string and every fret short of the capo are behind it', () => {
    expect(isBehindCapo(0, 2)).toBe(true);
    expect(isBehindCapo(1, 2)).toBe(true);
  });
  it('the capo fret itself and beyond are not', () => {
    expect(isBehindCapo(2, 2)).toBe(false);
    expect(isBehindCapo(5, 2)).toBe(false);
  });
  it('nothing is behind a capo of 0', () => {
    expect(isBehindCapo(0, 0)).toBe(false);
  });
});
