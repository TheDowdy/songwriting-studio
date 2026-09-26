import { tapChordNote } from './chordActions';
import { tapIdentifyNote } from './identifyActions';
import { playFret } from './playing';
import { useStore } from './store';

/**
 * A tap on a fret position (the open-note slot behind the nut is fret 0). In chord mode it edits
 * the shape, in Identify mode it picks the note; otherwise, or when the mode has no use for the
 * tap, it just plays the note.
 */
export function tapFret(string: number, fret: number): void {
  const { mode } = useStore.getState();
  const handled =
    mode === 'chord'
      ? tapChordNote(string, fret)
      : mode === 'identify'
        ? tapIdentifyNote(string, fret)
        : false;
  if (!handled) playFret(string, fret);
}
