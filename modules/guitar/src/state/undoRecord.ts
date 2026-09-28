/** Remembering the song before a guitar-module change (Phase 7 item 3). Kept apart from `undo.ts`
 *  so the actions that record (and are imported by it) don't form an import cycle. */
import { songStore } from '@sw/song-store';
import { useStore } from './store';

/** Remember the open song before a change, labelled for the Undo button ("Undo Re-voice all"). */
export function recordUndo(label: string): void {
  const song = songStore.getState().currentSong();
  if (song) useStore.getState().setGuitarUndo({ songId: song.id, label, song });
}
