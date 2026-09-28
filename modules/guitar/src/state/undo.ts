/**
 * A single level of undo for changes made in the guitar module (Phase 7 item 3): committing,
 * removing, re-fitting or re-voicing voicings, a tuning or capo change, and the strip's edits.
 * Each such action records the song as it was just before; Undo puts that song back.
 */
import { indexOfShape } from '@sw/core/fret/voicings';
import { songStore } from '@sw/song-store';
import { chordContext, selectBestVoicing } from './chordActions';
import { committedVoicingFor } from './progressionChordActions';
import { useStore } from './store';

export { recordUndo } from './undoRecord';

/** Restores the song from before the last recorded change. The neck, strip and progression
 *  module all follow the song store, so they show the restored song straight away. */
export function undoLastGuitarChange(): void {
  const state = useStore.getState();
  const undo = state.guitarUndo;
  const current = songStore.getState().currentSong();
  if (!undo || !current || undo.songId !== current.id) return;
  songStore.getState().saveSong(undo.song);
  state.setGuitarUndo(null);
  // The focused chord may have got its old voicing back (or lost one): show what it has now.
  const { songId, progressionEventId } = useStore.getState();
  const committed = committedVoicingFor(songId, progressionEventId);
  if (committed) {
    const index = indexOfShape(chordContext().voicings, committed.frets);
    useStore.getState().setChordShape(committed.frets.slice(), index >= 0 ? index : null);
  } else if (progressionEventId) {
    selectBestVoicing();
  }
}
