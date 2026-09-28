/**
 * Editing the song's progression from inside the guitar module (Phase 6 item 1). Every change goes
 * through the song store, exactly as the progression module's own edits do, so the two modules
 * always show the same song. After a change that lands on a chord, that chord is focused and
 * strummed (a direct user gesture, like clicking a strip block — §7 Phase 3 change 2).
 */
import {
  findEvent,
  flattenSong,
  fromChordSpec,
  withChordSpec,
  withInversion,
  type ChordRef,
} from '@sw/core';
import type { ChordSpec } from '@sw/core/fret/chords';
import { songStore } from '@sw/song-store';
import { selectBestVoicing, strumChord } from './chordActions';
import { clearProgressionFocus, selectProgressionEvent } from './progressionChordActions';
import { useStore } from './store';

function currentSong() {
  return songStore.getState().currentSong();
}

/** Focus `eventId` and sound it: its committed voicing if it has one, otherwise its best shape. */
export function focusAndPlay(eventId: string): void {
  if (!selectProgressionEvent(eventId)) return;
  const song = currentSong();
  const found = song ? findEvent(song, eventId) : null;
  const committed = found?.section.events[found.index]?.attachments?.guitar;
  if (committed) {
    useStore.getState().setChordShape(committed.frets.slice(), null);
    strumChord();
  } else {
    selectBestVoicing({ play: true });
  }
}

/** Adds `chord` after `afterEventId` (in that chord's section), or at the end of `intoSectionId`
 *  (an empty section's "+ Add chord"), or of the first section (an empty song). */
export function addChordAfter(afterEventId: string | null, chord: ChordRef, intoSectionId?: string): void {
  const song = currentSong();
  if (!song) return;
  const sectionId = afterEventId ? findEvent(song, afterEventId)?.section.id : intoSectionId ?? song.sections[0]?.id;
  if (!sectionId) return;
  const id = songStore.getState().addChord(sectionId, afterEventId, chord);
  if (id) focusAndPlay(id);
}

/** Puts an entirely different chord in place of `eventId`. Its committed voicing is cleared: a
 *  shape for another chord says nothing about this one (a flavour or inversion change keeps it,
 *  flagged, so it can be re-fitted near where it was). */
export function replaceChord(eventId: string, chord: ChordRef): void {
  songStore.getState().setEventChord(eventId, chord);
  songStore.getState().clearVoicing(eventId);
  focusAndPlay(eventId);
}

/** The rich builder's edit (Phase 6 "Flavour"): same root and bass, new shape. */
export function setChordFlavour(eventId: string, chord: ChordRef, spec: ChordSpec): void {
  const song = currentSong();
  if (!song) return;
  songStore.getState().setEventChord(eventId, withChordSpec(chord, spec, song.key));
  selectBestVoicing({ play: true });
}

export function setChordInversion(eventId: string, chord: ChordRef, inversion: number): void {
  const song = currentSong();
  if (!song) return;
  songStore.getState().setEventChord(eventId, withInversion(chord, inversion, song.key));
  selectBestVoicing({ play: true });
}

/** "Build any chord…": a chord from the builder's root + spec, spelled and labelled for the key. */
export function chordFromBuilder(spec: ChordSpec): ChordRef | null {
  const song = currentSong();
  return song ? fromChordSpec(spec, song.key) : null;
}

export function duplicateChord(eventId: string): void {
  const id = songStore.getState().duplicateEvent(eventId);
  if (id) focusAndPlay(id);
}

/** Removes `eventId` and focuses its neighbour (the next chord, else the one before), or clears the
 *  focus when it was the song's last chord. */
export function removeChord(eventId: string): void {
  const song = currentSong();
  if (!song) return;
  const flat = flattenSong(song);
  const at = flat.findIndex((e) => e.id === eventId);
  const neighbour = flat.slice(at + 1).find((e) => e.id !== eventId) ?? flat.slice(0, at).reverse().find((e) => e.id !== eventId);
  songStore.getState().removeEvent(eventId);
  if (neighbour) selectProgressionEvent(neighbour.id);
  else clearProgressionFocus();
}

export function adjustChordBeats(eventId: string, delta: number): void {
  songStore.getState().adjustEventBeats(eventId, delta);
}

/** Moves a chord within its section (the strip's drag to reorder). */
export function reorderChord(sectionId: string, fromIndex: number, toIndex: number): void {
  songStore.getState().reorderEvents(sectionId, fromIndex, toIndex);
}

export function addSection(): void {
  const id = songStore.getState().addSection();
  if (id) useStore.getState().setStripAddSectionId(id);
}

export function renameSection(sectionId: string, name: string): void {
  songStore.getState().renameSection(sectionId, name);
}

export function duplicateSection(sectionId: string): void {
  songStore.getState().duplicateSection(sectionId);
}
