import { chordStack } from './chords';
import { chroma } from './scales';
import type { ChordRef } from './types';

/** Standard tuning, low string to high (E2 A2 D3 G3 B3 E4), as MIDI numbers. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

export interface GuitarShape {
  /** Fret per string, low to high; null = muted, 0 = open. */
  frets: (number | null)[];
  /** Lowest fret shown on the diagram (1 = starts at the nut). */
  baseFret: number;
  /** True when this wasn't one of the curated open/movable shapes. */
  generated: boolean;
}

type ShapeQuality = 'maj' | 'min' | 'dom7' | 'maj7' | 'min7';

/**
 * Standard open-position fingerings for E and A, as fret offsets from the shape's own root
 * (E = 0 shift, A = 0 shift). Movable to any root by adding `shift` — the classic "E-shape" /
 * "A-shape" barre-chord convention. Each is a widely-taught textbook shape; validated against
 * the theory engine's own chord tones in guitarShapes.test.ts so a transcription slip can't
 * silently ship a wrong diagram.
 */
const E_SHAPE: Record<ShapeQuality, (number | null)[]> = {
  maj: [0, 2, 2, 1, 0, 0],
  min: [0, 2, 2, 0, 0, 0],
  dom7: [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  min7: [0, 2, 0, 0, 0, 0],
};

const A_SHAPE: Record<ShapeQuality, (number | null)[]> = {
  maj: [null, 0, 2, 2, 2, 0],
  min: [null, 0, 2, 2, 1, 0],
  dom7: [null, 0, 2, 0, 2, 0],
  maj7: [null, 0, 2, 1, 2, 0],
  min7: [null, 0, 2, 0, 1, 0],
};

const E_ROOT_PC = 4; // E
const A_ROOT_PC = 9; // A

/** Which curated shape (if any) covers this chord: root position only, and the five qualities
 *  with well-established movable barre shapes. Everything else falls back to the generator. */
function shapeQuality(chord: ChordRef): ShapeQuality | null {
  if (chord.bass) return null; // inversions: not covered by a root-position movable shape
  if (chord.flavor === 'triad') {
    return chord.quality === 'maj' ? 'maj' : chord.quality === 'min' ? 'min' : null;
  }
  if (chord.flavor === '7') {
    return chord.seventh === 'dom7' ? 'dom7' : chord.seventh === 'maj7' ? 'maj7' : chord.seventh === 'min7' ? 'min7' : null;
  }
  return null; // sus2 / sus4 / add9: no single well-established open shape, use the generator
}

function pcAt(stringIdx: number, fret: number): number {
  return ((STANDARD_TUNING[stringIdx] + fret) % 12 + 12) % 12;
}

function computeBaseFret(frets: (number | null)[]): number {
  const played = frets.filter((f): f is number => f !== null && f > 0);
  if (played.length === 0) return 1;
  const max = Math.max(...played);
  return max <= 4 ? 1 : Math.min(...played);
}

/** A curated movable E-shape/A-shape diagram, or null if this chord isn't covered (see `shapeQuality`). */
export function curatedGuitarShape(chord: ChordRef): GuitarShape | null {
  const quality = shapeQuality(chord);
  if (!quality) return null;
  const rootPc = chroma(chord.root);
  const shiftE = ((rootPc - E_ROOT_PC) % 12 + 12) % 12;
  const shiftA = ((rootPc - A_ROOT_PC) % 12 + 12) % 12;
  const useE = shiftE <= shiftA;
  const shift = useE ? shiftE : shiftA;
  const template = (useE ? E_SHAPE : A_SHAPE)[quality];
  const frets = template.map((f) => (f === null ? null : f + shift));
  return { frets, baseFret: computeBaseFret(frets), generated: false };
}

/** Fret choices for one string within a search window: its open note (if it's a chord tone),
 *  plus any fretted note in [windowStart, windowStart+4] that is one. */
function stringCandidates(stringIdx: number, windowStart: number, tones: Set<number>): number[] {
  const options: number[] = [];
  if (tones.has(pcAt(stringIdx, 0))) options.push(0);
  const lo = Math.max(1, windowStart);
  const hi = Math.min(12, windowStart + 4);
  for (let f = lo; f <= hi; f++) if (tones.has(pcAt(stringIdx, f))) options.push(f);
  return options;
}

interface Candidate {
  frets: (number | null)[];
  highest: number;
  fingers: number;
  played: number;
}

function better(a: Candidate, b: Candidate): boolean {
  if (a.highest !== b.highest) return a.highest < b.highest;
  if (a.fingers !== b.fingers) return a.fingers < b.fingers;
  return a.played > b.played;
}

/**
 * Search one 5-fret window (plus any open strings) for a playable shape: the bass note on the
 * lowest sounded string, at most 4 fretted fingers, a span of at most 4 frets, and (unless
 * `relaxed`) every chord tone represented at least once among the played strings.
 */
function searchWindow(windowStart: number, tones: Set<number>, bassPc: number, relaxed: boolean): Candidate | null {
  const perString = Array.from({ length: 6 }, (_, i) => stringCandidates(i, windowStart, tones));
  let best: Candidate | null = null;

  function evaluate(frets: (number | null)[]) {
    const playedIdx: number[] = [];
    frets.forEach((f, i) => f !== null && playedIdx.push(i));
    if (playedIdx.length < (relaxed ? 2 : 3)) return;
    const lowest = playedIdx[0];
    if (pcAt(lowest, frets[lowest] as number) !== bassPc) return;
    const sounded = new Set(playedIdx.map((i) => pcAt(i, frets[i] as number)));
    const minTones = relaxed ? Math.min(2, tones.size) : tones.size;
    if ([...tones].filter((t) => sounded.has(t)).length < minTones) return;
    const frettedVals = playedIdx.map((i) => frets[i] as number).filter((f) => f > 0);
    if (frettedVals.length > 4) return;
    if (frettedVals.length > 0 && Math.max(...frettedVals) - Math.min(...frettedVals) > 4) return;
    const candidate: Candidate = {
      frets,
      highest: frettedVals.length ? Math.max(...frettedVals) : 0,
      fingers: frettedVals.length,
      played: playedIdx.length,
    };
    if (!best || better(candidate, best)) best = candidate;
  }

  function dfs(stringIdx: number, current: (number | null)[]) {
    if (stringIdx === 6) {
      evaluate([...current]);
      return;
    }
    for (const choice of [null, ...perString[stringIdx]]) {
      current.push(choice);
      dfs(stringIdx + 1, current);
      current.pop();
    }
  }
  dfs(0, []);
  return best;
}

/** Last resort: mute everything except one string sounding the bass note, so a diagram is
 *  always returned even for chords no window search could otherwise satisfy. */
function bassOnlyShape(bassPc: number): (number | null)[] {
  for (let f = 0; f <= 12; f++) {
    for (let s = 0; s < 6; s++) {
      if (pcAt(s, f) === bassPc) {
        const frets: (number | null)[] = [null, null, null, null, null, null];
        frets[s] = f;
        return frets;
      }
    }
  }
  return [null, null, null, null, null, null];
}

/**
 * Algorithmically generate a playable shape (section 9): search frets 0–12, up to 4 fretted
 * fingers, a maximum span of 4 frets, the required bass note on the lowest sounding string,
 * preferring shapes near the open position. Used for chords the curated shapes don't cover
 * (inversions, dim/aug, sus2/sus4/add9, and the rarer 7th types).
 */
export function generateGuitarShape(chord: ChordRef): GuitarShape {
  const tones = new Set(chordStack(chord).map((n) => chroma(n)));
  const bassPc = chroma(chord.bass ?? chord.root);

  for (const relaxed of [false, true]) {
    for (let windowStart = 0; windowStart <= 9; windowStart++) {
      const found = searchWindow(windowStart, tones, bassPc, relaxed);
      if (found) return { frets: found.frets, baseFret: computeBaseFret(found.frets), generated: true };
    }
  }
  const frets = bassOnlyShape(bassPc);
  return { frets, baseFret: computeBaseFret(frets), generated: true };
}

/** The diagram to show for `chord`: a curated movable shape when one covers it, else generated. */
export function guitarShapeFor(chord: ChordRef): GuitarShape {
  return curatedGuitarShape(chord) ?? generateGuitarShape(chord);
}
