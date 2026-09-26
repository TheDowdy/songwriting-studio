import { chordStack, inversionOf } from './chords';
import { chroma } from './scales';
import type { ChordRef } from './types';

/** Lowest MIDI note of the upper voicing (C3), and of the bass register (C2). */
const UPPER_FLOOR = 48;
const BASS_FLOOR = 36;

/** Lowest MIDI note ≥ `floor` with the given pitch class. */
function atOrAbove(floor: number, pitchClass: number): number {
  return floor + ((pitchClass - floor) % 12 + 12) % 12;
}

/** The chord's stack, starting from its inversion's bass tone (root position if not inverted). */
function orderedStack(chord: ChordRef): string[] {
  const stack = chordStack(chord);
  const inv = inversionOf(chord);
  return [...stack.slice(inv), ...stack.slice(0, inv)];
}

/**
 * A simple piano voicing as MIDI numbers, lowest first: a bass note in the C2 octave, then the
 * chord in close position from C3 upward. The bass note of an inversion is respected (chord
 * tone `bass` is the lowest upper note and the bass register plays it too).
 */
export function pianoVoicing(chord: ChordRef): number[] {
  const ordered = orderedStack(chord);
  const upper: number[] = [];
  let floor = UPPER_FLOOR;
  for (const note of ordered) {
    const midi = atOrAbove(floor, chroma(note));
    upper.push(midi);
    floor = midi + 1;
  }
  const bass = atOrAbove(BASS_FLOOR, chroma(ordered[0]));
  return [bass, ...upper];
}

/** The register the upper voices are drawn back toward, and the ceiling they may not pass. */
const REGISTER_CENTRE = 60;
const UPPER_CEILING = 76;
const LOWEST_BASS_TONE = 41;

/**
 * Voice `chord` to move as little as possible from the chord before it (section 8.4). `prev` is
 * the previous call's return value, or null for the first chord in a song (falls back to
 * `pianoVoicing`'s close position). Every octave placement of the chord's tones is considered
 * (the chosen inversion's bass tone always the lowest upper note, doubled below in the bass
 * register); the one whose notes sit closest to the previous chord's wins, with a gentle pull
 * toward the middle of the keyboard so a long progression can't wander up or down the register.
 */
export function voiceLeadChord(chord: ChordRef, prev: number[] | null): number[] {
  const ordered = orderedStack(chord);
  const pitchClasses = ordered.map((n) => chroma(n));

  if (!prev || prev.length < 2) return pianoVoicing(chord);

  const prevUpper = prev.slice(1);
  const bass = atOrAbove(BASS_FLOOR, pitchClasses[0]);
  const lowestBass = atOrAbove(UPPER_FLOOR, pitchClasses[0]);

  let best: number[] | null = null;
  let bestCost = Infinity;
  // The bass tone may sit an octave below the usual floor (down to G2) when that keeps common tones still.
  for (const bassTone of [lowestBass - 12, lowestBass, lowestBass + 12].filter((n) => n >= LOWEST_BASS_TONE)) {
    // Every octave choice for the other tones within two octaves above the bass tone.
    let partials: number[][] = [[bassTone]];
    for (const pc of pitchClasses.slice(1)) {
      const low = atOrAbove(bassTone + 1, pc);
      partials = partials.flatMap((p) => [[...p, low], [...p, low + 12]]);
    }
    for (const cand of partials) {
      const upper = [cand[0], ...cand.slice(1).sort((a, b) => a - b)];
      const top = upper[upper.length - 1];
      const movement = upper.reduce((sum, n) => sum + Math.min(...prevUpper.map((p) => Math.abs(n - p))), 0);
      const centre = upper.reduce((sum, n) => sum + n, 0) / upper.length;
      const cost = movement + 0.25 * Math.abs(centre - REGISTER_CENTRE) + (top > UPPER_CEILING ? 100 : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = upper;
      }
    }
  }
  return [bass, ...(best as number[])];
}
