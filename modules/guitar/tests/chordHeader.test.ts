import { describe, expect, it } from 'vitest';
import { chordTabHeaderChord, scaleTabHeaderChord } from '../src/state/chordHeader';
import { DEFAULT_CHORD, type ChordSpec } from '@sw/core/fret/chords';
import { NO_OVERLAY, type Overlay } from '@sw/core/fret/overlays';
import { formatNoteName, parseNoteName, type NoteName } from '@sw/core/fret/notes';
import { bestRootSpelling, getScale, scaleSpelling } from '@sw/core/fret/scales';
import type { ChordRef } from '@sw/core';

const spec = (over: Partial<ChordSpec> = {}): ChordSpec => ({ ...DEFAULT_CHORD, ...over });
const notesOf = (h: { tones: { note: NoteName }[] }) =>
  h.tones.map((t) => formatNoteName(t.note)).join(' ');

describe('chordTabHeaderChord', () => {
  it('tool mode: the builder’s chord, no secondary label', () => {
    const header = chordTabHeaderChord(spec({ rootPc: 10 }), 'flat', null);
    expect(header.name).toBe('B♭');
    expect(header.label).toBeNull();
    expect(notesOf(header)).toBe('B♭ D F');
  });

  it('song context: the progression chord’s numeral as a "from the progression" label', () => {
    const progressionChord = { numeral: 'V7' } as ChordRef;
    const header = chordTabHeaderChord(spec({ rootPc: 7, seventh: '7' }), 'sharp', progressionChord);
    expect(header.name).toBe('G7');
    expect(header.label).toBe('from the progression: V7');
  });
});

describe('scaleTabHeaderChord', () => {
  const def = getScale('major');
  const root = bestRootSpelling(0, def, 'sharp'); // C major
  const spelling = scaleSpelling(root, def, 'sharp');
  const chordSpec = spec({ rootPc: 10 }); // Bb major, for the "chord from Chords tab" overlay

  it('no overlay: hidden', () => {
    expect(scaleTabHeaderChord(NO_OVERLAY, root, def, spelling, 'sharp', chordSpec)).toBeNull();
  });

  it('a scale-on-scale overlay is not a chord: hidden', () => {
    const overlay: Overlay = { kind: 'scale', scaleId: 'blues' };
    expect(scaleTabHeaderChord(overlay, root, def, spelling, 'sharp', chordSpec)).toBeNull();
  });

  it('a triad on scale degree V: G, labelled "V", notes G B D', () => {
    const overlay: Overlay = { kind: 'triad', degree: 4 };
    const header = scaleTabHeaderChord(overlay, root, def, spelling, 'sharp', chordSpec);
    expect(header?.name).toBe('G');
    expect(header?.label).toBe('V');
    expect(notesOf(header!)).toBe('G B D');
  });

  it('a seventh chord on scale degree V: G7, labelled "V7", notes G B D F', () => {
    const overlay: Overlay = { kind: 'seventh', degree: 4 };
    const header = scaleTabHeaderChord(overlay, root, def, spelling, 'sharp', chordSpec);
    expect(header?.name).toBe('G7');
    expect(header?.label).toBe('V7');
    expect(notesOf(header!)).toBe('G B D F');
  });

  it('"Chord from the Chords tab": the chord builder’s chord, spelled with the accidentals pref, no numeral', () => {
    const overlay: Overlay = { kind: 'chord' };
    const header = scaleTabHeaderChord(overlay, root, def, spelling, 'flat', chordSpec);
    expect(header?.name).toBe('B♭');
    expect(header?.label).toBeNull();
    expect(notesOf(header!)).toBe('B♭ D F');
  });

  it('an invalid degree overlay (scale changed under it) is hidden, not thrown', () => {
    const overlay: Overlay = { kind: 'triad', degree: 4 };
    const pentatonic = getScale('minor-pentatonic'); // no diatonic chords: 5-note scale
    const pentaRoot = parseNoteName('E');
    expect(
      scaleTabHeaderChord(overlay, pentaRoot, pentatonic, scaleSpelling(pentaRoot, pentatonic), 'sharp', chordSpec),
    ).toBeNull();
  });
});
