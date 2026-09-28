import { audioEngine } from '../audio/engine';
import { songStore } from '@sw/song-store';
import { resolveTuning } from '@sw/core/fret/savedTunings';
import { STRING_COUNT, type Tuning } from '@sw/core/fret/tunings';
import { voicingsLeftBehind } from './guitarChangeGuard';
import { animateLive, cancelAnimation } from './tuningAnimation';
import { recordUndo } from './undoRecord';
import { useStore } from './store';

/** Duration of the label slide when a whole tuning is picked from the list (§6). */
export const TUNING_SLIDE_MS = 300;
/** Landing animation when a released peg snaps to the nearest semitone (§4). */
export const SNAP_MS = 120;
/** Gap between strings in the soft strum of the new open strings. */
const STRUM_SPACING = 0.035;

/** Sounds the open strings of `strings` low → high, softly. */
export function strumOpenStrings(strings: readonly number[], velocity = 0.45): void {
  audioEngine.pluckMany(
    strings.map((midi, string) => ({ string, midi })),
    { velocity, spacing: STRUM_SPACING },
  );
}

/**
 * Commits a tuning to whichever store owns it right now (§7 Phase 3 item 4): the song, through the
 * song store, in song context; otherwise the tool's own persisted tuning. Always updates what's
 * drawn immediately, whichever store it also went to.
 *
 * In song context, a change that would leave committed voicings behind asks first (Phase 7 item
 * 1): it's held as `pendingGuitarChange`, what's drawn snaps back, and this returns false; the
 * confirm dialog then calls it again with `confirmed`. Returns whether the tuning was applied.
 */
export function applyTuning(next: Tuning, opts: { confirmed?: boolean } = {}): boolean {
  const state = useStore.getState();
  const song = state.songId ? songStore.getState().library[state.songId] : undefined;
  if (song) {
    const count = voicingsLeftBehind(song, next.strings, song.guitar.capo);
    if (count > 0 && !opts.confirmed) {
      state.setPendingGuitarChange({ kind: 'tuning', tuning: next, count });
      state.jumpToTuning(state.tuning);
      return false;
    }
    if (count > 0 || song.guitar.tuning.some((n, i) => n !== next.strings[i])) recordUndo('Tuning change');
    songStore.getState().setGuitarTuning(next.strings, next.name);
  } else {
    state.setToolTuning(next);
  }
  useStore.getState().setTuning(next);
  return true;
}

/**
 * Switches to a preset or saved tuning: labels slide to their new positions, then (if enabled)
 * the new open strings are softly strummed.
 */
export function selectTuning(next: Tuning): void {
  if (!applyTuning(next)) return;
  let remaining = STRING_COUNT;
  const landed = () => {
    if (--remaining === 0 && useStore.getState().strumOnTuningChange) {
      strumOpenStrings(next.strings);
    }
  };
  next.strings.forEach((midi, i) => animateLive(i, midi, TUNING_SLIDE_MS, landed));
}

/**
 * Commits one string to a whole-semitone pitch after a peg edit. The result is named after the
 * preset (or saved tuning) it now equals, otherwise it becomes "Custom" (§5).
 */
export function commitStringPitch(stringIndex: number, midi: number): Tuning {
  const { tuning, savedTunings } = useStore.getState();
  const strings = tuning.strings.slice();
  strings[stringIndex] = midi;
  const next = resolveTuning(strings, savedTunings);
  if (!applyTuning(next)) {
    // Held for confirmation (Phase 7 item 1): stop the peg's settle animation and show the tuning
    // the song still has.
    cancelAnimation(stringIndex);
    useStore.getState().jumpToTuning(useStore.getState().tuning);
  }
  return next;
}
