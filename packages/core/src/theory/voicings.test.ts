import { describe, expect, it } from 'vitest';
import { diatonicChord, diatonicChords, withFlavor, withInversion } from './chords';
import { pianoVoicing, voiceLeadChord } from './voicings';

const c = { tonic: 'C', mode: 'major' } as const;

describe('pianoVoicing', () => {
  it('C major: bass C2 then C3 E3 G3', () => {
    expect(pianoVoicing(diatonicChord(c, 0))).toEqual([36, 48, 52, 55]);
  });
  it('respects inversions: C/E has E in the bass', () => {
    const v = pianoVoicing(withInversion(diatonicChord(c, 0), 1, c));
    expect(v).toEqual([40, 52, 55, 60]);
  });
  it('is ascending and stays in a sensible range for every chord in every key', () => {
    for (const tonic of ['C', 'Db', 'F#', 'B', 'Eb'])
      for (const chord of diatonicChords({ tonic, mode: 'major' }, '7')) {
        const v = pianoVoicing(chord);
        expect([...v].sort((a, b) => a - b)).toEqual(v);
        expect(v[0]).toBeGreaterThanOrEqual(36);
        expect(v[v.length - 1]).toBeLessThanOrEqual(72);
      }
  });
});

describe('voiceLeadChord', () => {
  it('with no previous chord, matches pianoVoicing', () => {
    const I = diatonicChord(c, 0);
    expect(voiceLeadChord(I, null)).toEqual(pianoVoicing(I));
  });
  it('holds a common tone in place: C → Am shares C and E', () => {
    const [I, , iii, , , vi] = diatonicChords(c);
    void iii;
    const cVoicing = voiceLeadChord(I, null);
    const amVoicing = voiceLeadChord(vi as never, cVoicing);
    // C major = C E G, A minor = A C E: C and E should be the very same notes, not just same pitch class.
    expect(amVoicing.filter((n) => cVoicing.includes(n)).length).toBeGreaterThanOrEqual(2);
  });
  it('moves less overall than always resetting to close position', () => {
    // A 2nd-inversion I forces a big register jump if you reset to close position each time.
    const I = diatonicChord(c, 0);
    const chords = [I, withInversion(I, 2, c), diatonicChord(c, 3), I]; // I, I⁶₄, IV, I
    let prev: number[] | null = null;
    let ledMovement = 0;
    for (const chord of chords) {
      const v = voiceLeadChord(chord, prev);
      if (prev) for (let i = 0; i < v.length; i++) ledMovement += Math.abs(v[i] - prev[i]);
      prev = v;
    }
    let resetMovement = 0;
    let prevReset: number[] | null = null;
    for (const chord of chords) {
      const v = pianoVoicing(chord);
      if (prevReset) for (let i = 0; i < v.length; i++) resetMovement += Math.abs(v[i] - prevReset[i]);
      prevReset = v;
    }
    expect(ledMovement).toBeLessThan(resetMovement);
  });
  it('does not drift up or down the keyboard over long progressions', () => {
    for (const seq of [[0, 3, 5, 4], [0, 4, 5, 3], [0, 1, 2, 3, 4, 5, 6], [0, 5, 3, 4, 2, 1]]) {
      let prev: number[] | null = null;
      for (let round = 0; round < 12; round++) {
        for (const degree of seq) {
          prev = voiceLeadChord(diatonicChord(c, degree), prev);
          const upper = prev.slice(1);
          expect(Math.min(...upper)).toBeGreaterThanOrEqual(41);
          expect(Math.max(...upper)).toBeLessThanOrEqual(76);
        }
      }
    }
  });
  it('a chord revisited later sounds in the same register as before', () => {
    let prev: number[] | null = null;
    const registers: number[] = [];
    for (let round = 0; round < 6; round++) {
      for (const degree of [0, 3, 5, 4]) {
        prev = voiceLeadChord(diatonicChord(c, degree), prev);
        if (degree === 0) registers.push(prev.slice(1).reduce((a, b) => a + b, 0) / (prev.length - 1));
      }
    }
    expect(Math.max(...registers) - Math.min(...registers)).toBeLessThanOrEqual(12);
  });
  it('keeps the chosen inversion in the bass', () => {
    const I = diatonicChord(c, 0);
    const first = withInversion(I, 1, c); // C/E
    const v = voiceLeadChord(first, voiceLeadChord(I, null));
    expect(v[0] % 12).toBe(4); // E
    expect(v[1] % 12).toBe(4); // the lowest upper note is also E
  });
  it('stays ascending even when a flavor change adds a note (e.g. add9)', () => {
    const I = diatonicChord(c, 0);
    const add9 = withFlavor(I, 'add9', c);
    const v = voiceLeadChord(add9, voiceLeadChord(I, null));
    expect(v.length).toBe(5); // bass + 4 upper notes (triad + the 9th)
    expect([...v].sort((a, b) => a - b)).toEqual(v);
  });
});

describe('colour (Phase 5 item 4: rich chords from the guitar module play as named)', () => {
  const pcs = (v: number[]) => [...new Set(v.map((n) => n % 12))].sort((a, b) => a - b);

  it('a C9 sounds its 9th (D) as well as C E G B♭', () => {
    const c9 = { ...diatonicChord(c, 0), flavor: '7' as const, seventh: 'dom7' as const, colour: { extension: '9' as const } };
    expect(pcs(pianoVoicing(c9))).toEqual([0, 2, 4, 7, 10]);
    expect(pcs(voiceLeadChord(c9, pianoVoicing(diatonicChord(c, 0))))).toEqual([0, 2, 4, 7, 10]);
  });

  it('an altered 5th replaces the natural one (C7♯5: G♯, no G)', () => {
    const c7s5 = { ...diatonicChord(c, 0), flavor: '7' as const, seventh: 'dom7' as const, colour: { alterations: ['#5' as const] } };
    expect(pcs(pianoVoicing(c7s5))).toEqual([0, 4, 8, 10]);
  });

  it('a slash bass that is not a chord tone still sits in the bass (C/D)', () => {
    const cOverD = { ...diatonicChord(c, 0), bass: 'D' };
    const v = pianoVoicing(cOverD);
    expect(v[0] % 12).toBe(2);
    expect(v[1] % 12).toBe(2);
  });
});
