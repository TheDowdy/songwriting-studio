import { describe, expect, it } from 'vitest';
import { formatNoteName, parseNoteName, type NoteName } from '../src/theory/notes';
import {
  bestRootSpelling,
  getScale,
  parseDegree,
  SCALES,
  scalePitchClasses,
  scaleSpelling,
  spellScale,
} from '../src/theory/scales';

const spell = (root: string, scaleId: string, pref: 'sharp' | 'flat' = 'sharp') =>
  spellScale(parseNoteName(root), getScale(scaleId), pref).map(formatNoteName);

describe('scale definitions', () => {
  it('has every scale required by the plan', () => {
    expect(SCALES).toHaveLength(21);
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(SCALES.length);
  });

  it('derives intervals from degrees', () => {
    expect(getScale('major').intervals).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(getScale('natural-minor').intervals).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(getScale('minor-pentatonic').intervals).toEqual([0, 3, 5, 7, 10]);
    expect(getScale('blues').intervals).toEqual([0, 3, 5, 6, 7, 10]);
    expect(getScale('harmonic-minor').intervals).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(getScale('phrygian-dominant').intervals).toEqual([0, 1, 4, 5, 7, 8, 10]);
    expect(getScale('whole-tone').intervals).toEqual([0, 2, 4, 6, 8, 10]);
    expect(getScale('diminished-hw').intervals).toEqual([0, 1, 3, 4, 6, 7, 9, 10]);
    expect(getScale('diminished-wh').intervals).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
    expect(getScale('hungarian-minor').intervals).toEqual([0, 2, 3, 6, 7, 8, 11]);
    expect(getScale('double-harmonic').intervals).toEqual([0, 1, 4, 5, 7, 8, 11]);
    expect(getScale('chromatic').intervals).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('records degree numbers relative to major (minor pentatonic = 1 ♭3 4 5 ♭7)', () => {
    expect(getScale('minor-pentatonic').degrees.map((d) => d.label)).toEqual([
      '1',
      '♭3',
      '4',
      '5',
      '♭7',
    ]);
    expect(getScale('minor-pentatonic').degrees.map((d) => d.number)).toEqual([1, 3, 4, 5, 7]);
  });

  it('stays in ascending order and inside one octave', () => {
    for (const s of SCALES) {
      expect(s.intervals[0]).toBe(0);
      expect([...s.intervals].sort((a, b) => a - b)).toEqual([...s.intervals]);
      expect(Math.max(...s.intervals)).toBeLessThan(12);
    }
  });

  it('rejects bad degrees and unknown ids', () => {
    expect(() => parseDegree('8')).toThrow();
    expect(() => parseDegree('x3')).toThrow();
    expect(() => getScale('nope')).toThrow();
  });
});

describe('scale spelling', () => {
  it('spells F major with B♭ (not A♯)', () => {
    expect(spell('F', 'major')).toEqual(['F', 'G', 'A', 'B♭', 'C', 'D', 'E']);
  });

  it('spells G♯ harmonic minor with F𝄪', () => {
    expect(spell('G♯', 'harmonic-minor')).toEqual(['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E', 'F𝄪']);
  });

  it('spells sharp and flat keys', () => {
    expect(spell('D♭', 'major')).toEqual(['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C']);
    expect(spell('F♯', 'major')).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
    expect(spell('B♭', 'natural-minor')).toEqual(['B♭', 'C', 'D♭', 'E♭', 'F', 'G♭', 'A♭']);
    expect(spell('E', 'minor-pentatonic')).toEqual(['E', 'G', 'A', 'B', 'D']);
  });

  it('uses one letter per degree in 7-note scales', () => {
    for (const s of SCALES.filter((x) => x.degrees.length === 7)) {
      for (const root of ['C', 'F♯', 'B♭', 'G♯', 'E♭', 'D']) {
        const letters = spellScale(parseNoteName(root), s).map((n) => n.letter);
        expect(new Set(letters).size, `${root} ${s.id}`).toBe(7);
      }
    }
  });

  it('spells altered pentatonic/blues/symmetric scales sensibly', () => {
    expect(spell('A', 'blues')).toEqual(['A', 'C', 'D', 'E♭', 'E', 'G']);
    expect(spell('C', 'whole-tone')).toEqual(['C', 'D', 'E', 'F♯', 'G♯', 'B♭']);
    expect(spell('C', 'diminished-hw')).toEqual(['C', 'D♭', 'E♭', 'E', 'F♯', 'G', 'A', 'B♭']);
    expect(spell('C', 'diminished-wh')).toEqual(['C', 'D', 'E♭', 'F', 'G♭', 'A♭', 'A', 'B']);
  });

  it('spells the chromatic scale by preference', () => {
    expect(spell('C', 'chromatic', 'sharp')[1]).toBe('C♯');
    expect(spell('C', 'chromatic', 'flat')[1]).toBe('D♭');
  });

  it('never produces more than a double accidental', () => {
    for (const s of SCALES) {
      for (let pc = 0; pc < 12; pc++) {
        for (const pref of ['sharp', 'flat'] as const) {
          const root = bestRootSpelling(pc, s, pref);
          for (const n of spellScale(root, s, pref)) expect(Math.abs(n.acc)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('spelled notes land on the right pitch classes', () => {
    const root = parseNoteName('G♯');
    const major = getScale('harmonic-minor');
    expect(scalePitchClasses(root, major)).toEqual([8, 10, 11, 1, 3, 4, 7]);
  });

  it('scaleSpelling names in-scale pitch classes correctly and the rest by preference', () => {
    const sp = scaleSpelling(parseNoteName('F'), getScale('major'), 'sharp');
    expect(formatNoteName(sp[10] as NoteName)).toBe('B♭'); // in scale
    expect(formatNoteName(sp[1] as NoteName)).toBe('C♯'); // out of scale → pref
  });

  it('picks sensible root spellings', () => {
    const name = (pc: number, id: string, pref: 'sharp' | 'flat' = 'sharp') =>
      formatNoteName(bestRootSpelling(pc, getScale(id), pref));
    expect(name(3, 'major')).toBe('E♭'); // not D♯ major
    expect(name(10, 'major')).toBe('B♭');
    expect(name(1, 'natural-minor')).toBe('C♯'); // 4 sharps beats D♭ minor's 8 flats
    expect(name(6, 'major', 'sharp')).toBe('F♯'); // tie → preference
    expect(name(6, 'major', 'flat')).toBe('G♭');
  });
});
