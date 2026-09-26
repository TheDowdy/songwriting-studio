import { describe, expect, it } from 'vitest';
import {
  chordName,
  chordNotes,
  diatonicChord,
  diatonicChords,
  inversionOf,
  relabel,
  transposeChord,
  withFlavor,
  withInversion,
} from './chords';
import { MODES, scaleNotes } from './scales';
import type { Key, Mode } from './types';

const key = (tonic: string, mode: Mode): Key => ({ tonic, mode });
const names = (k: Key) => diatonicChords(k).map(chordName);
const numerals = (k: Key) => diatonicChords(k).map((c) => c.numeral);

describe('scales', () => {
  it('spells F# major with E#, not F', () => {
    expect(scaleNotes(key('F#', 'major'))).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
  });
  it('spells Gb major with Cb', () => {
    expect(scaleNotes(key('Gb', 'major'))).toEqual(['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
  });
  it('builds every mode for every tonic spelling with 7 distinct letters', () => {
    const tonics = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
    for (const t of tonics)
      for (const m of MODES) {
        const notes = scaleNotes(key(t, m));
        expect(new Set(notes.map((n) => n[0])).size).toBe(7);
      }
  });
});

describe('diatonic triads and numerals', () => {
  it('C major', () => {
    expect(names(key('C', 'major'))).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(numerals(key('C', 'major'))).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  });
  it('A natural minor', () => {
    expect(names(key('A', 'minor'))).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(numerals(key('A', 'minor'))).toEqual(['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII']);
  });
  it('D Dorian matches the plan: i ii ♭III IV v vi° ♭VII', () => {
    expect(names(key('D', 'dorian'))).toEqual(['Dm', 'Em', 'F', 'G', 'Am', 'Bdim', 'C']);
    expect(numerals(key('D', 'dorian'))).toEqual(['i', 'ii', '♭III', 'IV', 'v', 'vi°', '♭VII']);
  });
  it('E Phrygian', () => {
    expect(names(key('E', 'phrygian'))).toEqual(['Em', 'F', 'G', 'Am', 'Bdim', 'C', 'Dm']);
    expect(numerals(key('E', 'phrygian'))).toEqual(['i', '♭II', '♭III', 'iv', 'v°', '♭VI', '♭vii']);
  });
  it('F Lydian', () => {
    expect(names(key('F', 'lydian'))).toEqual(['F', 'G', 'Am', 'Bdim', 'C', 'Dm', 'Em']);
    expect(numerals(key('F', 'lydian'))).toEqual(['I', 'II', 'iii', '♯iv°', 'V', 'vi', 'vii']);
  });
  it('C Mixolydian has B♭ as ♭VII', () => {
    expect(names(key('C', 'mixolydian'))).toEqual(['C', 'Dm', 'Edim', 'F', 'Gm', 'Am', 'B♭']);
    expect(numerals(key('C', 'mixolydian'))).toEqual(['I', 'ii', 'iii°', 'IV', 'v', 'vi', '♭VII']);
  });
  it('B Locrian', () => {
    expect(names(key('B', 'locrian'))).toEqual(['Bdim', 'C', 'Dm', 'Em', 'F', 'G', 'Am']);
    expect(numerals(key('B', 'locrian'))).toEqual(['i°', '♭II', '♭iii', 'iv', '♭V', '♭VI', '♭vii']);
  });
  it('F# major spells E#dim and keeps sharps', () => {
    expect(names(key('F#', 'major'))).toEqual(['F♯', 'G♯m', 'A♯m', 'B', 'C♯', 'D♯m', 'E♯dim']);
    expect(numerals(key('F#', 'major'))).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  });
  it('Gb major spells Cb and Fdim', () => {
    expect(names(key('Gb', 'major'))).toEqual(['G♭', 'A♭m', 'B♭m', 'C♭', 'D♭', 'E♭m', 'Fdim']);
  });
  it('qualities come from the scale for every mode (chord tones are all in the scale)', () => {
    for (const m of MODES) {
      const k = key('E', m);
      const scale = scaleNotes(k).map((n) => n);
      for (const c of diatonicChords(k, '7')) {
        for (const n of chordNotes(c)) {
          expect(scale.some((s) => s === n)).toBe(true);
        }
      }
    }
  });
});

describe('7th chords', () => {
  it('C major diatonic 7ths', () => {
    const k = key('C', 'major');
    expect(diatonicChords(k, '7').map(chordName)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7♭5']);
    expect(diatonicChords(k, '7').map((c) => c.numeral)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7']);
  });
  it('A minor: the vii of harmonic-style stacks is not invented (natural minor only)', () => {
    expect(diatonicChords(key('A', 'minor'), '7').map(chordName)).toEqual([
      'Am7', 'Bm7♭5', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7',
    ]);
  });
  it('spells 7ths correctly in F# major', () => {
    expect(chordNotes(diatonicChord(key('F#', 'major'), 4, '7'))).toEqual(['C#', 'E#', 'G#', 'B']);
  });
});

describe('flavors', () => {
  const k = key('C', 'major');
  const g = diatonicChord(k, 4);
  it('sus2 / sus4 / add9 names, notes and numerals', () => {
    const sus4 = withFlavor(g, 'sus4', k);
    expect(chordName(sus4)).toBe('Gsus4');
    expect(chordNotes(sus4)).toEqual(['G', 'C', 'D']);
    expect(sus4.numeral).toBe('Vsus4');
    expect(chordNotes(withFlavor(g, 'sus2', k))).toEqual(['G', 'A', 'D']);
    const add9 = withFlavor(diatonicChord(k, 5), 'add9', k);
    expect(chordName(add9)).toBe('Amadd9');
    expect(chordNotes(add9)).toEqual(['A', 'C', 'E', 'B']);
    expect(add9.numeral).toBe('vi(add9)');
  });
  it('a flavor does not change the root or origin', () => {
    const f = withFlavor(g, '7', k);
    expect(f.root).toBe('G');
    expect(f.origin).toBe('diatonic');
    expect(f.numeral).toBe('V7');
  });
});

describe('inversions', () => {
  const k = key('C', 'major');
  const c = diatonicChord(k, 0);
  it('first and second inversion triads', () => {
    const first = withInversion(c, 1, k);
    expect(chordName(first)).toBe('C/E');
    expect(first.numeral).toBe('I⁶');
    expect(inversionOf(first)).toBe(1);
    const second = withInversion(c, 2, k);
    expect(chordName(second)).toBe('C/G');
    expect(second.numeral).toBe('I⁶₄');
  });
  it('7th chord inversions use 6/5, 4/3, 4/2', () => {
    const v7 = withFlavor(diatonicChord(k, 4), '7', k);
    expect(withInversion(v7, 1, k).numeral).toBe('V⁶₅');
    expect(withInversion(v7, 2, k).numeral).toBe('V⁴₃');
    const third = withInversion(v7, 3, k);
    expect(third.numeral).toBe('V⁴₂');
    expect(chordName(third)).toBe('G7/F');
  });
  it('inversion 0 clears the bass; out-of-range is clamped', () => {
    expect(withInversion(withInversion(c, 2, k), 0, k).bass).toBeUndefined();
    expect(inversionOf(withInversion(c, 9, k))).toBe(2);
  });
  it('changing flavor drops the inversion', () => {
    expect(withFlavor(withInversion(c, 1, k), '7', k).bass).toBeUndefined();
  });
});

describe('relabel and transpose', () => {
  it('transposes C major chords to D major', () => {
    const from = key('C', 'major');
    const to = key('D', 'major');
    const moved = diatonicChords(from).map((c) => transposeChord(c, '2M', to));
    expect(moved.map(chordName)).toEqual(names(to));
    expect(moved.map((c) => c.numeral)).toEqual(numerals(to));
    expect(moved.every((c) => c.origin === 'diatonic')).toBe(true);
  });
  it('relabelling to a new key marks chords that no longer fit as borrowed', () => {
    const fmaj = diatonicChord(key('C', 'major'), 3); // F major
    const asMinor = relabel(fmaj, key('A', 'minor'));
    expect(asMinor.numeral).toBe('♭VI');
    expect(asMinor.origin).toBe('diatonic');
    const gmaj = relabel(diatonicChord(key('C', 'major'), 4), key('A', 'minor'));
    expect(gmaj.numeral).toBe('♭VII');
  });
});
