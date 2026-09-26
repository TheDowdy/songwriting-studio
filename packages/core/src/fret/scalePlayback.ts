/**
 * Plans the fingering of a scale run (PLAN.md §10, "Scale playback"). Pure: turns a tuning, a
 * scale, and the playback settings into the ordered string/fret positions to sound.
 */
import { pitchClass } from './notes';
import type { PlaybackDirection, PlaybackRange } from './scaleSettings';

/** Frets in the hand window: a comfortable four-fret stretch. */
export const WINDOW_FRETS = 5;

export interface PlaybackNote {
  /** 0 = lowest string. */
  string: number;
  fret: number;
  midi: number;
  /** The scale's tonic (played a little louder). */
  tonic: boolean;
}

export interface PlanOptions {
  tuning: readonly number[];
  fretCount: number;
  rootPc: number;
  /** Semitones above the tonic. */
  intervals: readonly number[];
  range: PlaybackRange;
  direction: PlaybackDirection;
  /** First fret of the hand window, or 'auto' to find the position that needs no stretching. */
  position: 'auto' | number;
}

/** First frets that make a valid window, i.e. `position` choices for the UI. */
export function positionStarts(fretCount: number): number[] {
  return Array.from({ length: Math.max(1, fretCount - WINDOW_FRETS + 2) }, (_, i) => i);
}

const windowEnd = (lo: number) => lo + WINDOW_FRETS - 1;

/** Fret 0 counts as inside a window that starts at fret 1 or lower (open strings in first position). */
function inWindow(fret: number, lo: number): boolean {
  return (fret >= lo && fret <= windowEnd(lo)) || (fret === 0 && lo <= 1);
}

function distanceToWindow(fret: number, lo: number): number {
  if (inWindow(fret, lo)) return 0;
  return fret < lo ? lo - fret : fret - windowEnd(lo);
}

interface Assignment {
  notes: PlaybackNote[];
  /** Notes that had to be played outside the window. */
  outside: number;
  /** Notes that can't be played anywhere on the neck. */
  missing: number;
}

/**
 * Ascending pitches → positions. Each note takes the lowest string that keeps it inside the
 * window; if none does, the nearest position on the neck. With `follow`, the window then moves to
 * that position (used for the whole neck), otherwise it stays put.
 */
function assign(
  pitches: readonly number[],
  o: PlanOptions,
  startLo: number,
  follow: boolean,
): Assignment {
  const maxLo = Math.max(0, o.fretCount - WINDOW_FRETS + 1);
  let lo = Math.min(startLo, maxLo);
  const notes: PlaybackNote[] = [];
  let outside = 0;
  let missing = 0;
  for (const midi of pitches) {
    const candidates = o.tuning
      .map((open, string) => ({ string, fret: midi - open }))
      .filter((c) => c.fret >= 0 && c.fret <= o.fretCount);
    if (candidates.length === 0) {
      missing++;
      continue;
    }
    // Candidates are in string order, so the first minimum is the lowest string.
    let best = candidates[0] as (typeof candidates)[number];
    for (const c of candidates) {
      if (distanceToWindow(c.fret, lo) < distanceToWindow(best.fret, lo)) best = c;
    }
    if (!inWindow(best.fret, lo)) {
      outside++;
      if (follow) lo = Math.min(Math.max(best.fret, 1), maxLo);
    }
    notes.push({
      string: best.string,
      fret: best.fret,
      midi,
      tonic: pitchClass(midi) === o.rootPc,
    });
  }
  return { notes, outside, missing };
}

/** Scale pitches in [from, to], ascending. */
function scalePitches(o: PlanOptions, from: number, to: number): number[] {
  const pcs = new Set(o.intervals.map((i) => pitchClass(o.rootPc + i)));
  const out: number[] = [];
  for (let midi = from; midi <= to; midi++) if (pcs.has(pitchClass(midi))) out.push(midi);
  return out;
}

/** Lowest tonic that can be fingered inside the window (or the lowest on the neck). */
function startTonic(o: PlanOptions, lo: number): number | null {
  const lowest = Math.min(...o.tuning);
  const highest = Math.max(...o.tuning) + o.fretCount;
  let fallback: number | null = null;
  for (let midi = lowest; midi <= highest; midi++) {
    if (pitchClass(midi) !== o.rootPc) continue;
    fallback ??= midi;
    if (o.tuning.some((open) => midi - open >= 0 && inWindow(midi - open, lo))) return midi;
  }
  return fallback;
}

function ascending(o: PlanOptions, lo: number): Assignment {
  if (o.range === 'neck') {
    const lowest = Math.min(...o.tuning);
    const highest = Math.max(...o.tuning) + o.fretCount;
    return assign(scalePitches(o, lowest, highest), o, 0, true);
  }
  const start = startTonic(o, lo);
  if (start === null) return { notes: [], outside: 0, missing: 0 };
  const octaves = o.range === 'octave' ? 1 : 2;
  return assign(scalePitches(o, start, start + 12 * octaves), o, lo, false);
}

/** Auto: the window that needs the fewest notes played outside it, lowest on the neck on a tie. */
function bestWindow(o: PlanOptions): number {
  let best = 0;
  let bestCost = Infinity;
  for (const lo of positionStarts(o.fretCount)) {
    const a = ascending(o, lo);
    const cost = a.outside + a.missing * 10;
    if (cost < bestCost) {
      best = lo;
      bestCost = cost;
    }
  }
  return best;
}

/** The notes to sound, in order, for the chosen range, position and direction. */
export function planScale(o: PlanOptions): PlaybackNote[] {
  const lo = o.position === 'auto' ? bestWindow(o) : o.position;
  const up = ascending(o, lo).notes;
  if (o.direction === 'up') return up;
  const down = [...up].reverse();
  // Up-and-down doesn't repeat the top note.
  return o.direction === 'down' ? down : [...up, ...down.slice(1)];
}
