/**
 * Pure layout maths for the fretboard, in SVG viewBox units (right-handed, nut on the left).
 * Left-handed mode is handled by the renderer mirroring x with `mirrorX`.
 */

export const STRING_COUNT = 6;

/** Fixed layout constants (viewBox units). */
export const LAYOUT = {
  /** Headstock sliver left of the nut: a strip of its outline, the pegs, then the open-note slot. */
  headstockWidth: 150,
  /** Width of the slot behind the nut holding each open-string marker. */
  openSlotWidth: 44,
  /** Nut → last fret wire. */
  neckLength: 1200,
  /** Past the last fret wire: the end of the board, then a hint of the guitar's body. */
  tailWidth: 100,
  /** How far the fretboard itself runs beyond the last fret wire. */
  boardOverhang: 12,
  stringGap: 36,
  /** Fretboard edge to the outermost string. */
  edgeMargin: 22,
  /** Space below the board for fret numbers. */
  numberBand: 34,
} as const;

export const nutX = LAYOUT.headstockWidth;
export const totalWidth = LAYOUT.headstockWidth + LAYOUT.neckLength + LAYOUT.tailWidth;
export const boardHeight = 2 * LAYOUT.edgeMargin + (STRING_COUNT - 1) * LAYOUT.stringGap;
export const totalHeight = boardHeight + LAYOUT.numberBand;

/**
 * x of each fret wire 0…fretCount (index 0 = nut). Realistic spacing uses
 * d(n) = L·(1 − 2^(−n/12)), with L chosen so the last fret lands at `neckLength`.
 */
export function fretWireXs(fretCount: number, realistic: boolean): number[] {
  const { neckLength } = LAYOUT;
  const scaleLength = neckLength / (1 - Math.pow(2, -fretCount / 12));
  return Array.from({ length: fretCount + 1 }, (_, n) => {
    const d = realistic ? scaleLength * (1 - Math.pow(2, -n / 12)) : (n / fretCount) * neckLength;
    return nutX + d;
  });
}

/**
 * x-centre of each fret position 0…fretCount. Fret 0 (open string) sits in the slot behind
 * the nut; fret n ≥ 1 sits midway between wires n−1 and n.
 */
export function fretCentreXs(wires: readonly number[]): number[] {
  return wires.map((x, n) =>
    n === 0 ? nutX - LAYOUT.openSlotWidth / 2 : ((wires[n - 1] as number) + x) / 2,
  );
}

/** Width available for a marker at each fret position (open slot for fret 0). */
export function fretSpaceWidths(wires: readonly number[]): number[] {
  return wires.map((x, n) => (n === 0 ? LAYOUT.openSlotWidth : x - (wires[n - 1] as number)));
}

/** y of a string; index 0 = lowest (6th) string, drawn at the bottom. */
export function stringY(stringIndex: number): number {
  return LAYOUT.edgeMargin + (STRING_COUNT - 1 - stringIndex) * LAYOUT.stringGap;
}

/** Marker radius: fits inside the smaller of fret width / string gap so neighbours never touch. */
export function markerRadius(spaceWidth: number): number {
  return (Math.min(spaceWidth, LAYOUT.stringGap) / 2) * 0.86;
}

/** Fret numbers that carry inlays, and whether each is a double marker. */
export function inlayFrets(fretCount: number): { fret: number; double: boolean }[] {
  const singles = [3, 5, 7, 9, 15, 17, 19, 21];
  const doubles = [12, 24];
  return [
    ...singles.map((fret) => ({ fret, double: false })),
    ...doubles.map((fret) => ({ fret, double: true })),
  ]
    .filter((i) => i.fret <= fretCount)
    .sort((a, b) => a.fret - b.fret);
}

export function mirrorX(x: number, leftHanded: boolean): number {
  return leftHanded ? totalWidth - x : x;
}

/** Whether to use realistic spacing for the given setting and available container width. */
export function shouldUseRealisticSpacing(
  setting: 'auto' | 'realistic' | 'even',
  containerWidth: number,
): boolean {
  if (setting === 'realistic') return true;
  if (setting === 'even') return false;
  return containerWidth >= 900;
}

/**
 * Value at a fractional fret position, linearly interpolated between the per-fret `values`
 * (index 0 = open slot). Outside 0…N it extends along the end slopes, so a label sliding past
 * the nut or the last fret keeps moving smoothly. Used for x-centres.
 */
export function interpolateAtFret(values: readonly number[], fret: number): number {
  const last = values.length - 1;
  if (fret <= 0) {
    const slope = (values[1] as number) - (values[0] as number);
    return (values[0] as number) + fret * slope;
  }
  if (fret >= last) {
    const slope = (values[last] as number) - (values[last - 1] as number);
    return (values[last] as number) + (fret - last) * slope;
  }
  const lo = Math.floor(fret);
  const t = fret - lo;
  return (values[lo] as number) * (1 - t) + (values[lo + 1] as number) * t;
}

/** Like interpolateAtFret but holds the end values instead of extending (used for sizes). */
export function interpolateClamped(values: readonly number[], fret: number): number {
  const last = values.length - 1;
  if (fret <= 0) return values[0] as number;
  if (fret >= last) return values[last] as number;
  const lo = Math.floor(fret);
  const t = fret - lo;
  return (values[lo] as number) * (1 - t) + (values[lo + 1] as number) * t;
}

/** Layout of the tuning peg for each string (drawn in the headstock, left of the open-note slot). */
export const PEG = {
  x: LAYOUT.headstockWidth - LAYOUT.openSlotWidth - 70,
  width: 70,
  height: LAYOUT.stringGap - 3,
} as const;
