/**
 * The bass/inversion control shown for a song's progression chord (Phase 4 item 3): "Root | 1st |
 * 2nd | 3rd (seventh chords only) | Any bass". It narrows the voicing search to a specific bass
 * pitch class, or leaves it open for "Any bass" — see `chordActions.chordContext`. Pure — no
 * store, no React — so it's unit-tested without a DOM.
 */
import { chordStack, chroma, inversionCount, inversionOf, type ChordRef } from '@sw/core';

export type BassMode = 'root' | 1 | 2 | 3 | 'any';

/** The control's starting position for a freshly focused chord: whatever inversion it's already
 *  in (root position for a plain chord, or a slash chord's own bass). */
export function defaultBassMode(chord: ChordRef): BassMode {
  const n = inversionOf(chord);
  return n === 0 ? 'root' : (n as 1 | 2 | 3);
}

/** The numbered inversions this chord has to offer, beyond Root and Any bass: 1st/2nd for a
 *  triad-family chord (a plain triad, sus2/sus4 or add9 — add9's own added tone is never a bass
 *  note, matching `chordStack`), plus 3rd for a seventh chord. */
export function inversionOptions(chord: Pick<ChordRef, 'flavor'>): (1 | 2 | 3)[] {
  return inversionCount(chord) === 4 ? [1, 2, 3] : [1, 2];
}

/** The pitch class the voicing search should require in the bass for `mode`, or null for "Any
 *  bass" (no restriction at all — whichever voicing is then picked commits its own bass; see
 *  `inversionForBassPc`). */
export function bassPcForMode(chord: ChordRef, mode: BassMode): number | null {
  if (mode === 'any') return null;
  if (mode === 'root') return chroma(chord.root);
  const note = chordStack(chord)[mode];
  return note ? chroma(note) : chroma(chord.root);
}

/**
 * The inversion a sounding bass pitch class corresponds to for `chord` (0 = root position), or
 * null when it isn't one of the chord's own stack tones within its actual inversion count (an
 * extension used as a bass note under "Any bass" — rare, and not a clean inversion of the
 * underlying triad/seventh, so the chord's own `bass` is left alone rather than guessing).
 */
export function inversionForBassPc(chord: ChordRef, pc: number): number | null {
  const stack = chordStack(chord).slice(0, inversionCount(chord));
  const index = stack.findIndex((note) => chroma(note) === pc);
  return index < 0 ? null : index;
}
