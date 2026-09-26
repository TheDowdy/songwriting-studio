import { Note, Scale } from 'tonal';
import type { Key, Mode } from './types';

export const MODES: Mode[] = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];

export const MODE_INFO: Record<Mode, { label: string; tonalName: string; mood: string }> = {
  major: { label: 'Major', tonalName: 'major', mood: 'Bright, happy and settled.' },
  minor: { label: 'Minor (natural)', tonalName: 'minor', mood: 'Sad, serious and dark.' },
  dorian: { label: 'Dorian', tonalName: 'dorian', mood: 'Minor but hopeful, with a jazzy, funky lift.' },
  phrygian: { label: 'Phrygian', tonalName: 'phrygian', mood: 'Dark and tense, with a Spanish flavour.' },
  lydian: { label: 'Lydian', tonalName: 'lydian', mood: 'Dreamy and floating, a brighter major.' },
  mixolydian: { label: 'Mixolydian', tonalName: 'mixolydian', mood: 'Major with a relaxed rock/blues edge.' },
  locrian: { label: 'Locrian', tonalName: 'locrian', mood: 'Unstable and eerie. Advanced: home chord is diminished.' },
};

/** The 12 root choices, each with its possible spellings (first is the default). */
export const TONIC_OPTIONS: string[][] = [
  ['C'],
  ['C#', 'Db'],
  ['D'],
  ['D#', 'Eb'],
  ['E'],
  ['F'],
  ['F#', 'Gb'],
  ['G'],
  ['G#', 'Ab'],
  ['A'],
  ['A#', 'Bb'],
  ['B'],
];

/** The seven spelled notes of the key's scale, starting on the tonic. */
export function scaleNotes(key: Key): string[] {
  const scale = Scale.get(`${key.tonic} ${MODE_INFO[key.mode].tonalName}`);
  if (scale.empty || scale.notes.length !== 7) {
    throw new Error(`Cannot build scale for ${key.tonic} ${key.mode}`);
  }
  return scale.notes;
}

export function chroma(note: string): number {
  const c = Note.chroma(note);
  if (c === undefined || Number.isNaN(c)) throw new Error(`Invalid note: ${note}`);
  return c;
}

export function sameNote(a: string, b: string): boolean {
  return chroma(a) === chroma(b);
}

/** Display a note or symbol with proper flat/sharp signs. */
export function fmt(text: string): string {
  return text.replace(/#/g, '♯').replace(/(?<=^[A-G])b/g, '♭').replace(/(?<=[♯♭])b/g, '♭');
}

export function keyLabel(key: Key): string {
  return `${fmt(key.tonic)} ${MODE_INFO[key.mode].label.replace(' (natural)', '')}`;
}
