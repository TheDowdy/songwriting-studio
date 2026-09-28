/**
 * The voicings a guitarist would expect the app to pick by default (the owner's request after
 * Phase 4: B♭ defaulted to the awkward x-1-0-3-3-1 instead of the x-1-3-3-3-1 barre). Each entry
 * lists every shape that counts as "the obvious way to play it"; `voicingReference.test.ts` checks
 * the scorer's best voicing is one of them. Edit this list, not the test, when the owner corrects
 * a shape.
 *
 * Frets are written low E → high E, 'x' for a muted string.
 */
import { DEFAULT_CHORD, type ChordSpec } from './chords';

export interface ReferenceVoicing {
  name: string;
  spec: ChordSpec;
  /** Open-string MIDI notes, low → high. Standard tuning when omitted. */
  tuning?: readonly number[];
  accept: readonly string[];
}

export const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64] as const;
export const OPEN_G_TUNING_MIDI = [38, 43, 50, 55, 59, 62] as const;
export const DROP_D_TUNING_MIDI = [38, 45, 50, 55, 59, 64] as const;
export const DADGAD_TUNING_MIDI = [38, 45, 50, 55, 57, 62] as const;

const PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const spec = (root: string, over: Partial<ChordSpec> = {}): ChordSpec => ({
  ...DEFAULT_CHORD,
  rootPc: PC[root] as number,
  ...over,
});

const entry = (
  name: string,
  s: ChordSpec,
  accept: string[],
  tuning?: readonly number[],
): ReferenceVoicing => ({ name, spec: s, accept, ...(tuning ? { tuning } : {}) });

const min = { quality: 'minor' as const };
const dom7 = { seventh: '7' as const };
const maj7 = { seventh: 'maj7' as const };
const min7 = { quality: 'minor' as const, seventh: '7' as const };

export const REFERENCE_VOICINGS: readonly ReferenceVoicing[] = [
  // ---- major, open
  entry('C', spec('C'), ['x-3-2-0-1-0']),
  entry('D', spec('D'), ['x-x-0-2-3-2']),
  entry('E', spec('E'), ['0-2-2-1-0-0']),
  entry('G', spec('G'), ['3-2-0-0-0-3', '3-2-0-0-3-3', '3-x-0-0-0-3']),
  entry('A', spec('A'), ['x-0-2-2-2-0']),
  // ---- major, barre (E shape on the 6th string, A shape on the 5th)
  entry('F', spec('F'), ['1-3-3-2-1-1', 'x-x-3-2-1-1']),
  entry('F♯', spec('F#'), ['2-4-4-3-2-2']),
  entry('A♭', spec('Ab'), ['4-6-6-5-4-4']),
  entry('B♭', spec('Bb'), ['x-1-3-3-3-1']),
  entry('B', spec('B'), ['x-2-4-4-4-2']),
  entry('C♯', spec('C#'), ['x-4-6-6-6-4']),
  entry('E♭', spec('Eb'), ['x-6-8-8-8-6', 'x-x-1-3-4-3']),
  // ---- minor
  entry('Am', spec('A', min), ['x-0-2-2-1-0']),
  entry('Dm', spec('D', min), ['x-x-0-2-3-1']),
  entry('Em', spec('E', min), ['0-2-2-0-0-0']),
  entry('Fm', spec('F', min), ['1-3-3-1-1-1']),
  entry('F♯m', spec('F#', min), ['2-4-4-2-2-2']),
  entry('Gm', spec('G', min), ['3-5-5-3-3-3']),
  entry('G♯m', spec('G#', min), ['4-6-6-4-4-4']),
  entry('B♭m', spec('Bb', min), ['x-1-3-3-2-1']),
  entry('Bm', spec('B', min), ['x-2-4-4-3-2']),
  entry('Cm', spec('C', min), ['x-3-5-5-4-3']),
  entry('C♯m', spec('C#', min), ['x-4-6-6-5-4']),
  // ---- dominant 7th
  entry('A7', spec('A', dom7), ['x-0-2-0-2-0']),
  entry('B7', spec('B', dom7), ['x-2-1-2-0-2']),
  entry('C7', spec('C', dom7), ['x-3-2-3-1-0']),
  entry('D7', spec('D', dom7), ['x-x-0-2-1-2']),
  entry('E7', spec('E', dom7), ['0-2-0-1-0-0', '0-2-2-1-3-0', '0-2-0-1-3-0']),
  entry('F7', spec('F', dom7), ['1-3-1-2-1-1']),
  entry('G7', spec('G', dom7), ['3-2-0-0-0-1']),
  // ---- minor 7th
  entry('Am7', spec('A', min7), ['x-0-2-0-1-0']),
  entry('Dm7', spec('D', min7), ['x-x-0-2-1-1']),
  entry('Em7', spec('E', min7), ['0-2-0-0-0-0', '0-2-2-0-3-0']),
  entry('Bm7', spec('B', min7), ['x-2-0-2-0-2', 'x-2-4-2-3-2']),
  // ---- major 7th
  entry('Cmaj7', spec('C', maj7), ['x-3-2-0-0-0']),
  entry('Dmaj7', spec('D', maj7), ['x-x-0-2-2-2']),
  entry('Fmaj7', spec('F', maj7), ['x-x-3-2-1-0', '1-3-2-2-1-1']),
  entry('Amaj7', spec('A', maj7), ['x-0-2-1-2-0']),
  // ---- sus
  entry('Asus2', spec('A', { quality: 'sus2' }), ['x-0-2-2-0-0']),
  entry('Dsus2', spec('D', { quality: 'sus2' }), ['x-x-0-2-3-0']),
  entry('Dsus4', spec('D', { quality: 'sus4' }), ['x-x-0-2-3-3']),
  entry('Esus4', spec('E', { quality: 'sus4' }), ['0-2-2-2-0-0', '0-0-2-2-0-0']),
  entry('Asus4', spec('A', { quality: 'sus4' }), ['x-0-2-2-3-0', 'x-0-0-2-3-0']),
  // ---- slash chords
  entry('C/E', spec('C', { bassPc: PC.E }), ['0-3-2-0-1-0', 'x-x-2-0-1-0']),
  entry('G/B', spec('G', { bassPc: PC.B }), ['x-2-0-0-0-3', 'x-2-0-0-3-3']),
  entry('D/F♯', spec('D', { bassPc: PC['F#'] }), ['2-x-0-2-3-2', '2-0-0-2-3-2', 'x-x-4-2-3-2', '2-0-0-2-3-x']),
  // ---- other tunings
  entry('G (Open G)', spec('G'), ['0-0-0-0-0-0'], OPEN_G_TUNING_MIDI),
  entry('D (Drop D)', spec('D'), ['0-x-0-2-3-2', '0-0-0-2-3-2'], DROP_D_TUNING_MIDI),
  entry('Dsus4 (DADGAD)', spec('D', { quality: 'sus4' }), ['0-0-0-0-0-0'], DADGAD_TUNING_MIDI),
];
