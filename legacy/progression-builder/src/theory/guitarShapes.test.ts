import { describe, expect, it } from 'vitest';
import { buildChord, chordStack } from './chords';
import { chroma } from './scales';
import { curatedGuitarShape, generateGuitarShape, guitarShapeFor, STANDARD_TUNING } from './guitarShapes';
import type { ChordRef, Quality, Seventh } from './types';

const KEY = { tonic: 'C', mode: 'major' } as const;

function pitchClassesOf(shape: { frets: (number | null)[] }): Set<number> {
  const pcs = new Set<number>();
  shape.frets.forEach((f, i) => {
    if (f !== null) pcs.add(((STANDARD_TUNING[i] + f) % 12 + 12) % 12);
  });
  return pcs;
}

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TRIAD_QUALITIES: Quality[] = ['maj', 'min', 'dim', 'aug'];
const SEVENTHS: Seventh[] = ['maj7', 'dom7', 'min7', 'minMaj7', 'm7b5', 'dim7', 'augMaj7', 'aug7'];

describe('curated E-shape/A-shape templates', () => {
  it('every curated shape sounds exactly the chord tones it claims to (catches transcription slips)', () => {
    for (const root of ROOTS) {
      for (const quality of ['maj', 'min'] as const) {
        const chord = buildChord({ root, quality }, KEY);
        const shape = curatedGuitarShape(chord);
        expect(shape, `${root}${quality}`).not.toBeNull();
        const expected = new Set(chordStack(chord).map((n) => chroma(n)));
        expect(pitchClassesOf(shape!), `${root}${quality}`).toEqual(expected);
      }
      for (const seventh of ['dom7', 'maj7', 'min7'] as const) {
        const chord = buildChord({ root, quality: seventh === 'dom7' ? 'maj' : seventh === 'maj7' ? 'maj' : 'min', seventh, flavor: '7' }, KEY);
        const shape = curatedGuitarShape(chord);
        expect(shape, `${root}${seventh}`).not.toBeNull();
        const expected = new Set(chordStack(chord).map((n) => chroma(n)));
        expect(pitchClassesOf(shape!), `${root}${seventh}`).toEqual(expected);
      }
    }
  });

  it('picks whichever of E-shape/A-shape sits closer to the open position', () => {
    // F major: 1 semitone above E (barre fret 1), 6 above A (barre fret 6) -> must pick E-shape.
    const f = buildChord({ root: 'F', quality: 'maj' }, KEY);
    const shape = curatedGuitarShape(f)!;
    const highest = Math.max(...shape.frets.filter((x): x is number => x !== null));
    expect(highest).toBeLessThanOrEqual(3);
  });

  it('does not cover inversions, sus/add9 flavors, or dim/aug triads', () => {
    const inverted = buildChord({ root: 'C', quality: 'maj', bass: 'E' }, KEY);
    expect(curatedGuitarShape(inverted)).toBeNull();
    const sus4 = buildChord({ root: 'C', quality: 'maj', flavor: 'sus4' }, KEY);
    expect(curatedGuitarShape(sus4)).toBeNull();
    const dim = buildChord({ root: 'B', quality: 'dim' }, KEY);
    expect(curatedGuitarShape(dim)).toBeNull();
  });
});

describe('generateGuitarShape', () => {
  function checkValid(chord: ChordRef, shape: ReturnType<typeof generateGuitarShape>) {
    const played = shape.frets.filter((f): f is number => f !== null);
    expect(played.length, `${chord.root}${chord.quality}${chord.flavor} played strings`).toBeGreaterThanOrEqual(2);

    const lowestIdx = shape.frets.findIndex((f) => f !== null);
    const bassPc = chroma(chord.bass ?? chord.root);
    expect(((STANDARD_TUNING[lowestIdx] + (shape.frets[lowestIdx] as number)) % 12 + 12) % 12).toBe(bassPc);

    const fretted = played.filter((f) => f > 0);
    expect(fretted.length, `${chord.root} fretted-finger count`).toBeLessThanOrEqual(4);
    if (fretted.length > 0) {
      expect(Math.max(...fretted) - Math.min(...fretted), `${chord.root} span`).toBeLessThanOrEqual(4);
    }

    const tones = new Set(chordStack(chord).map((n) => chroma(n)));
    const sounded = pitchClassesOf(shape);
    for (const pc of sounded) {
      // Every sounded pitch class must actually belong to the chord (no wrong notes).
      expect(tones.has(pc), `${chord.root}${chord.quality}${chord.flavor} sounded an out-of-chord note`).toBe(true);
    }
  }

  it('produces a valid, playable shape for every root/quality/flavor combo', () => {
    for (const root of ['C', 'F#', 'B']) {
      for (const quality of TRIAD_QUALITIES) {
        const chord = buildChord({ root, quality }, KEY);
        checkValid(chord, generateGuitarShape(chord));
      }
      for (const seventh of SEVENTHS) {
        const quality: Quality = seventh === 'min7' || seventh === 'minMaj7' || seventh === 'm7b5' || seventh === 'dim7' ? 'min' : 'maj';
        const chord = buildChord({ root, quality, seventh, flavor: '7' }, KEY);
        checkValid(chord, generateGuitarShape(chord));
      }
      for (const flavor of ['sus2', 'sus4', 'add9'] as const) {
        const chord = buildChord({ root, quality: 'maj', flavor }, KEY);
        checkValid(chord, generateGuitarShape(chord));
      }
    }
  });

  it('respects an inversion bass note', () => {
    const chord = buildChord({ root: 'C', quality: 'maj', bass: 'E' }, KEY);
    checkValid(chord, generateGuitarShape(chord));
  });

  it('is labelled generated', () => {
    const chord = buildChord({ root: 'C', quality: 'maj', flavor: 'sus4' }, KEY);
    expect(generateGuitarShape(chord).generated).toBe(true);
  });
});

describe('guitarShapeFor', () => {
  it('prefers the curated shape when one covers the chord', () => {
    const chord = buildChord({ root: 'E', quality: 'maj' }, KEY);
    expect(guitarShapeFor(chord).generated).toBe(false);
  });

  it('falls back to the generator otherwise', () => {
    const chord = buildChord({ root: 'C', quality: 'maj', flavor: 'add9' }, KEY);
    expect(guitarShapeFor(chord).generated).toBe(true);
  });
});
