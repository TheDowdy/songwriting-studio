import {
  chromaticName,
  LETTERS,
  noteNamePc,
  pitchClass,
  spellOnLetter,
  type AccidentalPref,
  type NoteName,
  type PitchClass,
  type Spelling,
} from './notes';

/** Semitones of the major scale degrees 1–7 above the tonic. */
export const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * A scale degree relative to the major scale: `number` is 1–7 (this also fixes the letter
 * used when spelling), `alter` is −1 (♭) / 0 / +1 (♯).
 */
export interface Degree {
  number: number;
  alter: -1 | 0 | 1;
  /** Display label such as "♭3". */
  label: string;
  /** Semitones above the tonic. */
  interval: number;
}

export interface ScaleDef {
  id: string;
  name: string;
  degrees: readonly Degree[];
  /** Semitones above the tonic, ascending (derived from `degrees`). */
  intervals: readonly number[];
  /** Chromatic scale: no letter-based spelling, follows the ♯/♭ preference. */
  chromatic?: boolean;
}

export function parseDegree(text: string): Degree {
  const match = /^([b#]?)([1-7])$/.exec(text);
  if (!match) throw new Error(`Bad scale degree "${text}"`);
  const alter = match[1] === 'b' ? -1 : match[1] === '#' ? 1 : 0;
  const number = Number(match[2]);
  return {
    number,
    alter,
    label: `${alter === -1 ? '♭' : alter === 1 ? '♯' : ''}${number}`,
    interval: (MAJOR_INTERVALS[number - 1] as number) + alter,
  };
}

function scale(id: string, name: string, degrees: string, chromatic = false): ScaleDef {
  const parsed = degrees.split(' ').map(parseDegree);
  return {
    id,
    name,
    degrees: parsed,
    intervals: parsed.map((d) => d.interval),
    ...(chromatic ? { chromatic } : {}),
  };
}

export const SCALES: readonly ScaleDef[] = [
  scale('major', 'Major (Ionian)', '1 2 3 4 5 6 7'),
  scale('natural-minor', 'Natural minor (Aeolian)', '1 2 b3 4 5 b6 b7'),
  scale('dorian', 'Dorian', '1 2 b3 4 5 6 b7'),
  scale('phrygian', 'Phrygian', '1 b2 b3 4 5 b6 b7'),
  scale('lydian', 'Lydian', '1 2 3 #4 5 6 7'),
  scale('mixolydian', 'Mixolydian', '1 2 3 4 5 6 b7'),
  scale('locrian', 'Locrian', '1 b2 b3 4 b5 b6 b7'),
  scale('harmonic-minor', 'Harmonic minor', '1 2 b3 4 5 b6 7'),
  scale('melodic-minor', 'Melodic minor (ascending)', '1 2 b3 4 5 6 7'),
  scale('phrygian-dominant', 'Phrygian dominant', '1 b2 3 4 5 b6 b7'),
  scale('harmonic-major', 'Harmonic major', '1 2 3 4 5 b6 7'),
  scale('major-pentatonic', 'Major pentatonic', '1 2 3 5 6'),
  scale('minor-pentatonic', 'Minor pentatonic', '1 b3 4 5 b7'),
  scale('blues', 'Blues (minor)', '1 b3 4 b5 5 b7'),
  scale('major-blues', 'Major blues', '1 2 b3 3 5 6'),
  scale('whole-tone', 'Whole tone', '1 2 3 #4 #5 b7'),
  scale('diminished-hw', 'Diminished (half-whole)', '1 b2 b3 3 #4 5 6 b7'),
  scale('diminished-wh', 'Diminished (whole-half)', '1 2 b3 4 b5 b6 6 7'),
  scale('hungarian-minor', 'Hungarian minor', '1 2 b3 #4 5 b6 7'),
  scale('double-harmonic', 'Double harmonic', '1 b2 3 4 5 b6 7'),
  scale('chromatic', 'Chromatic', '1 b2 2 b3 3 4 b5 5 b6 6 b7 7', true),
];

export function getScale(id: string): ScaleDef {
  const found = SCALES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scale "${id}"`);
  return found;
}

/** The scale's notes, spelled with the correct letter for each degree. */
export function spellScale(
  root: NoteName,
  scaleDef: ScaleDef,
  pref: AccidentalPref = 'sharp',
): NoteName[] {
  const rootPc = noteNamePc(root);
  const rootLetter = LETTERS.indexOf(root.letter);
  return scaleDef.degrees.map((degree) => {
    const pc = pitchClass(rootPc + degree.interval);
    if (scaleDef.chromatic) return chromaticName(pc, pref);
    const letter = LETTERS[(rootLetter + degree.number - 1) % 7] as (typeof LETTERS)[number];
    // Fall back to the ♯/♭ preference if theory would need a triple accidental.
    return spellOnLetter(pc, letter) ?? chromaticName(pc, pref);
  });
}

/**
 * A 12-entry spelling for the fretboard: notes in the scale get their theoretically correct
 * name, everything else follows the ♯/♭ preference.
 */
export function scaleSpelling(
  root: NoteName,
  scaleDef: ScaleDef,
  pref: AccidentalPref = 'sharp',
): Spelling {
  const out = Array.from({ length: 12 }, (_, pc) => chromaticName(pc, pref));
  spellScale(root, scaleDef, pref).forEach((name) => {
    out[noteNamePc(name)] = name;
  });
  return out;
}

/** Pitch classes of the scale (unordered set semantics, ascending from the root). */
export function scalePitchClasses(root: NoteName, scaleDef: ScaleDef): PitchClass[] {
  const rootPc = noteNamePc(root);
  return scaleDef.intervals.map((i) => pitchClass(rootPc + i));
}

/**
 * Pick the root spelling for a pitch class with the fewest accidentals and no double
 * accidentals anywhere in the scale (e.g. major on pc 3 → E♭, not D♯). Ties follow `pref`.
 */
export function bestRootSpelling(
  pc: number,
  scaleDef: ScaleDef,
  pref: AccidentalPref = 'sharp',
): NoteName {
  const preferred = chromaticName(pc, pref);
  if (scaleDef.chromatic) return preferred;
  const candidates: NoteName[] = [chromaticName(pc, 'sharp'), chromaticName(pc, 'flat')];
  const cost = (root: NoteName) => {
    const notes = spellScale(root, scaleDef, pref);
    const doubles = notes.filter((n) => Math.abs(n.acc) > 1).length;
    const total = notes.reduce((sum, n) => sum + Math.abs(n.acc), 0);
    return doubles * 100 + total;
  };
  return candidates.reduce((best, c) => {
    const diff = cost(c) - cost(best);
    return diff < 0 || (diff === 0 && c === preferred) ? c : best;
  }, candidates[0] as NoteName);
}
