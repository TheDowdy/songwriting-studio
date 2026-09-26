import { describe, expect, it } from 'vitest';
import { midiToName } from '../src/theory/notes';
import {
  planScale,
  positionStarts,
  WINDOW_FRETS,
  type PlanOptions,
} from '../src/theory/scalePlayback';
import { getScale } from '../src/theory/scales';
import { STANDARD_TUNING } from '../src/theory/tunings';

const standard = STANDARD_TUNING.strings;
const plan = (scaleId: string, rootPc: number, over: Partial<PlanOptions> = {}) =>
  planScale({
    tuning: standard,
    fretCount: 22,
    rootPc,
    intervals: getScale(scaleId).intervals,
    range: 'octave',
    direction: 'up',
    position: 'auto',
    ...over,
  });
const names = (notes: { midi: number }[]) => notes.map((n) => midiToName(n.midi, 'sharp'));
const positions = (notes: { string: number; fret: number }[]) =>
  notes.map((n) => [n.string, n.fret]);

describe('planScale', () => {
  it('plays one octave of E minor pentatonic in first position, lowest string first', () => {
    const notes = plan('minor-pentatonic', 4);
    expect(names(notes)).toEqual(['E2', 'G2', 'A2', 'B2', 'D3', 'E3']);
    expect(positions(notes)).toEqual([
      [0, 0],
      [0, 3],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2],
    ]);
  });

  it('marks the tonic notes', () => {
    const notes = plan('minor-pentatonic', 4);
    expect(notes.map((n) => n.tonic)).toEqual([true, false, false, false, false, true]);
  });

  it('every fingered note actually produces its pitch', () => {
    for (const range of ['octave', 'two-octaves', 'neck'] as const) {
      for (const n of plan('major', 0, { range })) {
        expect((standard[n.string] as number) + n.fret).toBe(n.midi);
        expect(n.fret).toBeGreaterThanOrEqual(0);
        expect(n.fret).toBeLessThanOrEqual(22);
      }
    }
  });

  it('spans one or two octaves, tonic to tonic', () => {
    const one = plan('major', 0, { range: 'octave' });
    const two = plan('major', 0, { range: 'two-octaves' });
    expect(one).toHaveLength(8);
    expect(two).toHaveLength(15);
    expect((two.at(-1)?.midi as number) - (two[0]?.midi as number)).toBe(24);
  });

  it('plays the whole neck from the lowest to the highest available scale note', () => {
    const notes = plan('minor-pentatonic', 4, { range: 'neck' });
    const midis = notes.map((n) => n.midi);
    expect(midis[0]).toBe(40); // open low E
    expect(midis.at(-1)).toBe(86); // D6, fret 22 on the top string
    expect(midis).toEqual([...midis].sort((a, b) => a - b));
    // Every E minor pentatonic pitch on the neck is played exactly once.
    const expected: number[] = [];
    for (let m = 40; m <= 86; m++) if ([4, 7, 9, 11, 2].includes(m % 12)) expected.push(m);
    expect(midis).toEqual(expected);
  });

  it('reverses for down, and up-and-down does not repeat the top note', () => {
    const up = plan('minor-pentatonic', 4);
    const down = plan('minor-pentatonic', 4, { direction: 'down' });
    const both = plan('minor-pentatonic', 4, { direction: 'updown' });
    expect(down).toEqual([...up].reverse());
    expect(both).toHaveLength(up.length * 2 - 1);
    expect(both.slice(0, up.length)).toEqual(up);
    expect(both.slice(up.length - 1)).toEqual([...up].reverse());
  });

  it('keeps notes inside an explicit position window', () => {
    // Position "frets 5–9": E3 on the A string at fret 7 is the lowest tonic in the window.
    const notes = plan('minor-pentatonic', 4, { position: 5 });
    expect(names(notes)[0]).toBe('E3');
    for (const n of notes) expect(n.fret).toBeGreaterThanOrEqual(5);
    for (const n of notes) expect(n.fret).toBeLessThanOrEqual(5 + WINDOW_FRETS - 1);
  });

  it('auto picks a window where a one-octave scale needs no stretching', () => {
    for (const rootPc of [0, 2, 4, 7, 9]) {
      const notes = plan('major', rootPc);
      const frets = notes.filter((n) => n.fret > 0).map((n) => n.fret);
      expect(Math.max(...frets) - Math.min(...frets)).toBeLessThan(WINDOW_FRETS);
    }
  });

  it('works in other tunings', () => {
    const dropD = plan('major', 2, { tuning: [38, 45, 50, 55, 59, 64] });
    expect(names(dropD)[0]).toBe('D2');
    expect(dropD[0]).toMatchObject({ string: 0, fret: 0 });
  });

  it('positions cover the neck without running off the end', () => {
    const starts = positionStarts(22);
    expect(starts[0]).toBe(0);
    expect((starts.at(-1) as number) + WINDOW_FRETS - 1).toBeLessThanOrEqual(23);
    // The window must stay on the neck.
    for (const p of starts) expect(() => plan('major', 0, { position: p })).not.toThrow();
  });

  it('a note that cannot be played on the neck is skipped, not invented', () => {
    const notes = plan('major', 0, { fretCount: 18, range: 'two-octaves', position: 15 });
    for (const n of notes) expect(n.fret).toBeLessThanOrEqual(18);
  });
});
