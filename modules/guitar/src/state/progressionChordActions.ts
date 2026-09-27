import { toChordSpec } from '@sw/core';
import { findEvent } from '@sw/core';
import { songStore } from '@sw/song-store';
import { useStore } from './store';

/**
 * Focuses the guitar module's Chords tab on one progression event (§7 Phase 3 items 1–3): looked
 * up in the currently open song, shown as chord tones (only) in the "Progression chord" mode.
 * Returns false (and leaves the focus untouched) if the event no longer exists — the caller then
 * falls back to something else (the song's first chord, or clearing the focus).
 */
export function selectProgressionEvent(eventId: string): boolean {
  const song = songStore.getState().currentSong();
  const found = song ? findEvent(song, eventId) : null;
  if (!found) return false;
  const chord = found.section.events[found.index]!.chord;
  const state = useStore.getState();
  state.setProgressionFocus(eventId, chord);
  state.setChordSpec(toChordSpec(chord));
  state.setMode('chord');
  return true;
}

/** Clears the progression focus (leaving tool mode, or the song has no chords at all). */
export function clearProgressionFocus(): void {
  useStore.getState().setProgressionFocus(null, null);
}
