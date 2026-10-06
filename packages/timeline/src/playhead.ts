import { createStore } from 'zustand/vanilla';
import { flattenDetailed, type Song } from '@sw/core';

/**
 * Where playback is in the song's arrangement, shared by every module's strip. Chord events carry
 * only an event id, and a repeated section plays the same ids again, so the arrangement slot is
 * found by walking forward through the song's flattened chords as each new chord is heard.
 */
export interface PlayheadState {
  /** Index into `flattenDetailed(song)` of the chord now sounding, or null when stopped. */
  cursor: number | null;
  /** Index into `song.arrangement` of the slot now playing, or null when stopped. */
  slot: number | null;
  sectionId: string | null;
  /** The chord now sounding (null when stopped), and the beat of it being heard (from 0). */
  eventId: string | null;
  beat: number;
}

export const playhead = createStore<PlayheadState>(() => ({ cursor: null, slot: null, sectionId: null, eventId: null, beat: 0 }));

const STOPPED: PlayheadState = { cursor: null, slot: null, sectionId: null, eventId: null, beat: 0 };

/** The next place after `cursor` (wrapping round, for a loop) where chord `eventId` plays. */
export function nextCursor(flatIds: readonly string[], cursor: number | null, eventId: string): number {
  const n = flatIds.length;
  const from = cursor === null ? 0 : cursor + 1;
  for (let i = 0; i < n; i++) {
    const at = (from + i) % n;
    if (flatIds[at] === eventId) return at;
  }
  return -1;
}

/** Call when a chord starts sounding. */
export function advancePlayhead(song: Song, eventId: string): void {
  const flat = flattenDetailed(song);
  const prev = playhead.getState().cursor;
  // The same chord reported again is still the same place (e.g. a second strike of one chord).
  const sameAgain = prev !== null && flat[prev]?.event.id === eventId && flat.filter((f) => f.event.id === eventId).length === 1;
  const at = sameAgain ? prev : nextCursor(flat.map((f) => f.event.id), prev, eventId);
  const hit = at >= 0 ? flat[at] : undefined;
  // A new chord starts on its first beat, so the old chord's last beat never flashes on it.
  playhead.setState(hit ? { cursor: at, slot: hit.arrangementIndex, sectionId: hit.sectionId, eventId, beat: 0 } : STOPPED);
}

/** Call as each beat of the sounding chord is heard. */
export function setPlayheadBeat(eventId: string, beat: number): void {
  playhead.setState({ eventId, beat });
}

/** Call when playback stops or ends. */
export function clearPlayhead(): void {
  playhead.setState(STOPPED);
}
