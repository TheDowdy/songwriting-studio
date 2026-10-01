import { findEvent } from './song';
import type { Song } from './schema';
import type { Key } from './theory/types';

/** The key a section is in: its own if it has one (a modulation), otherwise the song's. */
export function keyOfSection(song: Song, sectionId: string | null | undefined): Key {
  const section = sectionId ? song.sections.find((s) => s.id === sectionId) : undefined;
  return section?.key ?? song.key;
}

/** The key of the section a chord event sits in. */
export function keyOfEvent(song: Song, eventId: string | null | undefined): Key {
  const found = eventId ? findEvent(song, eventId) : null;
  return found?.section.key ?? song.key;
}

export const sameKey = (a: Key, b: Key) => a.tonic === b.tonic && a.mode === b.mode;
