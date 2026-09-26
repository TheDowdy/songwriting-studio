import { audioEngine } from './engine';
import type { VoiceHandle } from './instrument';

/** One note of a sequence: what to play and what to show while it sounds. */
export interface SequenceStep {
  string: number;
  midi: number;
  fret: number;
  velocity?: number;
  /** 0–1: a brighter attack (upstrokes). */
  brightness?: number;
}

export interface SequenceHooks {
  /** Called as each note becomes audible (latency-compensated), in order. */
  onStep: (step: SequenceStep, index: number) => void;
  /** Called once when the last note has sounded or the sequence is stopped. */
  onEnd: () => void;
}

/** Notes are handed to the audio thread this far ahead, so timing doesn't depend on the JS timer. */
const LOOKAHEAD_SECONDS = 0.12;
const TIMER_MS = 25;
/** Time before the first note, so the audio graph has a moment to be ready. */
const START_DELAY_SECONDS = 0.12;

/**
 * Plays notes at fixed intervals on the audio clock and reports each one when it is actually
 * heard: sound is scheduled ahead on the AudioContext, while the callbacks are driven from
 * requestAnimationFrame against the same clock (minus output latency) so what is highlighted stays
 * in step with what is sounding.
 */
export class SequencePlayer {
  private timer = 0;
  private raf = 0;
  private active = false;
  private scheduled: { voice: VoiceHandle | null; when: number }[] = [];

  get playing(): boolean {
    return this.active;
  }

  start(steps: readonly SequenceStep[], intervalSeconds: number, hooks: SequenceHooks): void {
    this.stop(false);
    audioEngine.unlock();
    const ctx = audioEngine.context;
    if (!ctx || steps.length === 0) {
      hooks.onEnd();
      return;
    }
    this.active = true;
    const t0 = ctx.currentTime + START_DELAY_SECONDS;
    let nextToSound = 0;
    let nextToShow = 0;

    const schedule = () => {
      while (
        nextToSound < steps.length &&
        t0 + nextToSound * intervalSeconds < ctx.currentTime + LOOKAHEAD_SECONDS
      ) {
        const step = steps[nextToSound] as SequenceStep;
        const when = t0 + nextToSound * intervalSeconds;
        const voice = audioEngine.pluck(step.string, step.midi, {
          velocity: step.velocity ?? 0.75,
          ...(step.brightness !== undefined ? { brightness: step.brightness } : {}),
          when,
        });
        this.scheduled.push({ voice, when });
        nextToSound++;
      }
      // Only recent entries matter for cancelling.
      this.scheduled = this.scheduled.filter((s) => s.when > ctx.currentTime - 0.05);
    };

    const show = () => {
      // Heard time = clock minus the time it takes the audio to reach the speakers.
      const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
      while (nextToShow < steps.length && t0 + nextToShow * intervalSeconds <= heard) {
        hooks.onStep(steps[nextToShow] as SequenceStep, nextToShow);
        nextToShow++;
      }
      if (nextToShow >= steps.length && heard >= t0 + steps.length * intervalSeconds) {
        this.stop();
        return;
      }
      this.raf = requestAnimationFrame(show);
    };

    this.onEnd = hooks.onEnd;
    schedule();
    this.timer = window.setInterval(schedule, TIMER_MS);
    this.raf = requestAnimationFrame(show);
  }

  private onEnd: (() => void) | null = null;

  /** Stops scheduling and silences notes that were queued but haven't sounded yet. */
  stop(notify = true): void {
    const wasActive = this.active;
    this.active = false;
    window.clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    const now = audioEngine.context?.currentTime ?? 0;
    for (const { voice, when } of this.scheduled) {
      // Damp just after its pluck lands; notes already ringing are left to die away naturally.
      if (voice && when > now) audioEngine.damp(voice, when + 0.002);
    }
    this.scheduled = [];
    const end = this.onEnd;
    this.onEnd = null;
    if (wasActive && notify) end?.();
  }
}
