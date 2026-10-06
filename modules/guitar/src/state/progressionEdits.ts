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
  insertionPoint,
  keyOfEvent,
  keyOfSection,
  withChordSpec,
  withInversion,
  type ChordRef,
  type VariantGeneratorId,
  type VariantOptions,
} from '@sw/core';
import type { ChordSpec } from '@sw/core/fret/chords';
import { songStore } from '@sw/song-store';
import { selectBestVoicing, strumChord } from './chordActions';
import { clearProgressionFocus, commitShownShape, selectProgressionEvent } from './progressionChordActions';
import { useStore } from './store';
import { recordUndo } from './undoRecord';

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
  recordUndo('Add chord');
  const id = songStore.getState().addChord(sectionId, afterEventId, chord);
  if (id) focusAndPlay(id);
}

/** Puts an entirely different chord in place of `eventId`. Its committed voicing is cleared: a
 *  shape for another chord says nothing about this one (a flavour or inversion change keeps it,
 *  flagged, so it can be re-fitted near where it was). */
export function replaceChord(eventId: string, chord: ChordRef): void {
  recordUndo('Replace');
  songStore.getState().setEventChord(eventId, chord);
  songStore.getState().clearVoicing(eventId);
  focusAndPlay(eventId);
}

/** The rich builder's edit (Phase 6 "Flavour"): same root and bass, new shape. */
export function setChordFlavour(eventId: string, chord: ChordRef, spec: ChordSpec): void {
  const song = currentSong();
  if (!song) return;
  recordUndo('Flavour');
  songStore.getState().setEventChord(eventId, withChordSpec(chord, spec, keyOfEvent(song, eventId)));
  selectBestVoicing({ play: true });
}

export function setChordInversion(eventId: string, chord: ChordRef, inversion: number): void {
  const song = currentSong();
  if (!song) return;
  recordUndo('Inversion');
  songStore.getState().setEventChord(eventId, withInversion(chord, inversion, keyOfEvent(song, eventId)));
  selectBestVoicing({ play: true });
}

/** "Build any chord…": a chord from the builder's root + spec, spelled and labelled for the key. */
export function chordFromBuilder(spec: ChordSpec, eventId?: string | null): ChordRef | null {
  const song = currentSong();
  return song ? fromChordSpec(spec, keyOfEvent(song, eventId)) : null;
}

export function duplicateChord(eventId: string): void {
  recordUndo('Duplicate');
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
  recordUndo('Remove');
  songStore.getState().removeEvent(eventId);
  if (neighbour) selectProgressionEvent(neighbour.id);
  else clearProgressionFocus();
}

export function adjustChordBeats(eventId: string, delta: number): void {
  recordUndo('Beats');
  songStore.getState().adjustEventBeats(eventId, delta);
}

/** Moves a chord within its section (the strip's drag to reorder). */
export function reorderChord(sectionId: string, fromIndex: number, toIndex: number): void {
  recordUndo('Reorder');
  songStore.getState().reorderEvents(sectionId, fromIndex, toIndex);
}

export function addSection(name?: string): void {
  recordUndo('Add section');
  const id = songStore.getState().addSection(name);
  if (id) useStore.getState().setStripAddSectionId(id);
}

export function renameSection(sectionId: string, name: string): void {
  const song = currentSong();
  if (song?.sections.find((s) => s.id === sectionId)?.name === name.trim()) return;
  recordUndo('Rename section');
  songStore.getState().renameSection(sectionId, name);
}

export function duplicateSection(sectionId: string): void {
  recordUndo('Duplicate section');
  songStore.getState().duplicateSection(sectionId);
}

/** "Make variant" (Phase 8 item 1): a copy of the section voiced by one of the generators in
 *  `@sw/core`'s `variants.ts`, inserted right after the source in the arrangement. */
export function makeSectionVariant(sectionId: string, generator: VariantGeneratorId, options?: VariantOptions): void {
  recordUndo('Make variant');
  songStore.getState().makeVariantWithGenerator(sectionId, generator, options);
}

/**
 * Adds a chord built or identified on the neck to the song's progression: after the focused chord,
 * or at the end of the last section when none is focused. `shape` (frets, null = muted) becomes its
 * committed voicing, so the song plays exactly what was built. The new chord is focused and
 * strummed, and, because focus is shared through the song store, the Progression module opens
 * centred on it with suggestions for what could follow. Returns false if there is no song.
 */
export function addChordToProgression(spec: ChordSpec, shape: (number | null)[] | null): boolean {
  const song = currentSong();
  if (!song) return false;
  const point = insertionPoint(song, useStore.getState().progressionEventId);
  if (!point) return false;
  const chord = fromChordSpec(spec, keyOfSection(song, point.sectionId));
  recordUndo('Add chord to progression');
  const id = songStore.getState().addChord(point.sectionId, point.afterEventId, chord);
  if (!id) return false;
  if (!selectProgressionEvent(id)) return true;
  if (shape?.some((f) => typeof f === 'number')) {
    useStore.getState().setChordShape(shape.slice(), null);
    commitShownShape();
  }
  strumChord();
  return true;
}

/** Sets a chord's length (dragging its right edge). */
export function setChordBeats(eventId: string, beats: number): void {
  recordUndo('Beats');
  songStore.getState().setEventBeats(eventId, beats);
}

/** Moves a chord into another section (the strip's drag between sections). */
export function moveChord(eventId: string, toSectionId: string, toIndex: number): void {
  recordUndo('Move chord');
  songStore.getState().moveEvent(eventId, toSectionId, toIndex);
}

export function setSectionRepeat(sectionId: string, repeat: number): void {
  recordUndo('Repeat');
  songStore.getState().setSectionRepeat(sectionId, repeat);
}

/** Drops the focus if the chord it was on no longer exists. */
function dropFocusIfGone(): void {
  const song = currentSong();
  const id = useStore.getState().progressionEventId;
  if (song && id && !findEvent(song, id)) {
    const next = flattenSong(song)[0];
    if (next) selectProgressionEvent(next.id);
    else clearProgressionFocus();
  }
}

export function removeSection(sectionId: string): void {
  recordUndo('Delete section');
  songStore.getState().removeSection(sectionId);
  dropFocusIfGone();
}

export function clearSection(sectionId: string): void {
  recordUndo('Clear section');
  songStore.getState().clearSection(sectionId);
  dropFocusIfGone();
}
