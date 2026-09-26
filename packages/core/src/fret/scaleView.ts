import { noteNamePc, pitchClass, type NoteName } from './notes';
import type { Degree, ScaleDef } from './scales';

export type PitchRole = 'tonic' | 'scale' | 'out';

/** How one pitch class relates to the active scale and overlay. Indexed 0–11 by pitch class. */
export interface PitchView {
  role: PitchRole;
  /** Semitones above the tonic. */
  interval: number;
  /** In-scale notes only. */
  degree?: Degree;
  /**
   * True for an altered degree whose number another note of the scale also uses (♭5 next to 5 in
   * the blues scale): it shares that hue and is told apart by a dashed ring (§10).
   */
  variant: boolean;
  /** Carries the overlay ring. */
  overlay: boolean;
}

/** Roles, degrees and overlay membership of all 12 pitch classes for a key and scale. */
export function buildPitchViews(
  root: NoteName,
  def: ScaleDef,
  overlay: ReadonlySet<number> | null = null,
): PitchView[] {
  const rootPc = noteNamePc(root);
  const numberCounts = new Map<number, number>();
  for (const d of def.degrees) numberCounts.set(d.number, (numberCounts.get(d.number) ?? 0) + 1);
  const degreeByPc = new Map(def.degrees.map((d) => [pitchClass(rootPc + d.interval), d]));

  return Array.from({ length: 12 }, (_, pc) => {
    const degree = degreeByPc.get(pc as never);
    const interval = pitchClass(pc - rootPc);
    return {
      role: pc === rootPc ? 'tonic' : degree ? 'scale' : 'out',
      interval,
      ...(degree ? { degree } : {}),
      variant:
        !!degree &&
        degree.alter !== 0 &&
        (numberCounts.get(degree.number) ?? 0) > 1 &&
        !def.chromatic,
      overlay: overlay?.has(pc) ?? false,
    };
  });
}
