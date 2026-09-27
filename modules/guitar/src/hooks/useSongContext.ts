import { useLayoutEffect } from 'react';
import { defaultGuitarSetup, flattenSong } from '@sw/core';
import { songStore } from '@sw/song-store';
import { resolveTuning } from '@sw/core/fret/savedTunings';
import { isValidStrings, STANDARD_TUNING, type Tuning } from '@sw/core/fret/tunings';
import { clearProgressionFocus, selectProgressionEvent } from '../state/progressionChordActions';
import { useStore } from '../state/store';

function tuningFromSong(tuning: readonly number[], saved: readonly Tuning[]): Tuning {
  return isValidStrings(tuning) ? resolveTuning(tuning, saved) : STANDARD_TUNING;
}

const sameStrings = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * Keeps the guitar module in step with a song while it's open in song context (§7 Phase 3): the
 * neck's tuning/capo mirror `song.guitar` — edited through the song store, not the tool's own
 * persisted settings (item 4) — and the Chords tab focuses whichever progression event the URL
 * asked for, or the one already focused, or the song's first chord (items 1, 3). Runs before paint
 * (`useLayoutEffect`) so there's no flash of the tool's own tuning or an unrelated chord, and
 * re-syncs on every mount so a detour through tool mode never leaves a stale chord showing.
 */
export function useSongContext(songId: string | null, focusEventId: string | undefined): void {
  useLayoutEffect(() => {
    useStore.getState().setSongId(songId);

    const applyGuitarSetup = () => {
      const song = songId ? songStore.getState().library[songId] : undefined;
      const guitar = song?.guitar ?? defaultGuitarSetup();
      const state = useStore.getState();
      const tuning = tuningFromSong(guitar.tuning, state.savedTunings);
      if (!sameStrings(tuning.strings, state.tuning.strings) || tuning.id !== state.tuning.id) {
        state.jumpToTuning(tuning);
      }
      if (guitar.capo !== state.capo) state.setCapo(guitar.capo);
    };

    if (!songId) {
      const tool = useStore.getState();
      tool.jumpToTuning(tool.toolTuning);
      tool.setCapo(tool.toolCapo);
      clearProgressionFocus();
      return undefined;
    }

    applyGuitarSetup();
    const song = songStore.getState().library[songId];
    const wanted = focusEventId ?? useStore.getState().progressionEventId ?? undefined;
    const focused = wanted ? selectProgressionEvent(wanted) : false;
    if (!focused) {
      const first = song ? flattenSong(song)[0] : undefined;
      if (first) selectProgressionEvent(first.id);
      else clearProgressionFocus();
    }

    return songStore.subscribe(applyGuitarSetup);
  }, [songId, focusEventId]);
}
