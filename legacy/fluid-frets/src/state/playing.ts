import { audioEngine } from '../audio/engine';
import { directionShaping, strumNotes, type StrumHit } from '../theory/strum';
import { emitPluck } from './pluckEvents';
import { useStore } from './store';

/** Plucks the note at a fret (0 = open) of a string and announces it to the visual feedback. */
export function playFret(string: number, fret: number, velocity = 0.8): void {
  const open = useStore.getState().tuning.strings[string];
  if (open === undefined) return;
  audioEngine.pluck(string, open + fret, { velocity });
  emitPluck({ string, fret, velocity });
}

/**
 * Sounds one string of a strum the instant the pointer crosses it. What it plays is the active
 * shape's fretted note, or the open string when there is no shape; a muted string is silent.
 */
export function playStrumHit({ string, velocity, direction, offsetMs }: StrumHit): void {
  const { tuning, strumShape } = useStore.getState();
  const note = strumNotes(tuning.strings, strumShape)[string];
  if (!note) return;
  const { gain, brightness } = directionShaping(direction);
  const v = Math.min(1, velocity * gain);
  const when = (audioEngine.context?.currentTime ?? 0) + offsetMs / 1000;
  audioEngine.pluck(string, note.midi, { velocity: v, brightness, when });
  emitPluck({ string, fret: note.fret, velocity: v });
}
