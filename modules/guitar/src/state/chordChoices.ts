/**
 * The chords offered when replacing a progression chord or adding one after it, inside the guitar
 * module (Phase 6 item 1): the progression module's own ranked suggestions (`suggestNext` from the
 * chord before, with everything before that as context), then the key's diatonic chords not
 * already suggested. Pure — no store, no React — so it's unit-tested without a DOM.
 */
import { chordKey, diatonicChords, flattenSong, keyOfEvent, startChords, suggestNext, type ChordRef, type Song, type Suggestion } from '@sw/core';

export interface ChordChoices {
  /** Ranked by how well each follows the chord before (empty when there is no chord before). */
  suggested: Suggestion[];
  /** The key's diatonic triads not already in `suggested`. */
  diatonic: ChordRef[];
}

/** How many ranked suggestions to show before the diatonic list. */
const MAX_SUGGESTED = 8;

/**
 * `mode` 'add': chords to put after `eventId` (or, with no `eventId`, to start an empty song).
 * `mode` 'replace': chords to put in place of `eventId`, judged against the chord before it.
 */
export function chordChoices(song: Song, eventId: string | null, mode: 'add' | 'replace'): ChordChoices {
  const flat = flattenSong(song);
  const at = eventId ? flat.findIndex((e) => e.id === eventId) : -1;
  // The chord the choices should follow, and the chords before that one.
  const followIndex = mode === 'add' ? at : at - 1;
  const follow = followIndex >= 0 ? flat[followIndex]?.chord : undefined;
  const previous = followIndex > 0 ? flat.slice(0, followIndex).map((e) => e.chord) : [];

  // Judged in the key of the section the chord will go into (a modulated section has its own).
  const key = keyOfEvent(song, eventId);
  const suggested = follow ? suggestNext(follow, key, previous).slice(0, MAX_SUGGESTED) : [];
  const taken = new Set(suggested.map((s) => chordKey(s.chord)));
  const pool = follow ? diatonicChords(key) : startChords(key);
  const diatonic = pool.filter((c) => !taken.has(chordKey(c)));
  return { suggested, diatonic };
}
