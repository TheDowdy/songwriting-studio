import { describe, expect, it } from 'vitest';
import { withInversion, type ChordRef, type Key } from '@sw/core';
import { bassPcForMode, defaultBassMode, inversionForBassPc, inversionOptions } from '../src/state/bassMode';

const CMAJ: Key = { tonic: 'C', mode: 'major' };
const chord = (over: Partial<ChordRef> = {}): ChordRef => ({
  root: 'C',
  quality: 'maj',
  seventh: 'maj7',
  flavor: 'triad',
  origin: 'diatonic',
  numeral: 'I',
  ...over,
});

describe('defaultBassMode', () => {
  it('is root for a chord with no slash bass', () => {
    expect(defaultBassMode(chord())).toBe('root');
  });

  it('matches an existing inversion', () => {
    const firstInversion = withInversion(chord(), 1, CMAJ); // C/E
    expect(defaultBassMode(firstInversion)).toBe(1);
    const secondInversion = withInversion(chord(), 2, CMAJ); // C/G
    expect(defaultBassMode(secondInversion)).toBe(2);
  });
});

describe('inversionOptions', () => {
  it('offers 1st/2nd for a triad', () => {
    expect(inversionOptions(chord({ flavor: 'triad' }))).toEqual([1, 2]);
  });

  it('offers 1st/2nd for sus2/sus4/add9 too (the added tone is never a bass note)', () => {
    expect(inversionOptions(chord({ flavor: 'sus4' }))).toEqual([1, 2]);
    expect(inversionOptions(chord({ flavor: 'add9' }))).toEqual([1, 2]);
  });

  it('offers 1st/2nd/3rd for a seventh chord', () => {
    expect(inversionOptions(chord({ flavor: '7', seventh: 'dom7' }))).toEqual([1, 2, 3]);
  });
});

describe('bassPcForMode', () => {
  const G7 = chord({ root: 'G', seventh: 'dom7', flavor: '7', numeral: 'V7' }); // G B D F

  it('root mode requires the chord root', () => {
    expect(bassPcForMode(G7, 'root')).toBe(7); // G
  });

  it('1st/2nd/3rd require that stack tone', () => {
    expect(bassPcForMode(G7, 1)).toBe(11); // B
    expect(bassPcForMode(G7, 2)).toBe(2); // D
    expect(bassPcForMode(G7, 3)).toBe(5); // F
  });

  it('any bass places no restriction', () => {
    expect(bassPcForMode(G7, 'any')).toBeNull();
  });
});

describe('inversionForBassPc', () => {
  const G7 = chord({ root: 'G', seventh: 'dom7', flavor: '7', numeral: 'V7' });

  it('finds the matching stack index', () => {
    expect(inversionForBassPc(G7, 7)).toBe(0); // G: root position
    expect(inversionForBassPc(G7, 11)).toBe(1); // B: 1st inversion
    expect(inversionForBassPc(G7, 2)).toBe(2); // D: 2nd inversion
    expect(inversionForBassPc(G7, 5)).toBe(3); // F: 3rd inversion
  });

  it('is null for a pitch class outside the chord', () => {
    expect(inversionForBassPc(G7, 1)).toBeNull(); // C♯ is not a tone of G7
  });

  it("is null for add9's own added tone (never a bass note)", () => {
    const addNine = chord({ root: 'C', flavor: 'add9' }); // C E G D
    // D (pc 2) is the 9th, present in chordStack but beyond inversionCount for a triad-family chord.
    expect(inversionForBassPc(addNine, 2)).toBeNull();
  });
});
