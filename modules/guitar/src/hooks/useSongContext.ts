import { useLayoutEffect } from 'react';
import { defaultGuitarSetup, flattenSong } from '@sw/core';
import { songStore } from '@sw/song-store';
import { defaultGuitarTab } from '@sw/core/fret/guitarTabs';
import { resolveTuning } from '@sw/core/fret/savedTunings';
import { isValidStrings, STANDARD_TUNING, type Tuning } from '@sw/core/fret/tunings';
import { clearProgressionFocus, selectProgressionEvent, syncFocusedChord } from '../state/progressionChordActions';
import { useStore } from '../state/store';

/** While the tab is still the context's default (nobody has picked one yet — §7 Phase 3 change 1),
 *  keeps it in step as a song opens or closes: Chords for a song, Scales for the stand-alone tool.
 *  A real tab choice (`chooseMode`) clears `modeIsDefault`, so this then leaves the tab alone. */
function applyContextualDefault(hasSong: boolean): void {
  const state = useStore.getState();
  if (state.modeIsDefault) state.setMode(defaultGuitarTab(hasSong));
}

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
      applyContextualDefault(false);
      return undefined;
    }

    applyGuitarSetup();
    const song = songStore.getState().library[songId];
    const wanted = focusEventId ?? songStore.getState().focusedEventId ?? useStore.getState().progressionEventId ?? undefined;
    const focused = wanted ? selectProgressionEvent(wanted) : false;
    if (!focused) {
      const first = song ? flattenSong(song)[0] : undefined;
      // Focusing a chord (below) always shows the Chords tab anyway; only the chordless case needs
      // the default applied explicitly.
      if (first) selectProgressionEvent(first.id);
      else {
        clearProgressionFocus();
        applyContextualDefault(true);
      }
    }

    return songStore.subscribe(() => {
      applyGuitarSetup();
      syncFocusedChord(songId);
    });
  }, [songId, focusEventId]);
}
