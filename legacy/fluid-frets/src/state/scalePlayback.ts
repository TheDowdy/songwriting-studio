import { SequencePlayer } from '../audio/scheduler';
import { getScale } from '../theory/scales';
import { planScale } from '../theory/scalePlayback';
import { emitPluck } from './pluckEvents';
import { useStore } from './store';

const player = new SequencePlayer();

/** Notes are eighth notes: two per beat. */
export function noteIntervalSeconds(tempo: number): number {
  return 30 / tempo;
}

export function stopScale(): void {
  player.stop();
}

/** Plays the current scale with the current playback settings, highlighting each note as it sounds. */
export function playScale(): void {
  const { tuning, fretCount, scaleSettings, playback, setPlayhead, setPlaying } =
    useStore.getState();
  const notes = planScale({
    tuning: tuning.strings,
    fretCount,
    rootPc: scaleSettings.rootPc,
    intervals: getScale(scaleSettings.scaleId).intervals,
    range: playback.range,
    direction: playback.direction,
    position: playback.position,
  });
  setPlaying(true);
  player.start(
    notes.map((n) => ({ ...n, velocity: n.tonic ? 0.9 : 0.72 })),
    noteIntervalSeconds(playback.tempo),
    {
      onStep: (step) => {
        setPlayhead({ string: step.string, fret: step.fret });
        emitPluck({ string: step.string, fret: step.fret, velocity: step.velocity ?? 0.75 });
      },
      onEnd: () => {
        setPlayhead(null);
        setPlaying(false);
      },
    },
  );
}
