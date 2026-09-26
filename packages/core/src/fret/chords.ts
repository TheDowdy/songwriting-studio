/**
 * Chord formula builder (PLAN.md §9.3): what a chord contains, whether a combination of options
 * is valid, how its notes are spelled, and its canonical name. Pure and framework-free.
 */
import {
  chromaticName,
  formatNoteName,
  LETTERS,
  pitchClass,
  spellOnLetter,
  type AccidentalPref,
  type NoteName,
} from './notes';

export type ChordQuality = 'major' | 'minor' | 'dim' | 'aug' | 'sus2' | 'sus4' | 'power';
export type ChordSeventh = 'none' | '6' | '7' | 'maj7' | 'dim7' | '6/9';
export type ChordExtension = 'none' | '9' | '11' | '13';
export type ChordAlteration = 'b5' | '#5' | 'b9' | '#9' | '#11' | 'b13';
export type ChordAdded = 'add9' | 'add11' | 'add13';

export interface ChordSpec {
  /** Root pitch class 0–11. */
  rootPc: number;
  quality: ChordQuality;
  seventh: ChordSeventh;
  extension: ChordExtension;
  alterations: readonly ChordAlteration[];
  added: readonly ChordAdded[];
  omit3: boolean;
  omit5: boolean;
  /** Slash-chord bass pitch class, or null. */
  bassPc: number | null;
}

export const DEFAULT_CHORD: ChordSpec = {
  rootPc: 4,
  quality: 'major',
  seventh: 'none',
  extension: 'none',
  alterations: [],
  added: [],
  omit3: false,
  omit5: false,
  bassPc: null,
};

export const QUALITIES: readonly { id: ChordQuality; label: string }[] = [
  { id: 'major', label: 'Major' },
  { id: 'minor', label: 'Minor' },
  { id: 'dim', label: 'Diminished' },
  { id: 'aug', label: 'Augmented' },
  { id: 'sus2', label: 'Sus2' },
  { id: 'sus4', label: 'Sus4' },
  { id: 'power', label: 'Power (5)' },
];
export const SEVENTHS: readonly { id: ChordSeventh; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: '6', label: '6' },
  { id: '7', label: '7 (♭7)' },
  { id: 'maj7', label: 'Major 7' },
  { id: 'dim7', label: 'Diminished 7' },
  { id: '6/9', label: '6/9' },
];
export const EXTENSIONS: readonly { id: ChordExtension; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: '9', label: '9' },
  { id: '11', label: '11' },
  { id: '13', label: '13' },
];
export const ALTERATIONS: readonly ChordAlteration[] = ['b5', '#5', 'b9', '#9', '#11', 'b13'];
export const ADDED: readonly ChordAdded[] = ['add9', 'add11', 'add13'];

// ------------------------------------------------------------------ intervals

interface IntervalDef {
  label: string;
  semitones: number;
  /** Letter steps above the root letter (for spelling): 3rd = 2, 5th = 4, 9th = 1 … */
  steps: number;
  /** Interval number (1, 3, 5, 7, 9, 11, 13) for ordering. */
  number: number;
}

const def = (label: string, semitones: number, steps: number, number: number): IntervalDef => ({
  label,
  semitones,
  steps,
  number,
});

const INTERVALS: Record<string, IntervalDef> = {
  '1': def('1', 0, 0, 1),
  '2': def('2', 2, 1, 2),
  b3: def('♭3', 3, 2, 3),
  '3': def('3', 4, 2, 3),
  '4': def('4', 5, 3, 4),
  b5: def('♭5', 6, 4, 5),
  '5': def('5', 7, 4, 5),
  '#5': def('♯5', 8, 4, 5),
  '6': def('6', 9, 5, 6),
  bb7: def('𝄫7', 9, 6, 7),
  b7: def('♭7', 10, 6, 7),
  '7': def('7', 11, 6, 7),
  b9: def('♭9', 1, 1, 9),
  '9': def('9', 2, 1, 9),
  '#9': def('♯9', 3, 1, 9),
  '11': def('11', 5, 3, 11),
  '#11': def('♯11', 6, 3, 11),
  b13: def('♭13', 8, 5, 13),
  '13': def('13', 9, 5, 13),
};

