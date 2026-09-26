import type { ChordRef, Key } from './theory/types';

export type InstrumentId = 'piano' | 'epiano' | 'pad' | 'guitar';
export type PatternId =
  | 'block'
  | 'pulse'
  | 'strum-down'
  | 'strum-updown'
  | 'arp-up'
  | 'arp-updown'
  | 'arp-broken'
  | 'bass-chord';

export interface TimeSig {
  beats: number;
  unit: 1 | 2 | 4 | 8 | 16;
}

export interface ChordEvent {
  id: string;
  chord: ChordRef;
  beats: number;
}

export interface Section {
  id: string;
  name: string;
  events: ChordEvent[];
  repeat: number;
}

export interface Song {
  id: string;
  title: string;
  key: Key;
  timeSig: TimeSig;
  bpm: number; // beats of `timeSig.unit` per minute
  instrument: InstrumentId;
  pattern: PatternId;
  sections: Section[];
  arrangement: string[]; // ordered section ids (sections can repeat)
  updatedAt: number;
}
