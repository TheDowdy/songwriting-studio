/**
 * Before a song's tuning or capo changes (Phase 7 item 1): how many committed voicings were made
 * for the setup it has now, and so would be left for "the old tuning" — kept and flagged, never
 * deleted. Pure — no store, no React.
 */
import type { Song } from '@sw/core';

const sameStrings = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n, i) => n === b[i]);

export function voicingsLeftBehind(song: Song, nextTuning: readonly number[], nextCapo: number): number {
  const changes = !sameStrings(song.guitar.tuning, nextTuning) || song.guitar.capo !== nextCapo;
  if (!changes) return 0;
  let count = 0;
  for (const section of song.sections) {
    for (const event of section.events) {
      const v = event.attachments?.guitar;
      if (v && v.capo === song.guitar.capo && sameStrings(v.tuning, song.guitar.tuning)) count++;
    }
  }
  return count;
}
