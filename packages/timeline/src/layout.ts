/**
 * How wide a chord block is drawn. Width follows the chord's length in beats, so the strip reads
 * as time, with a minimum so a one-beat chord stays big enough to read and tap (WCAG 2.2 target
 * size). "Compact" suits the guitar workspace and phones; "comfortable" the chords workspace.
 */
export type Density = 'compact' | 'comfortable';

interface DensitySpec {
  /** Pixels per beat. */
  beatPx: number;
  /** The narrowest a block is ever drawn, in pixels. */
  minPx: number;
}

export const DENSITIES: Record<Density, DensitySpec> = {
  compact: { beatPx: 24, minPx: 64 },
  comfortable: { beatPx: 40, minPx: 56 },
};

export function blockWidth(beats: number, density: Density): number {
  const { beatPx, minPx } = DENSITIES[density];
  return Math.max(minPx, Math.round(Math.max(0, beats) * beatPx));
}
