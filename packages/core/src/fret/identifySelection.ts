/**
 * The notes picked in Identify mode (PLAN.md §12): at most one per string, with each string
 * either unused, open, muted or fretted. Pure, so the rules are unit tested.
 */
import { identifyChord, spellSounding, type Identified, type SoundingNote } from './identify';
import type { AccidentalPref } from './notes';

/** A fret (0 = open string), 'x' = muted, or null = unused. */
export type IdentifyCell = number | 'x' | null;

export function emptySelection(strings = 6): IdentifyCell[] {
  return new Array<IdentifyCell>(strings).fill(null);
}

/**
 * The toggle behind the nut cycles unused → open (○) → muted (✕) → unused. A string holding a
 * fretted note goes straight to open.
 */
export function cycleOpen(selection: readonly IdentifyCell[], string: number): IdentifyCell[] {
  const next = selection.slice();
  const cell = selection[string];
  next[string] = cell === null ? 0 : cell === 0 ? 'x' : cell === 'x' ? null : 0;
  return next;
}

/**
 * Tapping a fret: picks it, moves the string's pick to it, or (tapping the picked fret again)
 * clears it. Fret 0 is the toggle behind the nut.
 */
export function tapSelection(
  selection: readonly IdentifyCell[],
  string: number,
  fret: number,
): IdentifyCell[] {
  if (fret === 0) return cycleOpen(selection, string);
  const next = selection.slice();
  next[string] = selection[string] === fret ? null : fret;
  return next;
}

/** As a fingering: muted and unused strings are null (silent). */
export function selectionToShape(selection: readonly IdentifyCell[]): (number | null)[] {
  return selection.map((c) => (typeof c === 'number' ? c : null));
}

/** Selection from a fingering, e.g. when loading a voicing. */
export function shapeToSelection(shape: readonly (number | null)[]): IdentifyCell[] {
  return shape.map((f) => (f === null ? 'x' : f));
}

export function isEmpty(selection: readonly IdentifyCell[]): boolean {
  return selection.every((c) => typeof c !== 'number');
}

export interface SelectionReading {
  /** Sounding notes, lowest first, spelled for the best reading. */
  notes: SoundingNote[];
  /** Best reading first, then alternatives. Empty when nothing sounds or nothing fits. */
  readings: Identified[];
}

/** Names the chord made by the picked notes on `tuning` (open-string MIDI notes). */
export function readSelection(
  tuning: readonly number[],
  selection: readonly IdentifyCell[],
  pref: AccidentalPref = 'sharp',
): SelectionReading {
  const midis: number[] = [];
  selection.forEach((cell, string) => {
    const open = tuning[string];
    if (typeof cell === 'number' && open !== undefined) midis.push(open + cell);
  });
  const readings = identifyChord(midis, pref);
  return { notes: spellSounding(midis, readings[0], pref), readings };
}
