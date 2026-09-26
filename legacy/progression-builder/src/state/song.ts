import type { ChordRef, Key } from '../theory/types';
import type { ChordEvent, Section, Song } from '../types';

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
  const start = inSlot[0].offsetBeats;
  const end = inSlot[inSlot.length - 1].offsetBeats + inSlot[inSlot.length - 1].event.beats;
  return { start, end };
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
