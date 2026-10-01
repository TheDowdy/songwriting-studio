import { chordStack, defaultSeventh, inversionOf, relabel } from './theory/chords';
import type { ChordRef, Key, Quality, Seventh } from './theory/types';

/** The 7th that goes with the other triad quality, so a chord keeps its "seventh-ness". */
const FLIPPED_SEVENTH: Partial<Record<Seventh, Seventh>> = {
  dom7: 'min7',
  min7: 'dom7',
  maj7: 'minMaj7',
  minMaj7: 'maj7',
};

/** Only a major or minor chord with a third can swap (not diminished, augmented or a power chord). */
export function canToggleMajorMinor(chord: ChordRef): boolean {
  return (chord.quality === 'maj' || chord.quality === 'min') && !chord.colour?.omit3;
}

/**
 * The same chord with the opposite triad quality, major to minor or minor to major, in the same key:
 * same root, same flavour (7th, sus, add9), colour and inversion. The numeral and origin are
 * recomputed, so IV becomes iv (borrowed from the parallel minor), vi becomes VI (borrowed), and a
 * secondary dominant that stops being major is no longer one. A chord that cannot swap is returned
 * unchanged.
 */
export function toggleMajorMinor(chord: ChordRef, key: Key): ChordRef {
  if (!canToggleMajorMinor(chord)) return chord;
  const quality: Quality = chord.quality === 'maj' ? 'min' : 'maj';
  const inversion = inversionOf(chord);
  const seventh = chord.flavor === '7' ? (FLIPPED_SEVENTH[chord.seventh] ?? defaultSeventh(quality)) : defaultSeventh(quality);
  const next: ChordRef = { ...chord, quality, seventh, bass: undefined, origin: 'diatonic' };
  if (inversion > 0) next.bass = chordStack(next)[inversion];
  return relabel(next, key);
}
