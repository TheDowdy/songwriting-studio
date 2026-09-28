import { SequencePlayer } from '../audio/scheduler';
import { capoedFretCount, capoedTuning } from '@sw/core/fret/capo';
import { describeChord, type ChordInfo } from '@sw/core/fret/chords';
import { directionShaping } from '@sw/core/fret/strum';
import { pitchClass } from '@sw/core/fret/notes';
import {
  bestVoicingIndex,
  bestVoicingWith,
  findVoicings,
  indexOfShape,
  shapeNotes,
  targetFromChord,
  type Voicing,
  type VoicingTarget,
} from '@sw/core/fret/voicings';
import { bassPcForMode } from './bassMode';
import { emitPluck } from './pluckEvents';
import { playFret } from './playing';
import { useStore } from './store';

export interface ChordContext {
  info: ChordInfo;
  voicings: Voicing[];
  /** Index of the best-scoring voicing, or -1. */
  best: number;
}

/**
 * The chord in the store, described and searched for voicings on the current tuning. With a capo
 * (§7 Phase 3 item 4) the search runs on `tuning + capo` over `fretCount − capo` frets, so every
 * returned shape's frets are relative to the capo (0 = capo/open), matching the diagrams.
 *
 * In song context, the bass/inversion control (Phase 4 item 3) narrows this further: its chosen
 * pitch class (or no restriction at all, for "Any bass") replaces whatever slash bass the chord
 * itself might already have, so root taps, Prev/Next and the voicing list all only ever show
 * shapes the control currently allows.
 */
export function chordContext(): ChordContext {
  const { chordSpec, accidentalPref, tuning, fretCount, voicingRules, capo, songId, progressionChord, bassMode } =
    useStore.getState();
  const info = describeChord(chordSpec, accidentalPref);
  const target: VoicingTarget = targetFromChord(info);
  const effectiveTarget: VoicingTarget =
    songId && progressionChord ? { ...target, bassPc: bassPcForMode(progressionChord, bassMode) } : target;
  const voicings = findVoicings(
    capoedTuning(tuning.strings, capo),
    capoedFretCount(fretCount, capo),
    effectiveTarget,
    voicingRules,
  );
  return { info, voicings, best: bestVoicingIndex(voicings) };
}

/**
 * Options shared by every action below that changes the selected voicing. `play`, set only by a
 * direct user gesture (owner request, §7 Phase 3 change 2) — clicking a progression block, Prev/
 * Next, a voicing in the list, or "Best voicing" — sounds the newly selected shape exactly as the
 * Play button would (same strum direction/speed/sound/capo, via `strumChord`). Left off (the
 * default) for every programmatic call, e.g. `useChordSelection`'s effect re-picking the best
 * voicing whenever the chord/tuning/capo/rules change, so nothing plays on page load or when the
 * song/chord changes elsewhere.
 */
export interface SelectVoicingOptions {
  play?: boolean;
}

/** Shows the best voicing (or nothing if the rules leave none). */
export function selectBestVoicing(opts?: SelectVoicingOptions): void {
  const { voicings, best } = chordContext();
  const v = voicings[best];
  useStore.getState().setChordShape(v ? v.frets.slice() : null, v ? best : null);
  if (opts?.play && v) strumChord();
}

export function selectVoicing(index: number, opts?: SelectVoicingOptions): void {
  const v = chordContext().voicings[index];
  if (!v) return;
  useStore.getState().setChordShape(v.frets.slice(), index);
  if (opts?.play) strumChord();
}

/** Steps through the position-sorted voicing list; wraps at either end. */
export function stepVoicing(delta: number, opts?: SelectVoicingOptions): void {
  const { voicings, best } = chordContext();
  if (voicings.length === 0) return;
  const from = useStore.getState().voicingIndex ?? best;
  selectVoicing(
    (((from + delta) % voicings.length) + voicings.length) % voicings.length,
    opts,
  );
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
  const { chordPlay, tuning, capo, setPlayhead } = useStore.getState();
  if (!shape) return;
  const direction = overrideDirection ?? chordPlay.direction;
  // `shape`'s frets are relative to the capo (0 = capo/open), so the capo'd tuning gets back to
  // the real sounding pitch (§7 Phase 3 items 4–5).
  const notes = shapeNotes(capoedTuning(tuning.strings, capo), shape);
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
 * A tap on the neck while in chord mode (PLAN.md §11.4–5). `fret` is the physical fret tapped
 * (what `data-fret` on the neck shows). Returns false when the tap isn't about the chord shape (a
 * note that isn't a chord tone, or one behind the capo — nothing can be fretted there), so it
 * plays as an ordinary note.
 *
 *  - the capo/open slot toggles the string between open and muted;
 *  - tapping the sounding note again mutes the string;
 *  - tapping a lit root selects the best voicing with that root there (unless editing);
 *  - tapping any other lit chord tone moves that string's note there.
 *
 * The stored shape's frets are relative to the capo (0 = capo/open, §7 Phase 3 item 4), matching
 * what `chordContext`'s voicing search returns, so every physical fret is translated to/from that
 * before it's read from or written into `chordShape`.
 */
export function tapChordNote(string: number, fret: number): boolean {
  const state = useStore.getState();
  if (state.mode !== 'chord') return false;
  const { capo } = state;
  if (fret < capo) return false; // behind the capo: nothing to fret there
  const relFret = fret - capo;
  const { info, voicings } = chordContext();
  const open = state.tuning.strings[string];
  if (open === undefined) return false;
  const shape: (number | null)[] = (state.chordShape ?? []).slice();
  while (shape.length < state.tuning.strings.length) shape.push(null);

  const commit = (next: (number | null)[]) => {
    const index = indexOfShape(voicings, next);
    state.setChordShape(next, index >= 0 ? index : null);
  };

  if (relFret === 0) {
    const next = shape.slice();
    next[string] = shape[string] === 0 ? null : 0;
    commit(next);
    if (next[string] === 0) playFret(string, fret);
    return true;
  }

  const pc = pitchClass(open + fret);
  if (!info.pcs.includes(pc)) return false;

  if (shape[string] === relFret) {
    const next = shape.slice();
    next[string] = null;
    commit(next);
    return true;
  }

  if (pc === info.spec.rootPc && !state.editingShape) {
    const i = bestVoicingWith(voicings, string, relFret);
    const v = voicings[i];
    if (v) {
      state.setChordShape(v.frets.slice(), i);
      strumChord();
      return true;
    }
  }

  const next = shape.slice();
  next[string] = relFret;
  commit(next);
  playFret(string, fret);
  return true;
}
