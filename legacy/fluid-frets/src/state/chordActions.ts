import { SequencePlayer } from '../audio/scheduler';
import { describeChord, type ChordInfo } from '../theory/chords';
import { directionShaping } from '../theory/strum';
import { pitchClass } from '../theory/notes';
import {
  bestVoicingIndex,
  bestVoicingWith,
  findVoicings,
  indexOfShape,
  shapeNotes,
  targetFromChord,
  type Voicing,
} from '../theory/voicings';
import { emitPluck } from './pluckEvents';
import { playFret } from './playing';
import { useStore } from './store';

export interface ChordContext {
  info: ChordInfo;
  voicings: Voicing[];
  /** Index of the best-scoring voicing, or -1. */
  best: number;
}

/** The chord in the store, described and searched for voicings on the current tuning. */
export function chordContext(): ChordContext {
  const { chordSpec, accidentalPref, tuning, fretCount, voicingRules } = useStore.getState();
  const info = describeChord(chordSpec, accidentalPref);
  const voicings = findVoicings(tuning.strings, fretCount, targetFromChord(info), voicingRules);
  return { info, voicings, best: bestVoicingIndex(voicings) };
}

/** Shows the best voicing (or nothing if the rules leave none). */
export function selectBestVoicing(): void {
  const { voicings, best } = chordContext();
  const v = voicings[best];
  useStore.getState().setChordShape(v ? v.frets.slice() : null, v ? best : null);
}

export function selectVoicing(index: number): void {
  const v = chordContext().voicings[index];
  if (v) useStore.getState().setChordShape(v.frets.slice(), index);
}

/** Steps through the position-sorted voicing list; wraps at either end. */
export function stepVoicing(delta: number): void {
  const { voicings, best } = chordContext();
  if (voicings.length === 0) return;
  const from = useStore.getState().voicingIndex ?? best;
  selectVoicing((((from + delta) % voicings.length) + voicings.length) % voicings.length);
}

const chordPlayer = new SequencePlayer();

export function stopChordPlayback(): void {
  chordPlayer.stop();
}

function playNotes(
  order: 'strum' | 'arpeggio',
  shape: readonly (number | null)[] | null,
  overrideDirection?: 'down' | 'up',
): void {
  const { chordPlay, tuning, setPlayhead } = useStore.getState();
  if (!shape) return;
  const direction = overrideDirection ?? chordPlay.direction;
  const notes = shapeNotes(tuning.strings, shape);
  if (direction === 'up') notes.reverse();
  const { gain, brightness } = directionShaping(direction);
  const interval = order === 'strum' ? chordPlay.speedMs / 1000 : ARPEGGIO_SECONDS;
  chordPlayer.start(
    notes.map((n) => ({
      ...n,
      velocity: (order === 'strum' ? 0.75 : 0.7) * gain,
      brightness,
    })),
    interval,
    {
      onStep: (step) => {
        setPlayhead({ string: step.string, fret: step.fret });
        emitPluck({ string: step.string, fret: step.fret, velocity: step.velocity ?? 0.7 });
      },
      onEnd: () => setPlayhead(null),
    },
  );
}

/** Time between notes of an arpeggio. */
const ARPEGGIO_SECONDS = 0.28;

/** Strums any fingering with the chosen direction and speed. Muted strings stay silent. */
export function strumFingering(
  shape: readonly (number | null)[] | null,
  direction?: 'down' | 'up',
): void {
  playNotes('strum', shape, direction);
}

/** Strums the chord's shown fingering. */
export function strumChord(direction?: 'down' | 'up'): void {
  playNotes('strum', useStore.getState().chordShape, direction);
}

/** Plays the chord's shown fingering one note at a time. */
export function arpeggiateChord(): void {
  playNotes('arpeggio', useStore.getState().chordShape);
}

/**
 * A tap on the neck while in chord mode (PLAN.md §11.4–5). Returns false when the tap isn't
 * about the chord shape (a note that isn't a chord tone), so it plays as an ordinary note.
 *
 *  - the open-string slot toggles the string between open and muted;
 *  - tapping the sounding note again mutes the string;
 *  - tapping a lit root selects the best voicing with that root there (unless editing);
 *  - tapping any other lit chord tone moves that string's note there.
 */
export function tapChordNote(string: number, fret: number): boolean {
  const state = useStore.getState();
  if (state.mode !== 'chord') return false;
  const { info, voicings } = chordContext();
  const open = state.tuning.strings[string];
  if (open === undefined) return false;
  const shape: (number | null)[] = (state.chordShape ?? []).slice();
  while (shape.length < state.tuning.strings.length) shape.push(null);

  const commit = (next: (number | null)[]) => {
    const index = indexOfShape(voicings, next);
    state.setChordShape(next, index >= 0 ? index : null);
  };

  if (fret === 0) {
    const next = shape.slice();
    next[string] = shape[string] === 0 ? null : 0;
    commit(next);
    if (next[string] === 0) playFret(string, 0);
    return true;
  }

  const pc = pitchClass(open + fret);
  if (!info.pcs.includes(pc)) return false;

  if (shape[string] === fret) {
    const next = shape.slice();
    next[string] = null;
    commit(next);
    return true;
  }

  if (pc === info.spec.rootPc && !state.editingShape) {
    const i = bestVoicingWith(voicings, string, fret);
    const v = voicings[i];
    if (v) {
      state.setChordShape(v.frets.slice(), i);
      strumChord();
      return true;
    }
  }

  const next = shape.slice();
  next[string] = fret;
  commit(next);
  playFret(string, fret);
  return true;
}
