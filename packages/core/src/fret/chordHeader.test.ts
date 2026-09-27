import { describe, expect, it } from 'vitest';
import {
  chordHeaderFromDiatonic,
  chordHeaderFromIdentified,
  chordHeaderFromInfo,
} from './chordHeader';
import { DEFAULT_CHORD, describeChord, type ChordSpec } from './chords';
import { identifyChord, spellSounding } from './identify';
import { formatNoteName, type NoteName } from './notes';
import { diatonicChords, type DiatonicChord } from './overlays';
import { bestRootSpelling, getScale, scaleSpelling } from './scales';

const spec = (over: Partial<ChordSpec> = {}): ChordSpec => ({ ...DEFAULT_CHORD, ...over });
const names = (tones: { note: NoteName }[]) => tones.map((t) => formatNoteName(t.note)).join(' ');

describe('chordHeaderFromInfo', () => {
  it('B♭ major: name, no label by default, and R/3/5 over B♭ D F', () => {
    const info = describeChord(spec({ rootPc: 10 }), 'flat');
    const header = chordHeaderFromInfo(info);
    expect(header.name).toBe('B♭');
    expect(header.label).toBeNull();
    expect(names(header.tones)).toBe('B♭ D F');
    expect(header.tones.map((t) => t.interval)).toEqual(['R', '3', '5']);
  });

  it('carries whatever label it is given (e.g. a progression numeral)', () => {
    const info = describeChord(spec({ rootPc: 7, seventh: '7' }), 'sharp');
    const header = chordHeaderFromInfo(info, 'from the progression: V7');
    expect(header.label).toBe('from the progression: V7');
  });

  it('the voicing target matches the chord: root, required tones, thirds flagged', () => {
    const info = describeChord(spec({ rootPc: 0, seventh: '7' }), 'sharp'); // C7: C E G Bb
    const header = chordHeaderFromInfo(info);
    expect(header.target.rootPc).toBe(0);
    expect(header.target.tones.map((t) => t.pc).sort((a, b) => a - b)).toEqual([0, 4, 7, 10]);
    expect(header.target.tones.every((t) => t.required)).toBe(true);
    expect(header.target.tones.find((t) => t.pc === 4)?.third).toBe(true);
    expect(header.target.tones.find((t) => t.pc === 7)?.third).toBe(false);
  });
});

describe('chordHeaderFromDiatonic', () => {
  const def = getScale('major');
  const root = bestRootSpelling(0, def, 'sharp'); // C major
  const spelling = scaleSpelling(root, def, 'sharp');
  const chordAt = (kind: 'triad' | 'seventh', degree: number): DiatonicChord =>
    diatonicChords(root, def, kind, 'sharp')![degree]!;

  it('V triad of C major: name G, numeral label, notes G B D with R 3 5', () => {
    const header = chordHeaderFromDiatonic(chordAt('triad', 4), spelling);
    expect(header.name).toBe('G');
    expect(header.label).toBe('V');
    expect(names(header.tones)).toBe('G B D');
    expect(header.tones.map((t) => t.interval)).toEqual(['R', '3', '5']);
  });

  it('vii° triad of C major carries the degree symbol in its numeral label', () => {
    const header = chordHeaderFromDiatonic(chordAt('triad', 6), spelling);
    expect(header.name).toBe('Bdim');
    expect(header.label).toBe('vii°');
    expect(names(header.tones)).toBe('B D F');
  });

  it('V7 (G7) of C major: four tones with R 3 5 ♭7', () => {
    const header = chordHeaderFromDiatonic(chordAt('seventh', 4), spelling);
    expect(header.name).toBe('G7');
    expect(header.label).toBe('V7');
    expect(names(header.tones)).toBe('G B D F');
    expect(header.tones.map((t) => t.interval)).toEqual(['R', '3', '5', '♭7']);
  });

  it('the voicing target is rooted on the chord, not the scale', () => {
    const header = chordHeaderFromDiatonic(chordAt('triad', 4), spelling); // G B D
    expect(header.target.rootPc).toBe(7);
    expect(header.target.tones.map((t) => t.pc).sort((a, b) => a - b)).toEqual([2, 7, 11]);
  });
});

describe('chordHeaderFromIdentified', () => {
  const read = (midis: number[]) => {
    const readings = identifyChord(midis, 'sharp');
    const notes = spellSounding(midis, readings[0], 'sharp');
    return { best: readings[0], notes };
  };

  it('a picked C major shape (x-3-2-0-1-0): name C, notes/intervals from what actually sounds', () => {
    const { best, notes } = read([48, 52, 55, 60, 64]); // C E G C E (low→high)
    const header = chordHeaderFromIdentified(best, notes);
    expect(header?.name).toBe('C');
    expect(names(header!.tones)).toBe('C E G C E');
    expect(header!.tones.map((t) => t.interval)).toEqual(['R', '3', '5', 'R', '3']);
  });

  it('null when nothing is picked', () => {
    expect(chordHeaderFromIdentified(undefined, [])).toBeNull();
  });

  it('null for a reading with no chord spec (a bare interval)', () => {
    const { best, notes } = read([60, 62]); // major 2nd: not a chord
    expect(best?.spec).toBeNull();
    expect(chordHeaderFromIdentified(best, notes)).toBeNull();
  });

  it('a power chord still counts as identified', () => {
    const { best, notes } = read([43, 50]); // G power chord (root + 5th)
    const header = chordHeaderFromIdentified(best, notes);
    expect(header?.name).toBe('G5');
    expect(names(header!.tones)).toBe('G D');
  });
});
