export type Mode =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian';

export interface Key {
  tonic: string; // spelled note, e.g. 'F#' or 'Gb'
  mode: Mode;
}

export type Flavor = 'triad' | '7' | 'sus2' | 'sus4' | 'add9';

/** Triad quality. For sus chords this is the quality the chord replaces (its function). */
export type Quality = 'maj' | 'min' | 'dim' | 'aug';

/** The 7th-chord type, used when flavor is '7'. Kept separately so flavor changes lose nothing. */
export type Seventh = 'maj7' | 'dom7' | 'min7' | 'minMaj7' | 'm7b5' | 'dim7' | 'augMaj7' | 'aug7';

export type Origin = 'diatonic' | 'borrowed' | 'secondary';

/**
 * Extras the rich chord vocabulary (§3.1) can express that plain PB chords can't: 6ths,
 * extensions, alterations, added tones, and omissions. Absent (or all-default) means a plain
 * PB chord — every song saved before this existed stays valid and unaffected.
 */
export interface ChordColour {
  /** 6 or 6/9 in place of a 7th. Only with flavor 'triad'. */
  sixth?: '6' | '6/9';
  /** 9 / 11 / 13 stacked on the 7th. Only with flavor '7'. */
  extension?: '9' | '11' | '13';
  alterations?: Array<'b5' | '#5' | 'b9' | '#9' | '#11' | 'b13'>;
  /** add11 / add13. add9 stays a flavor ('add9'). */
  added?: Array<'add11' | 'add13'>;
  omit3?: boolean; // flavor 'triad' + quality 'maj' + omit3 (only) = power chord, named "C5"
  omit5?: boolean;
}

export interface ChordRef {
  root: string; // spelled note, e.g. 'F#'
  quality: Quality;
  seventh: Seventh;
  flavor: Flavor;
  bass?: string; // for inversions / slash chords
  numeral: string; // e.g. 'IV', '♭VII', 'ii°'
  origin: Origin;
  colour?: ChordColour; // absent = plain PB chord; every existing song stays valid
}

export interface Suggestion {
  chord: ChordRef;
  score: number; // 0–1
  reason: string;
  origin: Origin;
}
