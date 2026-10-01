import { findEvent, toChordSpec, withInversion, type GuitarVoicing } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { nearestVoicing, shapeNotes, shiftCapo } from '@sw/core/fret/voicings';
import { songStore } from '@sw/song-store';
import { defaultBassMode, inversionForBassPc } from './bassMode';
import { chordContext } from './chordActions';
import { useStore } from './store';
import { recordUndo } from './undoRecord';

/**
 * Focuses the guitar module's Chords tab on one progression event (§7 Phase 3 items 1–3): looked
 * up in the currently open song, shown as chord tones (only) in the "Progression chord" mode.
 * Also resets the bass/inversion control to whatever inversion the chord is already in (Phase 4
 * item 3) — never carried over from whichever chord was focused before. Returns false (and leaves
 * the focus untouched) if the event no longer exists — the caller then falls back to something
 * else (the song's first chord, or clearing the focus).
 */
export function selectProgressionEvent(eventId: string): boolean {
  const song = songStore.getState().currentSong();
  const found = song ? findEvent(song, eventId) : null;
  if (!found) return false;
  const chord = found.section.events[found.index]!.chord;
  const state = useStore.getState();
  songStore.getState().setFocusedEventId(eventId);
  state.setProgressionFocus(eventId, chord);
  state.setBassMode(defaultBassMode(chord));
  state.setChordSpec(toChordSpec(chord));
  state.setMode('chord');
  return true;
}

/** Clears the progression focus (leaving tool mode, or the song has no chords at all). */
export function clearProgressionFocus(): void {
  useStore.getState().setProgressionFocus(null, null);
  useStore.getState().setBassMode('root');
}

/**
 * Keeps the focused chord (`progressionChord`/`chordSpec`/the bass control) in step with the song
 * while it stays focused — a flavour, inversion or other edit made in the progression module (not
 * through this module's own actions, which already update these directly) would otherwise leave
 * the guitar module searching voicings for a chord that no longer exists: a stale badge would show,
 * but Re-fit would then fit the *old* chord instead of the current one. A no-op if nothing actually
 * changed the chord, or nothing (or a different song) is focused.
 */
export function syncFocusedChord(songId: string | null): void {
  const { progressionEventId, progressionChord } = useStore.getState();
  if (!songId || !progressionEventId) return;
  const song = songStore.getState().library[songId];
  const found = song ? findEvent(song, progressionEventId) : null;
  const chord = found?.section.events[found.index]?.chord;
  if (!chord || chord === progressionChord) return;
  const state = useStore.getState();
  state.setProgressionFocus(progressionEventId, chord);
  state.setBassMode(defaultBassMode(chord));
  state.setChordSpec(toChordSpec(chord));
}

/** The focused progression event's own committed voicing (§3.2), if it has one. Null outside song
 *  context, before anything is focused, or for a chord nobody has committed a shape to yet. */
export function committedVoicingFor(songId: string | null, eventId: string | null): GuitarVoicing | null {
  if (!songId || !eventId) return null;
  const song = songStore.getState().library[songId];
  const found = song ? findEvent(song, eventId) : null;
  return found?.section.events[found.index]?.attachments?.guitar ?? null;
}

/**
 * Commits the shape currently shown on the neck as the focused chord's voicing (Phase 4 item 4:
 * "Use this voicing"). `source` records how it was arrived at, so a later re-fit or display can
 * tell a hand-edited shape from a picked or simply-recommended one.
 *
 * If the committed shape's own lowest sounding note isn't the chord's root, the progression chord
 * itself is updated to match (`withInversion`) — Phase 4 item 3 — so the numeral shows the
 * inversion in both modules, whether that bass came from the bass/inversion control or from
 * hand-editing a shape into an inversion directly. A bass note that isn't one of the chord's own
 * stack tones (an extension used as a bass note under "Any bass") leaves the chord's `bass` alone
 * — see `inversionForBassPc`.
 */
export function commitCurrentVoicing(): void {
  recordUndo('Use this voicing');
  commitShownShape();
}

/** `commitCurrentVoicing` without recording an undo step (the caller already has). */
export function commitShownShape(): void {
  const state = useStore.getState();
  const { songId, progressionEventId, progressionChord, chordShape, tuning, capo, voicingIndex, editingShape } = state;
  if (!songId || !progressionEventId || !progressionChord || !chordShape) return;
  const song = songStore.getState().library[songId];
  if (!song) return;

  const { best } = chordContext();
  const source: GuitarVoicing['source'] = editingShape ? 'edited' : voicingIndex === best ? 'recommended' : 'picked';
  const voicing: GuitarVoicing = { frets: chordShape.slice(), tuning: tuning.strings.slice(), capo, source };
  songStore.getState().commitVoicing(progressionEventId, voicing);

  const sounding = shapeNotes(capoedTuning(tuning.strings, capo), chordShape);
  if (sounding.length === 0) return;
  const lowest = sounding.reduce((a, b) => (a.midi <= b.midi ? a : b));
  const bassPc = ((lowest.midi % 12) + 12) % 12;
  const inversion = inversionForBassPc(progressionChord, bassPc);
  if (inversion === null) return;
  const updated = withInversion(progressionChord, inversion, song.key);
  if (updated.bass === progressionChord.bass) return; // already matches — nothing to change
  songStore.getState().setEventChord(progressionEventId, updated);
  state.setProgressionFocus(progressionEventId, updated);
  state.setChordSpec(toChordSpec(updated)); // keeps the chord-summary/search target honest too
}

/** Clears the focused chord's committed voicing (Phase 4 item 4: "Remove voicing") — it goes back
 *  to showing its best (or hand-edited) shape, like an uncommitted chord. */
export function clearCurrentVoicing(): void {
  const { progressionEventId } = useStore.getState();
  if (!progressionEventId) return;
  recordUndo('Remove voicing');
  songStore.getState().clearVoicing(progressionEventId);
}

/**
 * Replaces a stale committed voicing with the best fit for its current chord/tuning/capo (Phase 4
 * item 5: "Re-fit") — the valid voicing nearest the old shape, per `nearestVoicing`. Also shows it
 * on the neck immediately, exactly like committing any other voicing. A no-op if there's nothing
 * committed, or somehow no voicing at all fits.
 */
export function refitCurrentVoicing(): void {
  const { songId, progressionEventId } = useStore.getState();
  const old = committedVoicingFor(songId, progressionEventId);
  if (!old) return;
  const { voicings } = chordContext();
  // Compared where the hand is on the neck: the old shape moved to the current capo.
  const fit = nearestVoicing(shiftCapo(old.frets, old.capo, useStore.getState().capo), voicings);
  if (!fit) return;
  recordUndo('Re-fit');
  useStore.getState().setEditingShape(false); // a re-fit result is a found voicing, never "edited"
  useStore.getState().setChordShape(fit.frets.slice(), voicings.indexOf(fit)); // `fit` is one of `voicings`, so always found
  commitShownShape();
}
