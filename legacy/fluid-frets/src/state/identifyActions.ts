import { validateChord } from '../theory/chords';
import {
  emptySelection,
  readSelection,
  selectionToShape,
  tapSelection,
} from '../theory/identifySelection';
import { stopChordPlayback, strumFingering } from './chordActions';
import { playFret } from './playing';
import { useStore } from './store';

/** The picked fingering as frets (null = silent), also what a strum gesture sounds. */
export function identifyShape(): (number | null)[] {
  return selectionToShape(useStore.getState().identifySel);
}

/**
 * A tap while identifying (PLAN.md §12): pick a fret (one per string; another fret on the string
 * moves the pick, the same fret clears it), or cycle the toggle behind the nut. Picking sounds the
 * note; clearing and muting are silent.
 */
export function tapIdentifyNote(string: number, fret: number): boolean {
  const state = useStore.getState();
  if (state.mode !== 'identify') return false;
  const next = tapSelection(state.identifySel, string, fret);
  state.setIdentifySel(next);
  if (typeof next[string] === 'number') playFret(string, next[string]);
  return true;
}

export function clearIdentify(): void {
  useStore.getState().setIdentifySel(emptySelection(useStore.getState().tuning.strings.length));
}

/** Strums what is picked (the "Find chord" button, which also names it live as you pick). */
export function playIdentified(): void {
  strumFingering(identifyShape());
}

/**
 * Loads the best reading into the chord builder with the picked shape as the active voicing, and
 * switches to the Chords tab. Only chords can be sent (not a lone note or an interval).
 */
export function sendToChordMode(): boolean {
  const { tuning, identifySel, accidentalPref } = useStore.getState();
  const spec = readSelection(tuning.strings, identifySel, accidentalPref).readings[0]?.spec;
  if (!spec || validateChord(spec) !== null) return false;
  stopChordPlayback();
  const state = useStore.getState();
  state.setChordSpec(spec);
  state.setAdoptShape({ shape: identifyShape(), spec: useStore.getState().chordSpec });
  state.setMode('chord');
  return true;
}
