import { buildChord, diatonicChords, relabel } from './theory/chords';
import { chroma, scaleNotes } from './theory/scales';
import type { ChordRef, Key, Quality } from './theory/types';

/** Which ring of the circle a segment is on. */
export type CircleRing = 'major' | 'minor' | 'dim';

/**
 * How a segment relates to the current key, for shading:
 * - `tonic`: the key's own chord (I, or i in a minor key);
 * - `diatonic`: the other chords of the key;
 * - `borrowed`: chords of the parallel key (same tonic, major to minor or back) that the key lacks;
 * - `other`: everything else, still selectable (unusual, distant or discordant chords).
 */
export type CircleRole = 'tonic' | 'diatonic' | 'borrowed' | 'other';

export interface CircleSegment {
  ring: CircleRing;
  /** 0 = top, then clockwise a fifth at a time (C G D A E B F♯ D♭ A♭ E♭ B♭ F, for the major ring). */
  position: number;
  /** The conventional circle spelling (F♯ or G♭ follows the key's side of the circle). */
  root: string;
  quality: Quality;
  chord: ChordRef;
  role: CircleRole;
}

/** Pitch classes of the major keys, going round the circle of fifths from C. */
const MAJOR_PCS = Array.from({ length: 12 }, (_, i) => (i * 7) % 12);
const RING_QUALITY: Record<CircleRing, Quality> = { major: 'maj', minor: 'min', dim: 'dim' };
/** The minor chord sharing the major key's signature is a minor third below; the chord built on the
 *  leading tone (the diminished one) a semitone below. Each shares the major chord's position. */
const RING_OFFSET: Record<CircleRing, number> = { major: 0, minor: 9, dim: 11 };

/** The conventional spelling of each ring's roots, by position. Position 6 is the one that can go
 *  either way (F♯ or G♭ and its relatives), so it follows the side of the circle the key is on. */
const MAJOR_ROOTS = ['C', 'G', 'D', 'A', 'E', 'B', '', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINOR_ROOTS = ['A', 'E', 'B', 'F#', 'C#', 'G#', '', 'Bb', 'F', 'C', 'G', 'D'];
const DIM_ROOTS = ['B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D', 'A', 'E'];

function circleRoot(ring: CircleRing, position: number, flatSide: boolean): string {
  if (ring === 'dim') return DIM_ROOTS[position]!;
  const roots = ring === 'major' ? MAJOR_ROOTS : MINOR_ROOTS;
  if (position === 6) return ring === 'major' ? (flatSide ? 'Gb' : 'F#') : flatSide ? 'Eb' : 'D#';
  return roots[position]!;
}

const keyOf = (pc: number, quality: Quality) => `${pc}:${quality}`;

function parallelKey(key: Key): Key {
  return { tonic: key.tonic, mode: key.mode === 'major' || key.mode === 'lydian' || key.mode === 'mixolydian' ? 'minor' : 'major' };
}

/**
 * The whole circle of fifths for `key`: 36 chords (a major, a minor and a diminished triad at each
 * of the 12 positions), each with the chord to add and how it relates to the key. Pure, so the
 * ring's shading and what a tap adds come from one place.
 */
export function circleOfFifths(key: Key): CircleSegment[] {
  const scale = scaleNotes(key);
  const flatSide = scale.filter((n) => n.includes('b')).length > scale.filter((n) => n.includes('#')).length;
  const degrees = diatonicChords(key);
  const diatonic = new Set(degrees.map((c) => keyOf(chroma(c.root), c.quality)));
  const tonic = keyOf(chroma(degrees[0]!.root), degrees[0]!.quality);
  const borrowed = new Set(
    diatonicChords(parallelKey(key))
      .map((c) => keyOf(chroma(c.root), c.quality))
      .filter((k) => !diatonic.has(k)),
  );

  const out: CircleSegment[] = [];
  for (const ring of ['major', 'minor', 'dim'] as const) {
    MAJOR_PCS.forEach((majorPc, position) => {
      const pc = (majorPc + RING_OFFSET[ring]) % 12;
      const quality = RING_QUALITY[ring];
      const root = circleRoot(ring, position, flatSide);
      const k = keyOf(pc, quality);
      const role: CircleRole = k === tonic ? 'tonic' : diatonic.has(k) ? 'diatonic' : borrowed.has(k) ? 'borrowed' : 'other';
      out.push({ ring, position, root, quality, chord: relabel(buildChord({ root, quality }, key), key), role });
    });
  }
  return out;
}
