/**
 * Pure strum-gesture logic (PLAN.md §7): no React, no audio, no DOM. Points are in client pixels
 * so the tap/strum threshold and drag speed mean the same thing on every screen size.
 */

/** Pointer movement below this many pixels is a tap; anything more is a strum/drag. */
export const TAP_THRESHOLD_PX = 8;

/** Drag speeds (px/s) mapped to the softest and hardest strums. */
const SLOW_SPEED = 150;
const FAST_SPEED = 2200;

export interface Point {
  x: number;
  y: number;
}

export type StrumDirection = 'down' | 'up';

/**
 * A downstroke crosses the lowest string first and sounds strings low → high (string 6 is drawn at
 * the bottom, so this is a drag up the screen); an upstroke is the reverse (§7).
 */
export function strokeDirection(firstString: number, secondString: number): StrumDirection {
  return secondString > firstString ? 'down' : 'up';
}

/**
 * Strings whose line the segment prev → next crosses, in the order they're crossed, each with the
 * fraction `t` (0–1) of the segment at which it happens. `ys[i]` is the y of string i. A string is
 * crossed when the segment ends on or beyond it having started on the other side, so a pointer
 * resting exactly on a string doesn't fire it twice.
 */
export function crossedStrings(
  prevY: number,
  nextY: number,
  ys: readonly number[],
): { string: number; t: number }[] {
  if (prevY === nextY) return [];
  const hits: { string: number; t: number }[] = [];
  ys.forEach((y, string) => {
    const crossed = (prevY < y && nextY >= y) || (prevY > y && nextY <= y);
    if (crossed) hits.push({ string, t: (y - prevY) / (nextY - prevY) });
  });
  return hits.sort((a, b) => a.t - b.t);
}

/** Strum velocity (0.25–1) from drag speed in px/s, eased so ordinary strums sit mid-range. */
export function strumVelocity(speedPxPerSec: number): number {
  const t = Math.min(1, Math.max(0, (speedPxPerSec - SLOW_SPEED) / (FAST_SPEED - SLOW_SPEED)));
  return 0.25 + 0.75 * Math.sqrt(t);
}

/** Upstrokes are a little lighter and brighter than downstrokes (§0). */
export function directionShaping(direction: StrumDirection): { gain: number; brightness: number } {
  return direction === 'up' ? { gain: 0.85, brightness: 0.6 } : { gain: 1, brightness: 0 };
}

export interface StrumHit {
  string: number;
  /** 0–1 before direction shaping. */
  velocity: number;
  direction: StrumDirection;
  /**
   * Milliseconds after the first string crossed in the same pointer sample. A fast drag can cross
   * several strings between two samples; this spreads them out as they really were.
   */
  offsetMs: number;
}

/** How many recent samples are averaged for the drag speed. */
const SPEED_WINDOW_MS = 60;

/**
 * Follows one pointer from press to release. Feed it `move`s; it reports each string the pointer
 * crosses (once the drag has passed the tap threshold) with a velocity taken from the recent drag
 * speed, and tells you on `end` whether the gesture was a plain tap.
 */
export class StrumTracker {
  private last: Point;
  private samples: { x: number; y: number; t: number }[];
  private dragging = false;
  private crossings: number[] = [];

  /** `ys` are the string lines in client pixels, indexed by string (0 = lowest). */
  constructor(
    private readonly origin: Point,
    startTime: number,
    private readonly ys: readonly number[],
  ) {
    this.last = origin;
    this.samples = [{ ...origin, t: startTime }];
  }

  /** True once the pointer has moved far enough that this is no longer a tap. */
  get isDrag(): boolean {
    return this.dragging;
  }

  /** Distinct strings crossed so far, in order. Two or more make it a strum. */
  get crossedCount(): number {
    return this.crossings.length;
  }

  /** Recent drag speed in px/s. */
  speed(): number {
    const first = this.samples[0];
    const end = this.samples[this.samples.length - 1];
    if (!first || !end || end.t <= first.t) return 0;
    return (Math.hypot(end.x - first.x, end.y - first.y) / (end.t - first.t)) * 1000;
  }

  move(point: Point, time: number): StrumHit[] {
    this.samples.push({ ...point, t: time });
    while (
      this.samples.length > 2 &&
      time - (this.samples[0] as { t: number }).t > SPEED_WINDOW_MS
    ) {
      this.samples.shift();
    }
    if (!this.dragging) {
      if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) < TAP_THRESHOLD_PX) {
        this.last = point;
        return [];
      }
      this.dragging = true;
      // The strings between the press point and here were crossed on the way to the threshold.
      this.last = this.origin;
    }
    const from = this.last;
    const crossed = crossedStrings(from.y, point.y, this.ys);
    this.last = point;
    const first = crossed[0];
    if (!first) return [];
    const velocity = strumVelocity(this.speed());
    const previousTime = (this.samples[this.samples.length - 2] as { t: number }).t;
    const segmentMs = Math.max(0, time - previousTime);
    const hits: StrumHit[] = [];
    for (const { string, t } of crossed) {
      const previous = this.crossings[this.crossings.length - 1];
      this.crossings.push(string);
      // Direction is known from the second string on; before that assume it from the drag itself.
      const direction: StrumDirection =
        previous !== undefined
          ? strokeDirection(previous, string)
          : point.y < this.origin.y
            ? 'down'
            : 'up';
      hits.push({ string, velocity, direction, offsetMs: (t - first.t) * segmentMs });
    }
    return hits;
  }

  /** True if the gesture never left the tap threshold. */
  isTap(): boolean {
    return !this.dragging;
  }
}

/**
 * What each string sounds when strummed: the shape's fretted notes (null = muted, so silent) or,
 * with no shape, the open strings (§0, §7).
 */
export function strumNotes(
  tuningStrings: readonly number[],
  frets: readonly (number | null)[] | null,
): ({ midi: number; fret: number } | null)[] {
  return tuningStrings.map((open, string) => {
    if (!frets) return { midi: open, fret: 0 };
    const fret = frets[string];
    return fret === null || fret === undefined ? null : { midi: open + fret, fret };
  });
}