/** Labels and letter steps for a bass note that isn't otherwise part of the chord. */
const CHROMATIC_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♯5', '6', '♭7', '7'];
const CHROMATIC_STEPS = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

export type ToneKind =
  'root' | 'third' | 'sus' | 'fifth' | 'sixth' | 'seventh' | 'extension' | 'bass';

/** A chord tone before spelling. */
export interface ChordTone {
  /** Identifier in the interval table, e.g. "b7". */
  id: string;
  /** Display label, e.g. "♭7". */
  label: string;
  semitones: number;
  steps: number;
  number: number;
  /** Must sound for the chord to read as this chord; optional tones may be left out of a voicing. */
  required: boolean;
  kind: ToneKind;
}

const ALTERATION_FAMILY: Record<ChordAlteration, string> = {
  b5: '5',
  '#5': '5',
  b9: '9',
  '#9': '9',
  '#11': '11',
  b13: '13',
};

/** The tones of a chord (excluding any bass note), ordered by interval. */
export function resolveTones(spec: ChordSpec): ChordTone[] {
  const tones = new Map<string, ChordTone>();
  const add = (id: string, required: boolean, kind: ToneKind) => {
    const interval = INTERVALS[id] as IntervalDef;
    // A tone the chord already has under another name (a sus4's 4th is the 11th) isn't repeated.
    for (const t of tones.values()) if (t.semitones === interval.semitones && t.id !== id) return;
    tones.set(id, { ...interval, id, required, kind });
  };
  const hasExtension = spec.extension !== 'none';

  add('1', true, 'root');
  // Beyond a triad the 5th is optional in voicings (§0); a bare triad needs it.
  switch (spec.quality) {
    case 'major':
      add('3', true, 'third');
      add('5', !hasExtension, 'fifth');
      break;
    case 'minor':
      add('b3', true, 'third');
      add('5', !hasExtension, 'fifth');
      break;
    case 'dim':
      add('b3', true, 'third');
      add('b5', true, 'fifth');
      break;
    case 'aug':
      add('3', true, 'third');
      add('#5', true, 'fifth');
      break;
    case 'sus2':
      add('2', true, 'sus');
      add('5', !hasExtension, 'fifth');
      break;
    case 'sus4':
      add('4', true, 'sus');
      add('5', !hasExtension, 'fifth');
      break;
    case 'power':
      add('5', true, 'fifth');
      break;
  }

  switch (spec.seventh) {
    case '6':
      add('6', true, 'sixth');
      break;
    case '7':
      add('b7', true, 'seventh');
      break;
    case 'maj7':
      add('7', true, 'seventh');
      break;
    case 'dim7':
      add('bb7', true, 'seventh');
      break;
    case '6/9':
      add('6', true, 'sixth');
      add('9', true, 'extension');
      break;
    case 'none':
      // A 9th/11th/13th chord implies a (dominant-style) seventh.
      if (hasExtension) add('b7', true, 'seventh');
      break;
  }

  if (spec.extension === '9') add('9', true, 'extension');
  if (spec.extension === '11') {
    add('9', false, 'extension');
    add('11', true, 'extension');
  }
  if (spec.extension === '13') {
    add('9', false, 'extension');
    add('11', false, 'extension');
    add('13', true, 'extension');
  }

  // An alteration replaces the natural tone of the same degree.
  for (const alteration of spec.alterations) {
    tones.delete(ALTERATION_FAMILY[alteration]);
    add(alteration, true, ALTERATION_FAMILY[alteration] === '5' ? 'fifth' : 'extension');
  }
  for (const added of spec.added) add(added.slice(3), true, 'extension');

  if (spec.omit3) {
    tones.delete('3');
    tones.delete('b3');
  }
  if (spec.omit5) tones.delete('5');

  return [...tones.values()].sort((a, b) => a.number - b.number || a.semitones - b.semitones);
}

// ------------------------------------------------------------------ validation

