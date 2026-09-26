import {
  chromaticSpelling,
  formatNoteName,
  noteNamePc,
  pitchClass,
  spelledMidiName,
  type MidiNote,
  type NoteName,
  type PitchClass,
  type Spelling,
} from './notes';
import type { Degree, ScaleDef } from './scales';

export type CellRole = 'tonic' | 'scale' | 'out';

export interface FretCell {
  /** 0 = lowest string. */
  string: number;
  /** 0 = open. */
  fret: number;
  midi: MidiNote;
  pc: PitchClass;
  name: NoteName;
  /** Note name without octave, e.g. "B♭". Components must use this rather than hard-coding names. */
  label: string;
  /** Name with octave, e.g. "B♭2" (for aria-labels and tuning readouts). */
  fullName: string;
  /** Only set when a scale is active. */
  role?: CellRole;
  /** Scale degree of this note (in-scale notes only). */
  degree?: Degree;
}

export interface FretboardOptions {
  /** How to spell each pitch class; defaults to chromatic spelling with sharps. */
  spelling?: Spelling;
  /** Mark tonic / in-scale / out-of-scale cells. */
  scale?: { root: NoteName; def: ScaleDef };
}

export function fretToMidi(openMidi: MidiNote, fret: number): MidiNote {
  return openMidi + fret;
}

/** Grid of positions: `result[string][fret]`, strings low → high, frets 0…fretCount. */
export function buildFretboard(
  tuning: readonly MidiNote[],
  fretCount: number,
  options: FretboardOptions = {},
): FretCell[][] {
  const spelling = options.spelling ?? chromaticSpelling('sharp');
  const scale = options.scale;
  const rootPc = scale ? noteNamePc(scale.root) : 0;
  const degreeByPc = new Map<number, Degree>();
  scale?.def.degrees.forEach((d) => degreeByPc.set(pitchClass(rootPc + d.interval), d));

  return tuning.map((open, string) =>
    Array.from({ length: fretCount + 1 }, (_, fret) => {
      const midi = fretToMidi(open, fret);
      const pc = pitchClass(midi);
      const name = spelling[pc] as NoteName;
      const cell: FretCell = {
        string,
        fret,
        midi,
        pc,
        name,
        label: formatNoteName(name),
        fullName: spelledMidiName(midi, name),
      };
      if (scale) {
        const degree = degreeByPc.get(pc);
        if (degree) cell.degree = degree;
        cell.role = pc === rootPc ? 'tonic' : degree ? 'scale' : 'out';
      }
      return cell;
    }),
  );
}

/** A note that should be drawn on a string, at a (possibly fractional) fret position. */
export interface SlidingNote {
  midi: MidiNote;
  /** Fret position = midi − string pitch. Fractional while a peg is turning. */
  fret: number;
}

const EDGE_MARGIN = 0.5;

/**
 * The notes visible on a string whose current pitch is `pitch` (fractional during a peg drag).
 * A note of MIDI value m sits at fret f = m − pitch, so as the pitch changes every label slides
 * along the neck, and new ones slide in from the edges (PLAN.md §4).
 * Includes notes up to half a fret beyond either end so they can fade in and out.
 */
export function slidingNotes(pitch: number, fretCount: number): SlidingNote[] {
  const eps = 1e-9;
  const first = Math.ceil(pitch - EDGE_MARGIN - eps);
  const last = Math.floor(pitch + fretCount + EDGE_MARGIN + eps);
  const notes: SlidingNote[] = [];
  for (let midi = first; midi <= last; midi++) notes.push({ midi, fret: midi - pitch });
  return notes;
}

/** 1 inside the neck, fading to 0 over half a fret beyond either end. */
export function edgeOpacity(fret: number, fretCount: number): number {
  if (fret < 0) return Math.max(0, 1 + fret / EDGE_MARGIN);
  if (fret > fretCount) return Math.max(0, 1 - (fret - fretCount) / EDGE_MARGIN);
  return 1;
}
