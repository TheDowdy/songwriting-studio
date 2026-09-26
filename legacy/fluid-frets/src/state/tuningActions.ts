import { audioEngine } from '../audio/engine';
import { resolveTuning } from '../theory/savedTunings';
import { STRING_COUNT, type Tuning } from '../theory/tunings';
import { animateLive } from './tuningAnimation';
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
 * Switches to a preset or saved tuning: labels slide to their new positions, then (if enabled)
 * the new open strings are softly strummed.
 */
export function selectTuning(next: Tuning): void {
  const state = useStore.getState();
  state.setTuning(next);
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
  const { tuning, savedTunings, setTuning } = useStore.getState();
  const strings = tuning.strings.slice();
  strings[stringIndex] = midi;
  const next = resolveTuning(strings, savedTunings);
  setTuning(next);
  return next;
}