const has = <T>(list: readonly T[], item: T) => list.includes(item);

/**
 * Why this combination of options isn't a sensible chord, or null if it is. The UI disables
 * options that would make a spec invalid and shows the reason as a tooltip.
 */
export function validateChord(spec: ChordSpec): string | null {
  const { quality: q, seventh: s, extension: e, alterations: alts, added, omit3, omit5 } = spec;
  const sus = q === 'sus2' || q === 'sus4';
  const hasSeventh = s === '7' || s === 'maj7' || s === 'dim7';
  const sixth = s === '6' || s === '6/9';

  if (s === 'dim7' && q !== 'dim') return 'A diminished 7th only belongs on a diminished chord.';
  if (q === 'dim' && sixth) return 'A diminished 6th chord is a diminished 7th — use Diminished 7.';
  if (q === 'power') {
    if (s !== 'none') return 'A power chord is just the root and 5th, so it takes no 6th or 7th.';
    if (e !== 'none') return 'A power chord is just the root and 5th, so it takes no extension.';
    if (alts.length > 0) return 'A power chord has no alterations.';
    if (added.length > 0) return 'A power chord takes no added tones.';
    if (omit3) return 'A power chord has no 3rd to omit.';
    if (omit5) return 'Omitting the 5th would leave only the root.';
  }
  if (sus && omit3) return 'A suspended chord has no 3rd to omit.';
  if (omit3 && omit5) return 'Omitting both the 3rd and the 5th leaves too little of the chord.';

  if (e !== 'none') {
    if (s === 'dim7') return 'Extensions aren’t used on a diminished 7th.';
    if (sixth && e !== '9') return 'A 6th chord can only be extended to the 9th (6/9).';
    if (s === '6/9' && e === '9') return '6/9 already contains the 9th.';
    if (q === 'sus2' && e === '9') return 'Sus2 already contains the 9th (the 2nd).';
    if (q === 'sus4' && e === '11') return 'Sus4 already contains the 11th (the 4th).';
  }

  for (const a of alts) {
    if (a === 'b5' || a === '#5') {
      if (q === 'aug' && a === '#5') return 'An augmented chord already has a ♯5.';
      if (q === 'aug' && a === 'b5') return 'An augmented chord can’t also have a ♭5.';
      if (q === 'dim' && a === 'b5') return 'A diminished chord already has a ♭5.';
      if (q === 'dim' && a === '#5') return 'A diminished chord can’t also have a ♯5.';
      if (omit5) return 'The 5th is omitted, so it can’t be altered.';
    } else if (!hasSeventh && e === 'none') {
      return `${a.replace('b', '♭').replace('#', '♯')} needs a 7th or an extension to alter.`;
    }
    if (a === 'b9' || a === '#9') {
      if (e === '9')
        return 'The 9 extension already contains the 9th — pick a 7th chord to alter it.';
      if (sixth) return '6/9 chords have a natural 9th.';
    }
    if (a === '#9' && (q === 'minor' || q === 'dim'))
      return '♯9 is the same note as the minor 3rd.';
    if (a === '#11' && e === '11')
      return 'The 11 extension already contains the 11th — choose 9 or 13.';
    if (a === '#11' && has(alts, 'b5')) return '♯11 is the same note as ♭5.';
    if (a === 'b13' && e === '13') return 'The 13 extension already contains the 13th.';
    if (a === 'b13' && (has(alts, '#5') || q === 'aug')) return '♭13 is the same note as ♯5.';
    if (a === 'b13' && sixth) return '6th chords already contain the 6th (13th).';
  }
  if (has(alts, 'b5') && has(alts, '#5')) return '♭5 and ♯5 can’t be combined.';
  if (has(alts, 'b9') && has(alts, '#9')) return '♭9 and ♯9 can’t be combined.';

  if (added.length > 0) {
    if (s !== 'none' || e !== 'none')
      return 'Added tones are for chords without a 7th or extension.';
    if (has(added, 'add9') && q === 'sus2') return 'Sus2 already contains the 9th (the 2nd).';
    if (has(added, 'add11') && q === 'sus4') return 'Sus4 already contains the 11th (the 4th).';
  }
  return null;
}

