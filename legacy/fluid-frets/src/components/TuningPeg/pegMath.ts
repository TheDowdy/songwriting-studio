import { stringRange } from '../../theory/tunings';

/** Screen pixels of vertical drag per semitone (§5). */
export const PX_PER_SEMITONE = 24;
/** How far past a limit the pitch may stretch (semitones) before the rubber band is fully taut. */
export const MAX_OVERSHOOT = 0.5;

/**
 * The range a peg may move within. It is the string's normal range, widened to include where it
 * currently is: presets (e.g. Nashville) bypass the limits, and grabbing such a peg must not
 * make it jump back inside.
 */
export function pegRange(
  stringIndex: number,
  currentMidi: number,
  unlimited: boolean,
): [min: number, max: number] {
  const [min, max] = stringRange(stringIndex, unlimited);
  return [Math.min(min, Math.round(currentMidi)), Math.max(max, Math.round(currentMidi))];
}

/**
 * Rubber-band: inside [min, max] the value passes through; beyond it, movement is progressively
 * resisted and never exceeds MAX_OVERSHOOT past the limit.
 */
export function rubberBand(value: number, min: number, max: number): number {
  if (value > max) return max + MAX_OVERSHOOT * Math.tanh((value - max) / MAX_OVERSHOOT);
  if (value < min) return min - MAX_OVERSHOOT * Math.tanh((min - value) / MAX_OVERSHOOT);
  return value;
}

/** Pitch for a drag of `dyPixels` (positive = up = raises pitch) from `startMidi`. */
export function dragPitch(
  startMidi: number,
  dyPixels: number,
  range: readonly [number, number],
): number {
  return rubberBand(startMidi + dyPixels / PX_PER_SEMITONE, range[0], range[1]);
}

/** Where a released peg settles: the nearest semitone inside the range. */
export function snapPitch(pitch: number, range: readonly [number, number]): number {
  return Math.min(range[1], Math.max(range[0], Math.round(pitch)));
}

/** Accumulates wheel/trackpad deltas and yields whole semitone steps (one per notch). */
export class WheelStepper {
  private accumulated = 0;
  private lastTime = -Infinity;

  constructor(
    private readonly threshold = 50,
    private readonly idleMs = 250,
  ) {}

  /** Returns +1 (up), −1 (down) or 0. Scrolling *up* (negative deltaY) raises the pitch. */
  feed(deltaY: number, now: number): 1 | -1 | 0 {
    if (now - this.lastTime > this.idleMs) this.accumulated = 0;
    this.lastTime = now;
    this.accumulated += deltaY;
    if (this.accumulated <= -this.threshold) {
      this.accumulated = 0;
      return 1;
    }
    if (this.accumulated >= this.threshold) {
      this.accumulated = 0;
      return -1;
    }
    return 0;
  }
}

/** Normalises wheel deltas to pixels (lines and pages are common in Firefox / some mice). */
export function wheelDeltaPixels(e: { deltaY: number; deltaMode: number }): number {
  return e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
}
