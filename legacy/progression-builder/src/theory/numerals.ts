import { Note } from 'tonal';
import { chroma } from './scales';
import type { ChordRef, Key, Quality, Seventh } from './types';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Semitones above the tonic for each degree of the parallel major scale. */
const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

const ACCIDENTAL: Record<number, string> = { [-2]: '♭♭', [-1]: '♭', 0: '', 1: '♯', 2: '♯♯' };

/**
 * Degree (0–6) and accidental of `root` relative to the parallel major of `tonic`.
 * Uses letter names for the degree so spelling is respected (E♯ in F♯ major is degree 7, not 1).
 */
export function degreeOf(tonic: string, root: string): { degree: number; accidental: number } {
  const degree = (Note.get(root).step - Note.get(tonic).step + 7) % 7;
  let accidental = ((chroma(root) - chroma(tonic) + 12) % 12) - MAJOR_SEMITONES[degree];
  if (accidental > 6) accidental -= 12;
  if (accidental < -6) accidental += 12;
  return { degree, accidental };
}

/** Figured-bass style superscripts for an inversion (0 = root position). */
export function inversionFigure(inversion: number, isSeventh: boolean): string {
  if (inversion <= 0) return '';
  const triad = ['', '⁶', '⁶₄'];
  const seventh = ['', '⁶₅', '⁴₃', '⁴₂'];
  return (isSeventh ? seventh : triad)[inversion] ?? '';
}

function seventhLabel(seventh: Seventh, inverted: boolean): string {
  switch (seventh) {
    case 'maj7':
      return inverted ? 'maj' : 'maj7';
    case 'minMaj7':
      return inverted ? '(maj)' : '(maj7)';
    case 'dom7':
    case 'min7':
      return inverted ? '' : '7';
    case 'm7b5':
      return inverted ? 'ø' : 'ø7';
    case 'dim7':
      return inverted ? '°' : '°7';
    case 'augMaj7':
      return inverted ? '+maj' : '+maj7';
    case 'aug7':
      return inverted ? '+' : '+7';
  }
}

const isLowerCase = (q: Quality) => q === 'min' || q === 'dim';

/**
 * Roman numeral for a chord in a key, e.g. 'V7', '♭VII', 'vii°', 'IVmaj7', 'Isus4', 'vi(add9)', 'I⁶₄'.
 * `inversion` is the index of the bass in the chord's stack (0 = root position).
 */
export function numeralFor(
  chord: Pick<ChordRef, 'root' | 'quality' | 'seventh' | 'flavor'>,
  key: Key,
  inversion = 0,
): string {
  const { degree, accidental } = degreeOf(key.tonic, chord.root);
  let roman = ROMAN[degree];
  if (isLowerCase(chord.quality)) roman = roman.toLowerCase();

  const isSus = chord.flavor === 'sus2' || chord.flavor === 'sus4';
  let out = (ACCIDENTAL[accidental] ?? '') + roman;
  if (chord.flavor === '7') {
    out += seventhLabel(chord.seventh, inversion > 0);
  } else {
    if (!isSus) out += chord.quality === 'dim' ? '°' : chord.quality === 'aug' ? '+' : '';
    if (isSus) out += chord.flavor;
    else if (chord.flavor === 'add9') out += '(add9)';
  }
  return out + inversionFigure(inversion, chord.flavor === '7');
}