/** Puts the multi-select lists in canonical order and drops duplicates. */
export function normalizeChord(spec: ChordSpec): ChordSpec {
  return {
    ...spec,
    rootPc: pitchClass(spec.rootPc),
    alterations: ALTERATIONS.filter((a) => spec.alterations.includes(a)),
    added: ADDED.filter((a) => spec.added.includes(a)),
    bassPc:
      spec.bassPc === null || pitchClass(spec.bassPc) === pitchClass(spec.rootPc)
        ? null
        : pitchClass(spec.bassPc),
  };
}

/** Storage / URL input: a valid spec, or the default. */
export function sanitizeChord(x: unknown): ChordSpec {
  if (typeof x !== 'object' || x === null) return DEFAULT_CHORD;
  const r = x as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, options: readonly { id: T }[], fallback: T): T =>
    options.some((o) => o.id === v) ? (v as T) : fallback;
  const list = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
    Array.isArray(v) ? allowed.filter((a) => v.includes(a)) : [];
  const pc = (v: unknown) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < 12 ? (v as number) : null;
  const spec = normalizeChord({
    rootPc: pc(r['rootPc']) ?? DEFAULT_CHORD.rootPc,
    quality: pick(r['quality'], QUALITIES, 'major'),
    seventh: pick(r['seventh'], SEVENTHS, 'none'),
    extension: pick(r['extension'], EXTENSIONS, 'none'),
    alterations: list(r['alterations'], ALTERATIONS),
    added: list(r['added'], ADDED),
    omit3: r['omit3'] === true,
    omit5: r['omit5'] === true,
    bassPc: pc(r['bassPc']),
  });
  return validateChord(spec) ? { ...DEFAULT_CHORD, rootPc: spec.rootPc } : spec;
}

// ------------------------------------------------------------------ naming

const ALTERATION_TEXT: Record<ChordAlteration, string> = {
  b5: '♭5',
  '#5': '♯5',
  b9: '♭9',
  '#9': '♯9',
  '#11': '♯11',
  b13: '♭13',
};

/** The chord's name after the root note, and before any slash bass, e.g. "maj7♯11". */
export function chordSuffix(spec: ChordSpec): string {
  const { quality: q, seventh: s, extension: e } = spec;
  if (q === 'power') return '5';

  let num: string;
  let maj = false;
  if (s === '6/9' || (s === '6' && e === '9')) num = '6/9';
  else if (s === '6') num = '6';
  else if (s === 'dim7') num = '7';
  else {
    maj = s === 'maj7';
    num = e !== 'none' ? e : s === '7' || s === 'maj7' ? '7' : '';
  }
  const majNum = maj ? `maj${num}` : num;

  let head: string;
  switch (q) {
    case 'major':
      head = majNum;
      break;
    case 'minor':
      head = maj ? `m(maj${num})` : `m${num}`;
      break;
    case 'dim':
      head =
        s === 'dim7'
          ? 'dim7'
          : num === ''
            ? 'dim'
            : maj
              ? `dim(maj${num})`
              : num === '6' || num === '6/9'
                ? `dim${num}`
                : `m${num}♭5`; // half-diminished
      break;
    case 'aug':
      head = num === '' ? 'aug' : `${majNum}♯5`;
      break;
    default:
      head = `${majNum}${q}`; // sus2 / sus4
  }

  const alts = ALTERATIONS.filter((a) => spec.alterations.includes(a)).map(
    (a) => ALTERATION_TEXT[a],
  );
  const altText =
    alts.length === 0 ? '' : alts.length === 1 ? (alts[0] as string) : `(${alts.join(',')})`;
  const addText = spec.added.length > 0 ? `add${spec.added.map((a) => a.slice(3)).join(',')}` : '';
  const omitText = `${spec.omit3 ? '(no3)' : ''}${spec.omit5 ? '(no5)' : ''}`;
  return `${head}${altText}${addText}${omitText}`;
}

