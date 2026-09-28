/** Pure helpers over the song model (§3.2): construction, flattening, lookup. No storage, no
 *  framework — `song-store` and both modules build on these. */
import type { ChordRef, Key } from './theory/types';
import { defaultGuitarSetup, SCHEMA_VERSION } from './schema';
import type { ChordEvent, Section, Song } from './schema';

export const DEFAULT_KEY: Key = { tonic: 'C', mode: 'major' };
export const DEFAULT_BEATS = 4;

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function newSection(name = 'Verse'): Section {
  return { id: newId(), name, events: [], repeat: 1 };
}

export function newSong(key: Key = DEFAULT_KEY): Song {
  const section = newSection('Verse');
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    title: 'Untitled song',
    key,
    timeSig: { beats: 4, unit: 4 },
    bpm: 100,
    instrument: 'piano',
    pattern: 'block',
    sections: [section],
    arrangement: [section.id],
    updatedAt: Date.now(),
    guitar: defaultGuitarSetup(),
  };
}

export function newEvent(chord: ChordRef, beats = DEFAULT_BEATS): ChordEvent {
  return { id: newId(), chord, beats };
}

export interface FlatEvent {
  event: ChordEvent;
  /** Beats from the song's start. */
  offsetBeats: number;
  /** Index into `song.arrangement` (one slot's repeats all share this index). */
  arrangementIndex: number;
  sectionId: string;
}

/** The song as one flat, ordered, beat-timed list of events, following the arrangement and repeats. */
export function flattenDetailed(song: Song): FlatEvent[] {
  const out: FlatEvent[] = [];
  let offset = 0;
  song.arrangement.forEach((sectionId, arrangementIndex) => {
    const section = song.sections.find((s) => s.id === sectionId);
    if (!section) return;
    for (let r = 0; r < Math.max(1, section.repeat); r++) {
      for (const event of section.events) {
        out.push({ event, offsetBeats: offset, arrangementIndex, sectionId });
        offset += event.beats;
      }
    }
  });
  return out;
}

/** The song as one flat, ordered list of chord events, following the arrangement and repeats. */
export function flattenSong(song: Song): ChordEvent[] {
  return flattenDetailed(song).map((f) => f.event);
}

/**
 * The beat range of `sectionId`'s first appearance in the arrangement (including its own
 * repeats), for looping just that section. Null if the section isn't in the arrangement.
 */
export function sectionLoopBounds(song: Song, sectionId: string): { start: number; end: number } | null {
  const flat = flattenDetailed(song);
  const firstSlot = flat.find((f) => f.sectionId === sectionId)?.arrangementIndex;
  if (firstSlot === undefined) return null;
  const inSlot = flat.filter((f) => f.arrangementIndex === firstSlot);
  const first = inSlot[0];
  const last = inSlot[inSlot.length - 1];
  if (!first || !last) return null;
  return { start: first.offsetBeats, end: last.offsetBeats + last.event.beats };
}

/**
 * What to play, and when (Phase 6 item 2 — shared by both modules): the song's chords from
 * `flattenDetailed`, or with `sectionId` just that section's first pass through the arrangement
 * (the same span `sectionLoopBounds` loops), each with its start relative to the range's start.
 * `lengthBeats` is where a loop wraps.
 */
export function playbackRange(
  song: Song,
  sectionId: string | null = null,
): { events: (FlatEvent & { startBeats: number })[]; lengthBeats: number } {
  const flat = flattenDetailed(song);
  const bounds = sectionId ? sectionLoopBounds(song, sectionId) : null;
  if (sectionId && !bounds) return { events: [], lengthBeats: 0 };
  const start = bounds ? bounds.start : 0;
  const end = bounds ? bounds.end : flat.reduce((t, f) => Math.max(t, f.offsetBeats + f.event.beats), 0);
  const events = flat
    .filter((f) => f.offsetBeats >= start && f.offsetBeats < end)
    .map((f) => ({ ...f, startBeats: f.offsetBeats - start }));
  return { events, lengthBeats: end - start };
}

/** The section that contains event `id`, and its index within that section's events. */
export function findEvent(song: Song, id: string): { section: Section; index: number } | null {
  for (const section of song.sections) {
    const index = section.events.findIndex((e) => e.id === id);
    if (index >= 0) return { section, index };
  }
  return null;
}

/** A copy of `song` with one section replaced (matched by id) and `updatedAt` bumped. */
export function withSection(song: Song, sectionId: string, next: Section): Song {
  return {
    ...song,
    sections: song.sections.map((s) => (s.id === sectionId ? next : s)),
    updatedAt: Date.now(),
  };
}
