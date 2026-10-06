import { audioEngine } from './engine';
import type { VoiceHandle } from './instrument';

/** One strum of the progression: when it starts (seconds into the range), and its notes low → high. */
export interface ProgressionStrike {
  atSeconds: number;
  eventId: string;
  notes: readonly { string: number; fret: number; midi: number }[];
  velocity: number;
}

/** The start of one beat of a chord (seconds into the range), for the strip's moving beat. */
export interface BeatMark {
  atSeconds: number;
  eventId: string;
  /** 0-based beat within the chord. */
  beat: number;
}

export interface ProgressionHooks {
  /** Called as each chord becomes audible (latency-compensated) — the neck then shows it. */
  onChord: (eventId: string) => void;
  /** Called as each note of a strum is heard, for the string animation. */
  onNote: (note: { string: number; fret: number; velocity: number }) => void;
  /** Called as each beat of a chord is heard (see `BeatMark`). */
  onBeat?: (eventId: string, beat: number) => void;
  /** Called once when a non-looping range has finished, or playback is stopped. */
  onEnd: () => void;
}

/** Sound is handed to the audio thread this far ahead, so timing never depends on the JS timer. */
const LOOKAHEAD_SECONDS = 0.15;
const TIMER_MS = 25;
const START_DELAY_SECONDS = 0.12;

/**
 * Plays a progression through the guitar synth (Phase 6 item 2) the way `SequencePlayer` plays a
 * single strum: notes are scheduled ahead on the AudioContext clock, while the callbacks run from
 * requestAnimationFrame against the same clock minus output latency, so the chord the neck shows
 * is the one you hear. A looping range repeats every `lengthSeconds`.
 */
export class ProgressionPlayer {
  private timer = 0;
  private raf = 0;
  private active = false;
  private scheduled: { voice: VoiceHandle | null; when: number }[] = [];
  private onEnd: (() => void) | null = null;

  get playing(): boolean {
    return this.active;
  }

  start(
    strikes: readonly ProgressionStrike[],
    lengthSeconds: number,
    strumSeconds: number,
    loop: boolean,
    hooks: ProgressionHooks,
    beatMarks: readonly BeatMark[] = [],
  ): void {
    this.stop(false);
    audioEngine.unlock();
    const ctx = audioEngine.context;
    if (!ctx || strikes.length === 0 || lengthSeconds <= 0) {
      hooks.onEnd();
      return;
    }
    this.active = true;
    this.onEnd = hooks.onEnd;
    const t0 = ctx.currentTime + START_DELAY_SECONDS;
    // Position in an endless stream of strikes: pass `cycle` of strike `index`.
    let soundCycle = 0;
    let soundIndex = 0;
    let showCycle = 0;
    let showIndex = 0;
    let lastChord: string | null = null;
    let beatCycle = 0;
    let beatIndex = 0;
    // Notes waiting to be shown as heard, in order.
    const pendingNotes: { at: number; string: number; fret: number; velocity: number }[] = [];
    const strikeTime = (cycle: number, index: number) =>
      t0 + cycle * lengthSeconds + (strikes[index] as ProgressionStrike).atSeconds;

    const schedule = () => {
      for (;;) {
        if (soundIndex >= strikes.length) {
          if (!loop) break;
          soundIndex = 0;
          soundCycle++;
        }
        const when = strikeTime(soundCycle, soundIndex);
        if (when >= ctx.currentTime + LOOKAHEAD_SECONDS) break;
        const strike = strikes[soundIndex] as ProgressionStrike;
        strike.notes.forEach((n, i) => {
          const at = when + i * strumSeconds;
          const voice = audioEngine.pluck(n.string, n.midi, { velocity: strike.velocity, when: at });
          this.scheduled.push({ voice, when: at });
          pendingNotes.push({ at, string: n.string, fret: n.fret, velocity: strike.velocity });
        });
        soundIndex++;
      }
      this.scheduled = this.scheduled.filter((s) => s.when > ctx.currentTime - 0.05);
    };

    const show = () => {
      const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
      for (;;) {
        if (showIndex >= strikes.length) {
          if (!loop) break;
          showIndex = 0;
          showCycle++;
        }
        if (strikeTime(showCycle, showIndex) > heard) break;
        const id = (strikes[showIndex] as ProgressionStrike).eventId;
        if (id !== lastChord) {
          lastChord = id;
          hooks.onChord(id);
        }
        showIndex++;
      }
      for (;;) {
        if (beatIndex >= beatMarks.length) {
          if (!loop || beatMarks.length === 0) break;
          beatIndex = 0;
          beatCycle++;
        }
        const mark = beatMarks[beatIndex] as BeatMark;
        if (t0 + beatCycle * lengthSeconds + mark.atSeconds > heard) break;
        hooks.onBeat?.(mark.eventId, mark.beat);
        beatIndex++;
      }
      while (pendingNotes.length > 0 && (pendingNotes[0] as { at: number }).at <= heard) {
        const n = pendingNotes.shift() as { string: number; fret: number; velocity: number };
        hooks.onNote(n);
      }
      if (!loop && showIndex >= strikes.length && heard >= t0 + lengthSeconds) {
        this.stop();
        return;
      }
      this.raf = requestAnimationFrame(show);
    };

    schedule();
    this.timer = window.setInterval(schedule, TIMER_MS);
    this.raf = requestAnimationFrame(show);
  }

  /** Stops scheduling and silences notes queued but not yet sounded. */
  stop(notify = true): void {
    const wasActive = this.active;
    this.active = false;
    window.clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    const now = audioEngine.context?.currentTime ?? 0;
    for (const { voice, when } of this.scheduled) {
      if (voice && when > now) audioEngine.damp(voice, when + 0.002);
    }
    this.scheduled = [];
    const end = this.onEnd;
    this.onEnd = null;
    if (wasActive && notify) end?.();
  }
}
