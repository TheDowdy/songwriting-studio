/**
 * Pitch classes, MIDI numbers, note spelling and enharmonics.
 * Pure TypeScript: no React, no audio.
 */

/** MIDI note number. 40 = E2, 60 = C4, 69 = A4 = 440 Hz. */
export type MidiNote = number;
/** Pitch class, 0 = C … 11 = B. */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type AccidentalPref = 'sharp' | 'flat';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

/** Pitch class of each natural letter, indexed like LETTERS. */
export const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11] as const;

/** A spelled note: letter plus accidental (+1 = ♯, −1 = ♭, +2 = 𝄪, −2 = 𝄫). */
export interface NoteName {
  letter: Letter;
  acc: number;
}

export const SHARP = '♯';
export const FLAT = '♭';
export const DOUBLE_SHARP = '𝄪';
export const DOUBLE_FLAT = '𝄫';

export function pitchClass(midi: number): PitchClass {
  return (((Math.round(midi) % 12) + 12) % 12) as PitchClass;
}

/** Octave number using the convention C4 = MIDI 60 (so MIDI 40 = E2). */
export function midiOctave(midi: MidiNote): number {
  return Math.floor(midi / 12) - 1;
}

/** Frequency in Hz; accepts fractional MIDI values (used during peg drags). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function accidentalString(acc: number): string {
  if (acc === 0) return '';
  if (acc === 2) return DOUBLE_SHARP;
  if (acc === -2) return DOUBLE_FLAT;
  const symbol = acc > 0 ? SHARP : FLAT;
  return symbol.repeat(Math.abs(acc));
}

export function formatNoteName(name: NoteName): string {
  return `${name.letter}${accidentalString(name.acc)}`;
}

const SHARP_NAMES: readonly NoteName[] = [
  { letter: 'C', acc: 0 },
  { letter: 'C', acc: 1 },
  { letter: 'D', acc: 0 },
  { letter: 'D', acc: 1 },
  { letter: 'E', acc: 0 },
  { letter: 'F', acc: 0 },
  { letter: 'F', acc: 1 },
  { letter: 'G', acc: 0 },
  { letter: 'G', acc: 1 },
  { letter: 'A', acc: 0 },
  { letter: 'A', acc: 1 },
  { letter: 'B', acc: 0 },
];

const FLAT_NAMES: readonly NoteName[] = [
  { letter: 'C', acc: 0 },
  { letter: 'D', acc: -1 },
  { letter: 'D', acc: 0 },
  { letter: 'E', acc: -1 },
  { letter: 'E', acc: 0 },
  { letter: 'F', acc: 0 },
  { letter: 'G', acc: -1 },
  { letter: 'G', acc: 0 },
  { letter: 'A', acc: -1 },
  { letter: 'A', acc: 0 },
  { letter: 'B', acc: -1 },
  { letter: 'B', acc: 0 },
];

/** Spelling of a pitch class in chromatic mode, following the ♯/♭ preference. */
export function chromaticName(pc: number, pref: AccidentalPref = 'sharp'): NoteName {
  const table = pref === 'sharp' ? SHARP_NAMES : FLAT_NAMES;
  return table[pitchClass(pc)] as NoteName;
}

/** Pitch class of a spelled note (may wrap, e.g. B♯ = 0). */
export function noteNamePc(name: NoteName): PitchClass {
  const natural = NATURAL_PC[LETTERS.indexOf(name.letter)] as number;
  return pitchClass(natural + name.acc);
}

/**
 * Spell a pitch class using a given letter: the accidental is whatever is needed
 * to reach the pitch class. Returns null if it would take more than a double accidental.
 */
export function spellOnLetter(pc: number, letter: Letter): NoteName | null {
  const natural = NATURAL_PC[LETTERS.indexOf(letter)] as number;
  let diff = (((pc - natural) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  return Math.abs(diff) <= 2 ? { letter, acc: diff } : null;
}

/** MIDI note → spelled name plus octave, e.g. 40 → "E2", 39 (flat pref) → "E♭2". */
export function midiToName(midi: MidiNote, pref: AccidentalPref = 'sharp'): string {
  return spelledMidiName(midi, chromaticName(midi, pref));
}

/** Octave-qualified name for a MIDI note whose spelling is already decided. */
export function spelledMidiName(midi: MidiNote, name: NoteName): string {
  // Octave follows the letter, not the sounding pitch (C♭4 sounds in octave 3 but is written C♭4).
  const octave = Math.floor((Math.round(midi) - name.acc) / 12) - 1;
  return `${formatNoteName(name)}${octave}`;
}

/** Note name without octave, following the ♯/♭ preference. */
export function midiToPitchName(midi: MidiNote, pref: AccidentalPref = 'sharp'): string {
  return formatNoteName(chromaticName(midi, pref));
}

/**
 * Parse "E2", "B♭2", "Bb2", "F#3", "C♯2" → MIDI number. Throws on bad input.
 */
export function parseNote(text: string): MidiNote {
  const match = /^([A-Ga-g])([#♯b♭]{0,2})(-?\d+)$/.exec(text.trim());
  if (!match) throw new Error(`Cannot parse note "${text}"`);
  const letter = (match[1] as string).toUpperCase() as Letter;
  const acc = [...(match[2] as string)].reduce((n, c) => n + (c === '#' || c === '♯' ? 1 : -1), 0);
  const octave = Number(match[3]);
  return (octave + 1) * 12 + (NATURAL_PC[LETTERS.indexOf(letter)] as number) + acc;
}

/** Parse a root name like "F", "B♭" or "F#" (no octave) into a NoteName. Throws on bad input. */
export function parseNoteName(text: string): NoteName {
  const match = /^([A-Ga-g])([#♯b♭]{0,2})$/.exec(text.trim());
  if (!match) throw new Error(`Cannot parse note name "${text}"`);
  const acc = [...(match[2] as string)].reduce((n, c) => n + (c === '#' || c === '♯' ? 1 : -1), 0);
  return { letter: (match[1] as string).toUpperCase() as Letter, acc };
}

/** A spelling assigns a note name to each of the 12 pitch classes. */
export type Spelling = readonly NoteName[];

export function chromaticSpelling(pref: AccidentalPref = 'sharp'): Spelling {
  return pref === 'sharp' ? SHARP_NAMES : FLAT_NAMES;
}
