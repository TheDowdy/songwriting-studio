/**
 * `@sw/core` public surface (§2, §7 Phase 1): PB's theory engine, the song model, schema/
 * migration, pure song operations, and the PB↔FF chord converters. FF's own theory engine lives
 * under the `./fret/*` subpath (e.g. `@sw/core/fret/chords`) — it is not re-exported here, so it
 * never collides with PB's names for the same musical ideas (both have a `ChordSpec`, etc.).
 *
 * `chordName` and `withFlavor` below are the colour-aware versions from `convert.ts`: they behave
 * exactly like the originals in `theory/chords.ts` for any chord without colour, and are what
 * every consumer outside `theory/` should use.
 */
export * from './theory/types';
export {
  FLAVORS,
  defaultSeventh,
  chordStack,
  chordTones,
  inversionCount,
  inversionOf,
  chordNotes,
  chordKey,
  sameChord,
  buildChord,
  diatonicChord,
  diatonicChords,
  secondaryNumeral,
  relabel,
  withInversion,
  transposeChord,
} from './theory/chords';
export type { ChordSpec as PbChordSpec } from './theory/chords';
export * from './theory/numerals';
export * from './theory/rules';
export * from './theory/scales';
export * from './theory/suggestions';
export * from './theory/voicings';
export * from './theory/guitarShapes';

export * from './song';
export * from './schema';
export * from './operations';
export * from './convert';
export * from './eventVoicing';
export * from './variants';
export * from './spaceKey';
export * from './insertion';
export * from './keys';
export * from './chordQuality';
export * from './circle';
