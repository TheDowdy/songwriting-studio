/**
 * Chord identification (PLAN.md §9.4): from sounding notes to a best name plus alternatives.
 * The template library is generated from the chord builder, so it recognises everything the
 * builder can make, including forms with an omitted 5th (or omitted lower extensions).
 */
import {
  ADDED,
  ALTERATIONS,
  describeChord,
  intervalLabel,
  toneShortLabel,
  EXTENSIONS,
  QUALITIES,
  resolveTones,
  SEVENTHS,
  validateChord,
  type ChordSpec,
} from './chords';
import {
  chromaticName,
  formatNoteName,
  pitchClass,
  type AccidentalPref,
  type NoteName,
} from './notes';

export interface Identified {
  name: string;
  rootPc: number;
  /** Lowest sounding note. */
  bassPc: number;
  /** The chord spec (root and bass filled in) when this is a chord, so it can be loaded into the builder. */
  spec: ChordSpec | null;
  /** Lower is a better reading. */
  score: number;
  kind: 'chord' | 'power' | 'interval' | 'note';
}

interface Template {
  /** Relative to root C, no bass. */
  spec: ChordSpec;
  cost: number;
}

/** Score added when the lowest note isn't the root (a slash chord). */
const SLASH_PENALTY = 3;
/** Score for each optional tone left out of a template match. */
const OMITTED_PENALTY = 1.5;
/** Alternatives scoring this much worse than the best reading are noise, not options. */
const ALTERNATIVE_WINDOW = 5;
const MAX_ALTERNATIVES = 5;

const QUALITY_COST: Record<string, number> = {
  major: 0,
  minor: 0,
  dim: 1,
  aug: 1,
  sus2: 1.5,
  sus4: 1.5,
  power: 0.5,
};
const SEVENTH_COST: Record<string, number> = {
  none: 0,
  '7': 1,
  maj7: 1,
  '6': 1.2,
  dim7: 1.5,
  '6/9': 2.2,
};
const EXTENSION_COST: Record<string, number> = { none: 0, '9': 2, '11': 3, '13': 4 };

/** How exotic a spec is: common chords are preferred over unusual readings of the same notes. */
function complexity(spec: ChordSpec): number {
  return (
    (QUALITY_COST[spec.quality] as number) +
    (SEVENTH_COST[spec.seventh] as number) +
    (EXTENSION_COST[spec.extension] as number) +
    spec.alterations.length * 3.5 +
    spec.added.length * 2 +
    (spec.omit3 ? 4 : 0) +
    (spec.omit5 ? 3 : 0)
  );
}

const popcount = (n: number) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
};

let library: Map<number, Template> | null = null;

/** mask (bit n = semitone n above the root) → cheapest template. Built on first use. */
function getLibrary(): Map<number, Template> {
  if (library) return library;
  const lib = new Map<number, Template>();
  const consider = (mask: number, spec: ChordSpec, cost: number) => {
    if (popcount(mask) < 3) return; // one and two notes aren't chords (handled separately)
    const existing = lib.get(mask);
    if (!existing || cost < existing.cost) lib.set(mask, { spec, cost });
  };

  for (const quality of QUALITIES) {
    for (const seventh of SEVENTHS) {
      for (const extension of EXTENSIONS) {
        for (let altBits = 0; altBits < 1 << ALTERATIONS.length; altBits++) {
          const alterations = ALTERATIONS.filter((_, i) => altBits & (1 << i));
          for (let addBits = 0; addBits < 1 << ADDED.length; addBits++) {
            const added = ADDED.filter((_, i) => addBits & (1 << i));
            for (let omit = 0; omit < 3; omit++) {
              const spec: ChordSpec = {
                rootPc: 0,
                quality: quality.id,
                seventh: seventh.id,
                extension: extension.id,
                alterations,
                added,
                omit3: omit === 1,
                omit5: omit === 2,
                bassPc: null,
              };
              if (validateChord(spec)) continue;
              const tones = resolveTones(spec);
              const base = complexity(spec);
              // Players routinely leave the 5th out of anything beyond a triad, so it may be
              // missing from what is sounded even where the builder counts it as required.
              const optional = tones.filter(
                (t) => !t.required || (t.id === '5' && tones.length >= 4),
              );
              // Each subset of the optional tones may be left out of the notes actually played.
              for (let skip = 0; skip < 1 << optional.length; skip++) {
                let mask = 0;
                let omitted = 0;
                for (const t of tones) {
                  const i = optional.indexOf(t);
                  if (i >= 0 && skip & (1 << i)) omitted++;
                  else mask |= 1 << t.semitones;
                }
                consider(mask, spec, base + omitted * OMITTED_PENALTY);
              }
            }
          }
        }
      }
    }
  }
  library = lib;
  return lib;
}

