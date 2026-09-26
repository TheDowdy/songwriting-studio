/**
 * The optional second layer drawn as rings around markers (PLAN.md §10): a diatonic triad or
 * seventh chord of the current scale, or another scale on the same root.
 */
import {
  formatNoteName,
  noteNamePc,
  pitchClass,
  type AccidentalPref,
  type NoteName,
} from './notes';
import { describeChord, type ChordSpec } from './chords';
import { getScale, spellScale, type ScaleDef } from './scales';

export type Overlay =
  | { kind: 'none' }
  /** Diatonic triad on scale degree `degree` (0 = first). */
  | { kind: 'triad'; degree: number }
  | { kind: 'seventh'; degree: number }
  /** Another scale sharing the tonic. */
  | { kind: 'scale'; scaleId: string }
  /** The chord currently set up in the Chords tab. */
  | { kind: 'chord' };

export const NO_OVERLAY: Overlay = { kind: 'none' };

export interface DiatonicChord {
  /** 0-based scale degree the chord is built on. */
  degree: number;
  /** Roman numeral with quality, e.g. "ii", "vii°", "V7", "viiø7". */
  numeral: string;
  /** Chord name, e.g. "Dm", "Bdim", "G7". */
  name: string;
  pcs: number[];
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const TRIADS: Record<string, { suffix: string; numeral: (n: string) => string }> = {
  '0,4,7': { suffix: '', numeral: (n) => n },
  '0,3,7': { suffix: 'm', numeral: (n) => n.toLowerCase() },
  '0,3,6': { suffix: 'dim', numeral: (n) => `${n.toLowerCase()}°` },
  '0,4,8': { suffix: 'aug', numeral: (n) => `${n}+` },
};

const SEVENTHS: Record<string, { suffix: string; numeral: (n: string) => string }> = {
  '0,4,7,11': { suffix: 'maj7', numeral: (n) => `${n}maj7` },
  '0,4,7,10': { suffix: '7', numeral: (n) => `${n}7` },
  '0,3,7,10': { suffix: 'm7', numeral: (n) => `${n.toLowerCase()}7` },
  '0,3,6,10': { suffix: 'm7♭5', numeral: (n) => `${n.toLowerCase()}ø7` },
  '0,3,6,9': { suffix: 'dim7', numeral: (n) => `${n.toLowerCase()}°7` },
  '0,3,7,11': { suffix: 'm(maj7)', numeral: (n) => `${n.toLowerCase()}(maj7)` },
  '0,4,8,11': { suffix: 'maj7♯5', numeral: (n) => `${n}+maj7` },
  '0,4,8,10': { suffix: '7♯5', numeral: (n) => `${n}+7` },
  '0,4,6,10': { suffix: '7♭5', numeral: (n) => `${n}7♭5` },
};

/** Diatonic chords need a seven-note scale to stack thirds sensibly. */
export function supportsDiatonicChords(def: ScaleDef): boolean {
  return !def.chromatic && def.degrees.length === 7;
}

/**
 * Chords built by stacking scale notes a third apart on each degree. Null for scales where that
 * isn't meaningful (pentatonic, blues, whole-tone, diminished, chromatic).
 */
export function diatonicChords(
  root: NoteName,
  def: ScaleDef,
  kind: 'triad' | 'seventh',
  pref: AccidentalPref = 'sharp',
): DiatonicChord[] | null {
  if (!supportsDiatonicChords(def)) return null;
  const notes = spellScale(root, def, pref);
  const count = kind === 'triad' ? 3 : 4;
  return notes.map((rootNote, degree) => {
    const members = Array.from(
      { length: count },
      (_, k) => notes[(degree + 2 * k) % 7] as NoteName,
    );
    const pcs = members.map((n) => noteNamePc(n));
    const key = pcs.map((pc) => pitchClass(pc - pcs[0]!)).join(',');
    const numeral = NUMERALS[degree] as string;
    const known = (kind === 'triad' ? TRIADS : SEVENTHS)[key];
    return {
      degree,
      numeral: known ? known.numeral(numeral) : `${numeral}?`,
      name: `${formatNoteName(rootNote)}${known ? known.suffix : '?'}`,
      pcs,
    };
  });
}

/** Pitch classes to ring, or null when there is no (valid) overlay for this scale. */
export function overlayPitchClasses(
  root: NoteName,
  def: ScaleDef,
  overlay: Overlay,
  pref: AccidentalPref = 'sharp',
  chordSpec?: ChordSpec,
): Set<number> | null {
  if (overlay.kind === 'none') return null;
  if (overlay.kind === 'chord') {
    return chordSpec ? new Set(describeChord(chordSpec, pref).pcs) : null;
  }
  if (overlay.kind === 'scale') {
    const rootPc = noteNamePc(root);
    return new Set(getScale(overlay.scaleId).intervals.map((i) => pitchClass(rootPc + i)));
  }
  const chords = diatonicChords(root, def, overlay.kind, pref);
  const chord = chords?.[overlay.degree];
  return chord ? new Set(chord.pcs) : null;
}

/** Short description of the overlay for the legend, e.g. "vi — Am". */
export function describeOverlay(
  root: NoteName,
  def: ScaleDef,
  overlay: Overlay,
  pref: AccidentalPref = 'sharp',
  chordSpec?: ChordSpec,
): string | null {
  if (overlay.kind === 'none') return null;
  if (overlay.kind === 'chord') return chordSpec ? describeChord(chordSpec, pref).name : null;
  if (overlay.kind === 'scale') {
    return `${formatNoteName(root)} ${getScale(overlay.scaleId).name}`;
  }
  const chord = diatonicChords(root, def, overlay.kind, pref)?.[overlay.degree];
  return chord ? `${chord.numeral} — ${chord.name}` : null;
}