// ------------------------------------------------------------------ spelling

export interface SpelledTone extends ChordTone {
  pc: number;
  name: NoteName;
}

export interface ChordInfo {
  spec: ChordSpec;
  root: NoteName;
  /** Root name + suffix + slash bass, e.g. "C♯m7♭5/G". */
  name: string;
  /** Ordered by interval; a bass note that isn't part of the chord comes last. */
  tones: SpelledTone[];
  /** The slash-bass tone (which may also appear in `tones`), or null. */
  bass: SpelledTone | null;
  /** Space-separated interval labels, e.g. "1 3 5 ♭7 ♯9". */
  formula: string;
  /** Pitch classes present, in tone order. */
  pcs: number[];
}

function spellTone(
  rootName: NoteName,
  rootPc: number,
  tone: ChordTone,
  pref: AccidentalPref,
): NoteName {
  const rootLetter = LETTERS.indexOf(rootName.letter);
  const letter = LETTERS[(rootLetter + tone.steps) % 7] as (typeof LETTERS)[number];
  const pc = pitchClass(rootPc + tone.semitones);
  return spellOnLetter(pc, letter) ?? chromaticName(pc, pref);
}

/** The root spelling (e.g. B♭ vs A♯) that keeps the chord free of double accidentals. */
export function chordRootName(spec: ChordSpec, pref: AccidentalPref = 'sharp'): NoteName {
  const preferred = chromaticName(spec.rootPc, pref);
  const sharp = chromaticName(spec.rootPc, 'sharp');
  const flat = chromaticName(spec.rootPc, 'flat');
  if (sharp.letter === flat.letter && sharp.acc === flat.acc) return preferred;
  const tones = resolveTones(spec);
  const cost = (root: NoteName) => {
    let total = 0;
    for (const t of tones) {
      const acc = Math.abs(spellTone(root, spec.rootPc, t, pref).acc);
      total += acc > 1 ? 100 : acc;
    }
    return total + Math.abs(root.acc);
  };
  const diff = cost(sharp) - cost(flat);
  return diff < 0 ? sharp : diff > 0 ? flat : preferred;
}

/** Full description of a chord: name, spelled tones, formula. */
export function describeChord(input: ChordSpec, pref: AccidentalPref = 'sharp'): ChordInfo {
  const spec = normalizeChord(input);
  const root = chordRootName(spec, pref);
  const tones: SpelledTone[] = resolveTones(spec).map((t) => ({
    ...t,
    pc: pitchClass(spec.rootPc + t.semitones),
    name: spellTone(root, spec.rootPc, t, pref),
  }));

  let bass: SpelledTone | null = null;
  if (spec.bassPc !== null) {
    const existing = tones.find((t) => t.pc === spec.bassPc);
    if (existing) bass = existing;
    else {
      const semis = pitchClass(spec.bassPc - spec.rootPc);
      bass = {
        id: `bass${semis}`,
        label: CHROMATIC_LABELS[semis] as string,
        semitones: semis,
        steps: CHROMATIC_STEPS[semis] as number,
        number: (CHROMATIC_STEPS[semis] as number) + 1,
        required: true,
        kind: 'bass',
        pc: spec.bassPc,
        name: chromaticName(spec.bassPc, pref),
      };
      tones.push(bass);
    }
  }

  const name = `${formatNoteName(root)}${chordSuffix(spec)}${bass ? `/${formatNoteName(bass.name)}` : ''}`;
  return {
    spec,
    root,
    name,
    tones,
    bass,
    formula: tones.map((t) => t.label).join(' '),
    pcs: tones.map((t) => t.pc),
  };
}

/** Interval label for a number of semitones above the root: "R", "♭3", "5", … */
export function intervalLabel(semitones: number): string {
  const semis = pitchClass(semitones);
  return semis === 0 ? 'R' : (CHROMATIC_LABELS[semis] as string);
}

/** Shorthand used for the interval-label display: "R" for the root, else the interval. */
export function toneShortLabel(tone: ChordTone): string {
  return tone.kind === 'root' ? 'R' : tone.label;
}
