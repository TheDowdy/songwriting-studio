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

export interface ChordRef {
  root: string; // spelled note, e.g. 'F#'
  quality: Quality;
  seventh: Seventh;
  flavor: Flavor;
  bass?: string; // for inversions / slash chords
  numeral: string; // e.g. 'IV', '♭VII', 'ii°'
  origin: Origin;
}

export interface Suggestion {
  chord: ChordRef;
  score: number; // 0–1
  reason: string;
  origin: Origin;
}