const INTERVAL_NAMES = [
  'Unison',
  'Minor 2nd',
  'Major 2nd',
  'Minor 3rd',
  'Major 3rd',
  'Perfect 4th',
  'Tritone',
  'Perfect 5th',
  'Minor 6th',
  'Major 6th',
  'Minor 7th',
  'Major 7th',
];

/**
 * Names the chord made by `midiNotes` (any order, duplicates fine). The lowest note is the bass.
 * Returns readings best-first; the first is the best name, the rest are alternatives
 * (e.g. C6 with Am7/C). Empty when nothing sounds or the notes fit no chord.
 */
export function identifyChord(
  midiNotes: readonly number[],
  pref: AccidentalPref = 'sharp',
): Identified[] {
  if (midiNotes.length === 0) return [];
  const bassPc = pitchClass(Math.min(...midiNotes));
  const pcs = [...new Set(midiNotes.map((m) => pitchClass(m)))];
  const name = (pc: number) => formatNoteName(chromaticName(pc, pref));

  if (pcs.length === 1) {
    return [{ name: name(bassPc), rootPc: bassPc, bassPc, spec: null, score: 0, kind: 'note' }];
  }

  if (pcs.length === 2) {
    const other = pcs.find((p) => p !== bassPc) as number;
    const up = pitchClass(other - bassPc);
    if (up === 7) {
      // Root and 5th: a power chord.
      const spec: ChordSpec = { ...powerSpec(bassPc) };
      return [
        {
          name: describeChord(spec, pref).name,
          rootPc: bassPc,
          bassPc,
          spec,
          score: 0,
          kind: 'power',
        },
      ];
    }
    if (up === 5) {
      // The upper note is the root, and the bass its 5th.
      const spec: ChordSpec = { ...powerSpec(other), bassPc };
      return [
        {
          name: describeChord(spec, pref).name,
          rootPc: other,
          bassPc,
          spec,
          score: 0.5,
          kind: 'power',
        },
      ];
    }
    return [
      {
        name: `${INTERVAL_NAMES[up]} (${name(bassPc)}–${name(other)})`,
        rootPc: bassPc,
        bassPc,
        spec: null,
        score: 0,
        kind: 'interval',
      },
    ];
  }

  const lib = getLibrary();
  const found: Identified[] = [];
  for (const rootPc of pcs) {
    let mask = 0;
    for (const pc of pcs) mask |= 1 << pitchClass(pc - rootPc);
    const template = lib.get(mask);
    if (!template) continue;
    const spec: ChordSpec = {
      ...template.spec,
      rootPc,
      bassPc: rootPc === bassPc ? null : bassPc,
    };
    found.push({
      name: describeChord(spec, pref).name,
      rootPc,
      bassPc,
      spec,
      score: template.cost + (rootPc === bassPc ? 0 : SLASH_PENALTY),
      kind: 'chord',
    });
  }
  found.sort((a, b) => a.score - b.score);
  const best = found[0];
  if (!best) return [];
  const unique = found.filter((f, i) => found.findIndex((g) => g.name === f.name) === i);
  return unique
    .filter((f) => f.score <= best.score + ALTERNATIVE_WINDOW)
    .slice(0, MAX_ALTERNATIVES + 1);
}

function powerSpec(rootPc: number): ChordSpec {
  return {
    rootPc,
    quality: 'power',
    seventh: 'none',
    extension: 'none',
    alterations: [],
    added: [],
    omit3: false,
    omit5: false,
    bassPc: null,
  };
}

/** Number of distinct pitch classes needed for a chord reading (exposed for tests). */
export function libraryStats(): { masks: number; sizes: number[] } {
  const lib = getLibrary();
  const sizes = [...lib.keys()].map(popcount);
  return { masks: lib.size, sizes };
}

export interface SoundingNote {
  midi: number;
  /** Spelled for the chord that was identified (B♭, not A♯, in F). */
  name: NoteName;
  /** Interval above the identified root: "R", "3", "♭7"… */
  interval: string;
}

/**
 * The sounding notes, lowest first, spelled and labelled by their function in `reading` (or, when
 * there is no chord reading, by their distance above the bass note).
 */
export function spellSounding(
  midiNotes: readonly number[],
  reading: Identified | undefined,
  pref: AccidentalPref = 'sharp',
): SoundingNote[] {
  const sorted = [...midiNotes].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const rootPc = reading?.rootPc ?? pitchClass(sorted[0] as number);
  const tones = reading?.spec ? describeChord(reading.spec, pref).tones : [];
  return sorted.map((midi) => {
    const pc = pitchClass(midi);
    const tone = tones.find((t) => t.pc === pc);
    return {
      midi,
      name: tone?.name ?? chromaticName(pc, pref),
      interval: tone ? toneShortLabel(tone) : intervalLabel(pc - rootPc),
    };
  });
}
