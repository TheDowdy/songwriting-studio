/**
 * Capo maths (PLAN.md §7 Phase 3 item 4): a capo raises every open string by its fret number and
 * shortens the usable neck by the same amount. Pure; no store or DOM here, so both the guitar
 * module and the song schema (§3.2) share one implementation.
 */

export const MIN_CAPO = 0;
export const MAX_CAPO = 12;

/** Untrusted capo input (storage or import, §8) → a valid capo position, 0 when missing/invalid. */
export function sanitizeCapo(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return MIN_CAPO;
  return Math.max(MIN_CAPO, Math.min(MAX_CAPO, Math.round(n)));
}

/** The open strings as the capo makes them sound: every string raised by `capo` semitones. */
export function capoedTuning(strings: readonly number[], capo: number): number[] {
  return strings.map((s) => s + capo);
}

/** Frets left playable past the capo (a capo at fret N leaves `fretCount − N` of them); never
 *  negative, even if `capo` somehow exceeds `fretCount`. */
export function capoedFretCount(fretCount: number, capo: number): number {
  return Math.max(0, fretCount - capo);
}

/** A fret counted from the capo (0 = capo/open) as a real fret on the neck; `null` (muted) passes
 *  through unchanged. */
export function toPhysicalFret(relativeFret: number | null, capo: number): number | null {
  return relativeFret === null ? null : relativeFret + capo;
}

/**
 * A real fret on the neck as one counted from the capo (0 = capo/open); `null` (muted) passes
 * through unchanged. `null` also where the fret falls behind the capo — nothing can be fretted
 * there, so it has no relative position.
 */
export function toRelativeFret(fret: number | null, capo: number): number | null {
  if (fret === null || fret < capo) return null;
  return fret - capo;
}

/** Whether a real fret position sits behind the capo — unplayable, since the capo covers it.
 *  Fret 0 (the open string) is behind any capo greater than 0. */
export function isBehindCapo(fret: number, capo: number): boolean {
  return fret < capo;
}
