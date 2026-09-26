import { Note } from 'tonal';
import { chroma } from './scales';
import type { ChordColour, ChordRef, Key, Quality, Seventh } from './types';

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

const ALT_SYMBOL: Record<string, string> = {
  b5: '♭5',
  '#5': '♯5',
  b9: '♭9',
  '#9': '♯9',
  '#11': '♯11',
  b13: '♭13',
};

/** The seventh-position digit when a 9/11/13 extension replaces the plain 7th (e.g. dom7 → '9'). */
function seventhNumeralWithExtension(seventh: Seventh, extension: '9' | '11' | '13'): string {
  switch (seventh) {
    case 'dom7':
      return extension;
    case 'maj7':
      return `maj${extension}`;
    case 'min7':
      return extension;
    case 'minMaj7':
      return `(maj${extension})`;
    case 'm7b5':
      return `ø${extension}`;
    case 'dim7':
      return `°${extension}`;
    case 'augMaj7':
      return `+maj${extension}`;
    case 'aug7':
      return `+${extension}`;
  }
}

/** Alterations, added tones and omissions, as a compact tail (e.g. '♯9', 'add11', '(no5)'). */
function colourTail(colour: ChordColour | undefined): string {
  if (!colour) return '';
  const alts = (colour.alterations ?? []).map((a) => ALT_SYMBOL[a]).join('');
  const added = (colour.added ?? []).length ? `add${(colour.added ?? []).map((a) => a.slice(3)).join(',')}` : '';
  const omit = `${colour.omit3 ? '(no3)' : ''}${colour.omit5 ? '(no5)' : ''}`;
  return `${alts}${added}${omit}`;
}

/**
 * `numeralFor` plus a compact colour suffix (§3.1), e.g. 'V9', 'I6', 'V7♯9'. Identical to
 * `numeralFor` when the chord has no colour, so every existing numeral is unaffected.
 */
export function chordNumeral(
  chord: Pick<ChordRef, 'root' | 'quality' | 'seventh' | 'flavor' | 'colour'>,
  key: Key,
  inversion = 0,
): string {
  const colour = chord.colour;
  const hasColour =
    colour &&
    (colour.sixth ||
      colour.extension ||
      (colour.alterations && colour.alterations.length > 0) ||
      (colour.added && colour.added.length > 0) ||
      colour.omit3 ||
      colour.omit5);
  if (!hasColour) return numeralFor(chord, key, inversion);

  const { degree, accidental } = degreeOf(key.tonic, chord.root);
  let roman = ROMAN[degree];
  if (isLowerCase(chord.quality)) roman = roman.toLowerCase();

  const isSus = chord.flavor === 'sus2' || chord.flavor === 'sus4';
  let out = (ACCIDENTAL[accidental] ?? '') + roman;
  if (chord.flavor === '7') {
    out += colour?.extension && inversion === 0
      ? seventhNumeralWithExtension(chord.seventh, colour.extension)
      : seventhLabel(chord.seventh, inversion > 0);
  } else {
    if (!isSus) out += chord.quality === 'dim' ? '°' : chord.quality === 'aug' ? '+' : '';
    if (isSus) out += chord.flavor;
    else if (chord.flavor === 'add9') out += '(add9)';
    if (colour?.sixth) out += colour.sixth;
  }
  out += colourTail(colour);
  return out + inversionFigure(inversion, chord.flavor === '7');
}
