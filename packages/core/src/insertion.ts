import { findEvent } from './song';
import type { Song } from './schema';

/** Where a new chord goes: into `sectionId`, after `afterEventId` (null = at the start of an empty section). */
export interface InsertionPoint {
  sectionId: string;
  afterEventId: string | null;
}

/**
 * Where "add this chord to the progression" puts it when it comes from somewhere that is not the
 * chord map (for example the guitar module's Chords or Identify tab).
 *
 * - With a chord focused: right after it, in its section.
 * - Otherwise: at the end of the song's last section in the arrangement, so the new chord extends
 *   the progression as it is played.
 * - Null only for a song with no sections.
 */
export function insertionPoint(song: Song, focusedEventId: string | null): InsertionPoint | null {
  const focused = focusedEventId ? findEvent(song, focusedEventId) : null;
  if (focused) return { sectionId: focused.section.id, afterEventId: focusedEventId };

  const lastId = song.arrangement[song.arrangement.length - 1];
  const section = song.sections.find((s) => s.id === lastId) ?? song.sections[song.sections.length - 1];
  if (!section) return null;
  return { sectionId: section.id, afterEventId: section.events[section.events.length - 1]?.id ?? null };
}
