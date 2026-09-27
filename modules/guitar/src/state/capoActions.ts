import { songStore } from '@sw/song-store';
import { sanitizeCapo } from '@sw/core/fret/capo';
import { useStore } from './store';

/**
 * Sets the capo (0–12, §7 Phase 3 item 4): the song's, through the song store, in song context —
 * so it's flagged alongside the tuning for every other consumer of `song.guitar` — or the tool's
 * own persisted capo otherwise. Always updates what's drawn immediately.
 */
export function applyCapo(capo: number): void {
  const clamped = sanitizeCapo(capo);
  const { songId } = useStore.getState();
  if (songId) songStore.getState().setGuitarCapo(clamped);
  else useStore.getState().setToolCapo(clamped);
  useStore.getState().setCapo(clamped);
}
