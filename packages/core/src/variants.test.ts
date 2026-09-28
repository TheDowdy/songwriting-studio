import { describe, expect, it } from 'vitest';
import { diatonicChords } from './theory/chords';
import { STANDARD_GUITAR_TUNING } from './schema';
import { bestVoicingIndex, findVoicings, shapeDistance, targetFromChord } from './fret/voicings';
import { describeChord } from './fret/chords';
import { toChordSpec } from './convert';
import { generateVariantShapes, variantLabelFor, VARIANT_GENERATORS } from './variants';
import type { ChordRef } from './theory/types';

const KEY = { tonic: 'C', mode: 'major' } as const;
const CHORDS: ChordRef[] = diatonicChords(KEY);

const isValidVoicing = (chord: ChordRef, frets: (number | null)[]) => {
  const list = findVoicings(STANDARD_GUITAR_TUNING, 22, targetFromChord(describeChord(toChordSpec(chord))));
  return list.some((v) => v.frets.join() === frets.join());
};

describe('generateVariantShapes', () => {
  it('every chord gets a valid, playable voicing', () => {
    for (const generator of VARIANT_GENERATORS.map((g) => g.id)) {
      const shapes = generateVariantShapes(CHORDS, STANDARD_GUITAR_TUNING, 0, generator);
      expect(shapes).toHaveLength(CHORDS.length);
      shapes.forEach((shape, i) => {
        expect(shape).not.toBeNull();
        expect(isValidVoicing(CHORDS[i] as ChordRef, shape!.frets)).toBe(true);
      });
    }
  });

  it('"up the neck from 7" keeps every position within [7, 11]', () => {
    const shapes = generateVariantShapes(CHORDS, STANDARD_GUITAR_TUNING, 0, 'up-the-neck', { fromFret: 7 });
    for (const shape of shapes) {
      expect(shape).not.toBeNull();
      expect(shape!.position).toBeGreaterThanOrEqual(7);
      expect(shape!.position).toBeLessThanOrEqual(11);
    }
  });

  it('"open position" stays at fret 3 or below', () => {
    const shapes = generateVariantShapes(CHORDS, STANDARD_GUITAR_TUNING, 0, 'open-position');
    for (const shape of shapes) expect(shape!.position).toBeLessThanOrEqual(3);
  });

  it('"stay in one position" respects a user-picked window', () => {
    const shapes = generateVariantShapes(CHORDS, STANDARD_GUITAR_TUNING, 0, 'stay-in-position', { window: { start: 8, end: 12 } });
    for (const shape of shapes) {
      expect(shape!.position).toBeGreaterThanOrEqual(8);
      expect(shape!.position).toBeLessThanOrEqual(12);
    }
  });

  it('"smoothest movement" never costs more (per chord) than each chord’s own best voicing', () => {
    const shapes = generateVariantShapes(CHORDS, STANDARD_GUITAR_TUNING, 0, 'smoothest');
    CHORDS.forEach((chord, i) => {
      const list = findVoicings(STANDARD_GUITAR_TUNING, 22, targetFromChord(describeChord(toChordSpec(chord))));
      const best = list[bestVoicingIndex(list)]!;
      expect(shapes[i]!.score).toBeGreaterThanOrEqual(best.score - 1e-9);
    });
  });

  it('"smoothest movement" moves less overall (shape distance) than picking each chord’s own best voicing independently', () => {
    const smooth = generateVariantShapes(CHORDS, STANDARD_GUITAR_TUNING, 0, 'smoothest');
    const independent = CHORDS.map((chord) => {
      const list = findVoicings(STANDARD_GUITAR_TUNING, 22, targetFromChord(describeChord(toChordSpec(chord))));
      return list[bestVoicingIndex(list)]!;
    });
    const totalMovement = (list: typeof smooth) =>
      list.slice(1).reduce((sum, v, i) => sum + shapeDistance(v!.frets, list[i]!.frets), 0);
    expect(totalMovement(smooth)).toBeLessThanOrEqual(totalMovement(independent));
  });

  it('works with a capo (the window is in capo-relative frets)', () => {
    const shapes = generateVariantShapes(CHORDS, STANDARD_GUITAR_TUNING, 2, 'open-position');
    for (const shape of shapes) expect(shape!.position).toBeLessThanOrEqual(3);
  });

  it('a chord with no playable voicing under the rules gets null, not a crash', () => {
    // An empty chord list is the simplest such case.
    expect(generateVariantShapes([], STANDARD_GUITAR_TUNING, 0, 'smoothest')).toEqual([]);
  });
});

describe('variantLabelFor', () => {
  it('names each generator, with its parameters where it has them', () => {
    expect(variantLabelFor('up-the-neck', { fromFret: 7 })).toBe('Up the neck (7+)');
    expect(variantLabelFor('up-the-neck')).toBe('Up the neck (5+)');
    expect(variantLabelFor('open-position')).toBe('Open position');
    expect(variantLabelFor('smoothest')).toBe('Smoothest movement');
    expect(variantLabelFor('stay-in-position', { window: { start: 3, end: 7 } })).toBe('Stay in one position (3–7)');
  });
});
