/**
 * Guitar voicing generators for a section variant (Phase 8 item 2): a shape for every chord in a
 * section, chosen together by a smoothest-path search over each chord's best candidates, so the
 * whole section reads as one deliberate choice — "up the neck", "open position", and so on —
 * rather than each chord's own independent best shape.
 */
import { toChordSpec } from './convert';
import { capoedFretCount, capoedTuning } from './fret/capo';
import { describeChord } from './fret/chords';
import { findVoicings, shapeDistance, smoothestChoice, targetFromChord, type Voicing } from './fret/voicings';
import type { ChordRef } from './theory/types';

/** Frets on the default neck (the guitar module's own default) — the window a candidate search
 *  covers; a generator's own window (e.g. "up the neck from 12") is a further restriction on top. */
const DEFAULT_FRET_COUNT = 22;
/** Candidates considered per chord (PLAN.md's "top-K, K≈40"). */
const MAX_CANDIDATES = 40;

export type VariantGeneratorId = 'up-the-neck' | 'open-position' | 'smoothest' | 'stay-in-position';

export interface VariantWindow {
  readonly start: number;
  readonly end: number;
}

export interface VariantOptions {
  /** 'up-the-neck': the window's lowest fret (default 5). */
  fromFret?: number;
  /** 'stay-in-position': the 5-fret window the user picked (default frets 0–4). */
  window?: VariantWindow;
}

export const VARIANT_GENERATORS: readonly { id: VariantGeneratorId; label: string }[] = [
  { id: 'up-the-neck', label: 'Up the neck' },
  { id: 'open-position', label: 'Open position' },
  { id: 'smoothest', label: 'Smoothest movement' },
  { id: 'stay-in-position', label: 'Stay in one position' },
];

function windowFor(generator: VariantGeneratorId, options: VariantOptions): VariantWindow | null {
  switch (generator) {
    case 'up-the-neck': {
      const from = Math.max(0, Math.round(options.fromFret ?? 5));
      return { start: from, end: from + 4 };
    }
    case 'open-position':
      return { start: 0, end: 3 };
    case 'stay-in-position':
      return options.window ?? { start: 0, end: 4 };
    case 'smoothest':
      return null;
  }
}

/** How much a candidate's own position and its movement from the chord before count, per
 *  generator — a window is enforced by weighing it heavily, not by excluding candidates outright,
 *  so a chord with nothing inside the window still gets its closest shape rather than none. */
const GENERATOR_WEIGHTS: Record<VariantGeneratorId, { movement: number; window: number }> = {
  'up-the-neck': { movement: 0.5, window: 6 },
  'open-position': { movement: 0.5, window: 6 },
  smoothest: { movement: 2, window: 0 },
  'stay-in-position': { movement: 0.3, window: 10 },
};

/** How far a shape sits outside the window, counting both ends — a shape whose stretch carries it
 *  past `window.end` is penalised even when its lowest fret (`position`) is inside. */
function windowPenalty(position: number, stretch: number, window: VariantWindow | null, weight: number): number {
  if (!window) return 0;
  const below = Math.max(0, window.start - position);
  const above = Math.max(0, position + stretch - window.end);
  return weight * (below + above);
}

/** The label a generator's result gets, e.g. "Up the neck (5+)", "Stay in one position (3–7)". */
export function variantLabelFor(generator: VariantGeneratorId, options: VariantOptions = {}): string {
  switch (generator) {
    case 'up-the-neck':
      return `Up the neck (${Math.max(0, Math.round(options.fromFret ?? 5))}+)`;
    case 'open-position':
      return 'Open position';
    case 'smoothest':
      return 'Smoothest movement';
    case 'stay-in-position': {
      const w = options.window ?? { start: 0, end: 4 };
      return `Stay in one position (${w.start}–${w.end})`;
    }
  }
}

/**
 * A shape for each of `chords`, in order, chosen together: each chord's best-scoring
 * `MAX_CANDIDATES` shapes, picked by `smoothestChoice` weighing a candidate's own score, its
 * distance from the generator's window (if it has one), and hand movement from the chord before.
 * Null for a chord with no playable shape at all.
 */
export function generateVariantShapes(
  chords: readonly ChordRef[],
  tuning: readonly number[],
  capo: number,
  generator: VariantGeneratorId,
  options: VariantOptions = {},
): (Voicing | null)[] {
  const window = windowFor(generator, options);
  const weights = GENERATOR_WEIGHTS[generator];
  const soundingTuning = capoedTuning(tuning, capo);
  const fretCount = capoedFretCount(DEFAULT_FRET_COUNT, capo);
  // Candidates are picked by score *plus* the window penalty, not by score alone: otherwise a
  // window far from the neck's naturally best-scoring positions (e.g. "up the neck from 12") could
  // lose every in-window shape to truncation before the DP ever sees them.
  const rankedCost = (v: Voicing) => v.score + windowPenalty(v.position, v.stretch, window, weights.window);
  const perChord = chords.map((chord) => {
    const info = describeChord(toChordSpec(chord), 'sharp');
    const all = findVoicings(soundingTuning, fretCount, targetFromChord(info));
    return [...all].sort((a, b) => rankedCost(a) - rankedCost(b)).slice(0, MAX_CANDIDATES);
  });
  const choiceOptions = perChord.map((list) => list.map((v) => ({ item: v, cost: rankedCost(v) })));
  const picks = smoothestChoice(choiceOptions, (a, b) => weights.movement * shapeDistance(a.frets, b.frets));
  return picks.map((pick, i) => (pick >= 0 ? ((perChord[i] as Voicing[])[pick] ?? null) : null));
}
