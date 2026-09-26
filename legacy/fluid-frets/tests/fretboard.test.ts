import { describe, expect, it } from 'vitest';
import { chromaticSpelling, parseNoteName } from '../src/theory/notes';
import { buildFretboard, fretToMidi } from '../src/theory/fretboard';
import { getScale, scaleSpelling } from '../src/theory/scales';
import { getPreset } from '../src/theory/tunings';

const tuning = (id: string) => (getPreset(id) as { strings: number[] }).strings;

describe('buildFretboard', () => {
  it('has strings × (fretCount + 1) cells', () => {
    const board = buildFretboard(tuning('standard'), 24);
    expect(board).toHaveLength(6);
    for (const row of board) expect(row).toHaveLength(25);
  });

  it('standard tuning, string 6 frets 0–3 = E F F♯ G', () => {
    const row = buildFretboard(tuning('standard'), 22)[0]!;
    expect(row.slice(0, 4).map((c) => c.label)).toEqual(['E', 'F', 'F♯', 'G']);
  });

  it('Drop D, string 6: fret 0 = D, fret 2 = E', () => {
    const row = buildFretboard(tuning('drop-d'), 22)[0]!;
    expect(row[0]!.label).toBe('D');
    expect(row[2]!.label).toBe('E');
  });

  it('carries midi, pitch class, and octave-qualified names', () => {
    const board = buildFretboard(tuning('standard'), 22);
    expect(board[0]![0]).toMatchObject({ string: 0, fret: 0, midi: 40, pc: 4, fullName: 'E2' });
    expect(board[5]![12]).toMatchObject({ string: 5, fret: 12, midi: 76, pc: 4, fullName: 'E5' });
    expect(fretToMidi(45, 5)).toBe(50);
  });

  it('every cell is one semitone above its left neighbour', () => {
    for (const row of buildFretboard(tuning('dadgad'), 24)) {
      for (let f = 1; f < row.length; f++) expect(row[f]!.midi - row[f - 1]!.midi).toBe(1);
    }
  });

  it('follows the accidental preference in chromatic mode', () => {
    const flat = buildFretboard(tuning('standard'), 3, { spelling: chromaticSpelling('flat') });
    expect(flat[0]!.slice(0, 4).map((c) => c.label)).toEqual(['E', 'F', 'G♭', 'G']);
  });

  it('has no role or degree when no scale is active', () => {
    const cell = buildFretboard(tuning('standard'), 5)[0]![0]!;
    expect(cell.role).toBeUndefined();
    expect(cell.degree).toBeUndefined();
  });

  it('spells F major with B♭ on the neck and marks roles', () => {
    const root = parseNoteName('F');
    const def = getScale('major');
    const board = buildFretboard(tuning('standard'), 22, {
      spelling: scaleSpelling(root, def),
      scale: { root, def },
    });
    // String 3 (index 2) is D; fret 8 → B♭; string 5 (index 4) is B; fret 0 → B natural (out of scale).
    expect(board[2]![8]).toMatchObject({ label: 'B♭', fullName: 'B♭3', role: 'scale' });
    expect(board[4]![0]).toMatchObject({ label: 'B', role: 'out' });
    expect(board[0]![1]).toMatchObject({ label: 'F', role: 'tonic' });
    expect(board[0]![1]!.degree?.label).toBe('1');
    expect(board[2]![8]!.degree?.label).toBe('4');
  });

  it('G♯ harmonic minor contains F𝄪 on the neck', () => {
    const root = parseNoteName('G♯');
    const def = getScale('harmonic-minor');
    const board = buildFretboard(tuning('standard'), 22, {
      spelling: scaleSpelling(root, def),
      scale: { root, def },
    });
    const labels = new Set(board.flat().map((c) => c.label));
    expect(labels.has('F𝄪')).toBe(true);
    expect(labels.has('G')).toBe(false); // F𝄪 replaces G
  });

  it('E minor pentatonic in standard tuning: the frets 0–3 box', () => {
    const root = parseNoteName('E');
    const def = getScale('minor-pentatonic');
    const board = buildFretboard(tuning('standard'), 22, { scale: { root, def } });
    const inBox = board.map((row) =>
      row
        .slice(0, 4)
        .map((c) => (c.role === 'out' ? null : c.fret))
        .filter((f) => f !== null),
    );
    expect(inBox).toEqual([
      [0, 3],
      [0, 2],
      [0, 2],
      [0, 2],
      [0, 3],
      [0, 3],
    ]);
  });
});
