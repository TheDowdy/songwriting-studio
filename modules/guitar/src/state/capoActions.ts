import { songStore } from '@sw/song-store';
import { sanitizeCapo } from '@sw/core/fret/capo';
import { voicingsLeftBehind } from './guitarChangeGuard';
import { useStore } from './store';
import { recordUndo } from './undoRecord';

/**
 * Sets the capo (0–12, §7 Phase 3 item 4): the song's, through the song store, in song context —
 * so it's flagged alongside the tuning for every other consumer of `song.guitar` — or the tool's
 * own persisted capo otherwise. Always updates what's drawn immediately.
 */
export function applyCapo(capo: number, opts: { confirmed?: boolean } = {}): boolean {
  const clamped = sanitizeCapo(capo);
  const state = useStore.getState();
  const song = state.songId ? songStore.getState().library[state.songId] : undefined;
  if (song) {
    // Asks first when it would leave committed voicings behind (Phase 7 item 1) — see applyTuning.
    const count = voicingsLeftBehind(song, song.guitar.tuning, clamped);
    if (count > 0 && !opts.confirmed) {
      state.setPendingGuitarChange({ kind: 'capo', capo: clamped, count });
      return false;
    }
    if (song.guitar.capo !== clamped) recordUndo('Capo change');
    songStore.getState().setGuitarCapo(clamped);
  } else {
    state.setToolCapo(clamped);
  }
  useStore.getState().setCapo(clamped);
  return true;
}
