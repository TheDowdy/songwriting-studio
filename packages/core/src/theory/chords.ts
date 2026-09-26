import { Note } from 'tonal';
import { chroma, fmt, scaleNotes } from './scales';
import { chordNumeral, numeralFor } from './numerals';
import type { ChordColour, ChordRef, Flavor, Key, Origin, Quality, Seventh } from './types';

const TRIAD_INTERVALS: Record<Quality, [string, string]> = {
  maj: ['3M', '5P'],
  min: ['3m', '5P'],
  dim: ['3m', '5d'],
  aug: ['3M', '5A'],
};

const SEVENTH_INTERVAL: Record<Seventh, string> = {
  maj7: '7M',
  dom7: '7m',
  min7: '7m',
  minMaj7: '7M',
  m7b5: '7m',
  dim7: '7d',
  augMaj7: '7M',
  aug7: '7m',
};

const TRIAD_SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dim: 'dim', aug: 'aug' };

const SEVENTH_SUFFIX: Record<Seventh, string> = {
  maj7: 'maj7',
  dom7: '7',
  min7: 'm7',
  minMaj7: 'mMaj7',
  m7b5: 'm7♭5',
  dim7: 'dim7',
  augMaj7: 'augmaj7',
  aug7: 'aug7',
};

export const FLAVORS: Flavor[] = ['triad', '7', 'sus2', 'sus4', 'add9'];

/** The 7th type that stacks naturally on a triad quality (used when the scale doesn't decide). */
export function defaultSeventh(quality: Quality): Seventh {
  return { maj: 'maj7', min: 'min7', dim: 'm7b5', aug: 'augMaj7' }[quality] as Seventh;
}

const semitonesUp = (from: string, to: string) => (chroma(to) - chroma(from) + 12) % 12;

function qualityFromSemitones(third: number, fifth: number): Quality {
  if (third === 4 && fifth === 8) return 'aug';
  if (third === 4) return 'maj';
  if (fifth === 6) return 'dim';
  return 'min';
}

function seventhFromSemitones(quality: Quality, seventh: number): Seventh {
  const table: Record<string, Seventh> = {
    'maj:11': 'maj7',
    'maj:10': 'dom7',
    'min:10': 'min7',
    'min:11': 'minMaj7',
    'dim:10': 'm7b5',
    'dim:9': 'dim7',
    'aug:11': 'augMaj7',
    'aug:10': 'aug7',
  };
  return table[`${quality}:${seventh}`] ?? defaultSeventh(quality);
}

/**
 * The chord tones in stack order, root first (root position). Inversion i puts stack[i] in the bass.
 * sus chords replace the third; add9 appends the 9th on top (it is never a bass note).
 */
export function chordStack(chord: Pick<ChordRef, 'root' | 'quality' | 'seventh' | 'flavor'>): string[] {
  const [third, fifth] = TRIAD_INTERVALS[chord.quality];
  const t = (interval: string) => Note.transpose(chord.root, interval);
  switch (chord.flavor) {
    case 'triad':
      return [chord.root, t(third), t(fifth)];
    case '7':
      return [chord.root, t(third), t(fifth), t(SEVENTH_INTERVAL[chord.seventh])];
    case 'sus2':
      return [chord.root, t('2M'), t(fifth)];
    case 'sus4':
      return [chord.root, t('4P'), t(fifth)];
    case 'add9':
      return [chord.root, t(third), t(fifth), t('9M')];
  }
}

/** How many inversions the chord can take, including root position (3 for triads, 4 for 7ths). */
export function inversionCount(chord: Pick<ChordRef, 'flavor'>): number {
  return chord.flavor === '7' ? 4 : 3;
}

/** Inversion index of the chord (0 = root position). */
export function inversionOf(chord: ChordRef): number {
  if (!chord.bass) return 0;
  const idx = chordStack(chord).findIndex((n) => chroma(n) === chroma(chord.bass!));
  return idx < 0 || idx >= inversionCount(chord) ? 0 : idx;
}

/** The spelled pitch classes of the chord, root position order. */
export function chordNotes(chord: ChordRef): string[] {
  return chordStack(chord);
}

/** The role each `chordStack` slot plays, in the same order chordStack returns them. */
function stackFamilies(flavor: Flavor): string[] {
  switch (flavor) {
    case 'triad':
      return ['root', 'third', 'fifth'];
    case '7':
      return ['root', 'third', 'fifth', 'seventh'];
    case 'sus2':
    case 'sus4':
      return ['root', 'sus', 'fifth'];
    case 'add9':
      return ['root', 'third', 'fifth', 'nine'];
  }
}

const ALT_FAMILY: Record<string, string> = {
  b5: 'fifth',
  '#5': 'fifth',
  b9: 'nine',
  '#9': 'nine',
  '#11': 'eleven',
  b13: 'thirteen',
};

const ALT_INTERVAL: Record<string, string> = {
  b5: '5d',
  '#5': '5A',
  b9: '9m',
  '#9': '9A',
  '#11': '11A',
  b13: '13m',
};

/**
 * The chord's spelled tones including colour (§3.1): replaces direct `chordStack` use outside
 * theory. Independent of `toChordSpec`/`describeChord` — computed straight from the chord's own
 * intervals, so the two can be cross-checked against each other in tests.
 */
export function chordTones(chord: ChordRef): string[] {
  const stack = chordStack(chord);
  const families = stackFamilies(chord.flavor);
  const t = (interval: string) => Note.transpose(chord.root, interval);
  let entries = stack.map((note, i) => ({ family: families[i] as string, note }));

  const c = chord.colour;
  if (c) {
    if (c.sixth) {
      entries.push({ family: 'sixth', note: t('6M') });
      if (c.sixth === '6/9') entries.push({ family: 'nine', note: t('9M') });
    }
    if (c.extension === '9') entries.push({ family: 'nine', note: t('9M') });
    if (c.extension === '11') {
      entries.push({ family: 'nine', note: t('9M') }, { family: 'eleven', note: t('11P') });
    }
    if (c.extension === '13') {
      entries.push(
        { family: 'nine', note: t('9M') },
        { family: 'eleven', note: t('11P') },
        { family: 'thirteen', note: t('13M') },
      );
    }
    for (const alt of c.alterations ?? []) {
      entries = entries.filter((e) => e.family !== ALT_FAMILY[alt]);
      entries.push({ family: ALT_FAMILY[alt] as string, note: t(ALT_INTERVAL[alt] as string) });
    }
    for (const added of c.added ?? []) {
      entries.push({
        family: added === 'add11' ? 'eleven' : 'thirteen',
        note: t(added === 'add11' ? '11P' : '13M'),
      });
    }
    if (c.omit3) entries = entries.filter((e) => e.family !== 'third' && e.family !== 'sus');
    if (c.omit5) entries = entries.filter((e) => e.family !== 'fifth');
  }

  let tones = entries.map((e) => e.note);
  if (chord.bass && !tones.some((n) => chroma(n) === chroma(chord.bass as string))) {
    tones = [...tones, chord.bass];
  }
  return tones;
}

/** Display name, e.g. 'B♭', 'F♯m7', 'Csus4', 'C/E'. */
export function chordName(chord: ChordRef): string {
  let suffix: string;
  switch (chord.flavor) {
    case 'triad':
      suffix = TRIAD_SUFFIX[chord.quality];
      break;
    case '7':
      suffix = SEVENTH_SUFFIX[chord.seventh];
      break;
    case 'sus2':
    case 'sus4':
      suffix = chord.flavor;
      break;
    case 'add9':
      suffix = `${TRIAD_SUFFIX[chord.quality]}add9`;
      break;
  }
  const bass = chord.bass && chroma(chord.bass) !== chroma(chord.root) ? `/${fmt(chord.bass)}` : '';
  return `${fmt(chord.root)}${suffix}${bass}`;
}

function colourKey(colour: ChordColour | undefined): string {
  if (!colour) return '';
  const parts = [
    colour.sixth ?? '',
    colour.extension ?? '',
    (colour.alterations ?? []).join(','),
    (colour.added ?? []).join(','),
    colour.omit3 ? '3' : '',
    colour.omit5 ? '5' : '',
  ];
  return parts.some(Boolean) ? parts.join(',') : '';
}

/** A stable identity string, useful for React keys and de-duplication. Colour changes the
 *  identity (a plain chord has an empty colour segment, so existing keys are unaffected). */
export function chordKey(chord: ChordRef): string {
  const isSeventh = chord.flavor === '7';
  const base = [chord.root, chord.quality, isSeventh ? chord.seventh : '', chord.flavor, chord.bass ?? ''].join('|');
  const colour = colourKey(chord.colour);
  return colour ? `${base}|${colour}` : base;
}

export function sameChord(a: ChordRef, b: ChordRef): boolean {
  return chordKey(a) === chordKey(b);
}

export interface ChordSpec {
  root: string;
  quality: Quality;
  seventh?: Seventh;
  flavor?: Flavor;
  bass?: string;
  origin?: Origin;
}

/** Build a ChordRef with its numeral computed for the key. */
export function buildChord(spec: ChordSpec, key: Key): ChordRef {
  const partial = {
    root: spec.root,
    quality: spec.quality,
    seventh: spec.seventh ?? defaultSeventh(spec.quality),
    flavor: spec.flavor ?? ('triad' as Flavor),
    bass: spec.bass,
    origin: spec.origin ?? ('diatonic' as Origin),
  };
  const chord: ChordRef = { ...partial, numeral: '' };
  chord.numeral = labelFor(chord, key, inversionOf(chord));
  return chord;
}

/** The diatonic chord on scale degree `degree` (0–6), built by stacking thirds from the scale. */
export function diatonicChord(key: Key, degree: number, flavor: Flavor = 'triad'): ChordRef {
  const notes = scaleNotes(key);
  const at = (i: number) => notes[(degree + i) % 7];
  const root = at(0);
  const quality = qualityFromSemitones(semitonesUp(root, at(2)), semitonesUp(root, at(4)));
  const seventh = seventhFromSemitones(quality, semitonesUp(root, at(6)));
  return buildChord({ root, quality, seventh, flavor }, key);
}

export function diatonicChords(key: Key, flavor: Flavor = 'triad'): ChordRef[] {
  return Array.from({ length: 7 }, (_, d) => diatonicChord(key, d, flavor));
}

/**
 * The numeral for a secondary-dominant-shaped chord, e.g. 'V/V', 'V7/vi': a major triad a fifth
 * above some diatonic major or minor degree (other than I). Null if the chord isn't shaped that
 * way, so callers can fall back to the ordinary numeral.
 */
export function secondaryNumeral(chord: Pick<ChordRef, 'root' | 'quality' | 'flavor'>, key: Key): string | null {
  if (chord.quality !== 'maj') return null;
  const candidateRoot = Note.transpose(chord.root, '-5P');
  for (let degree = 1; degree < 7; degree++) {
    const target = diatonicChord(key, degree);
    if ((target.quality === 'maj' || target.quality === 'min') && chroma(target.root) === chroma(candidateRoot)) {
      const targetNumeral = numeralFor({ ...target, flavor: 'triad' }, key, 0);
      return `V${chord.flavor === '7' ? '7' : ''}/${targetNumeral}`;
    }
  }
  return null;
}

function labelFor(chord: ChordRef, key: Key, inversion: number): string {
  if (chord.origin === 'secondary') return secondaryNumeral(chord, key) ?? numeralFor(chord, key, inversion);
  return chordNumeral(chord, key, inversion);
}

/** Recompute numeral (and origin, unless it is 'secondary') after the key or chord shape changed. */
export function relabel(chord: ChordRef, key: Key): ChordRef {
  const next: ChordRef = { ...chord };
  if (chord.origin !== 'secondary') {
    const notes = scaleNotes(key);
    const deg = notes.findIndex((n) => chroma(n) === chroma(chord.root));
    const isDiatonic = deg >= 0 && diatonicChord(key, deg).quality === chord.quality;
    next.origin = isDiatonic ? 'diatonic' : 'borrowed';
  }
  next.numeral = labelFor(next, key, inversionOf(next));
  return next;
}

export function withFlavor(chord: ChordRef, flavor: Flavor, key: Key): ChordRef {
  const next: ChordRef = { ...chord, flavor, bass: undefined };
  next.numeral = labelFor(next, key, 0);
  return next;
}

/** Put chord tone `inversion` in the bass (0 clears it). Out-of-range values are clamped. */
export function withInversion(chord: ChordRef, inversion: number, key: Key): ChordRef {
  const n = Math.max(0, Math.min(inversion, inversionCount(chord) - 1));
  const next: ChordRef = { ...chord, bass: n === 0 ? undefined : chordStack(chord)[n] };
  next.numeral = labelFor(next, key, n);
  return next;
}

/** Shift a chord by an interval (e.g. '2M'), for transposing songs. Numeral is recomputed for `key`. */
export function transposeChord(chord: ChordRef, interval: string, key: Key): ChordRef {
  const moved: ChordRef = {
    ...chord,
    root: Note.transpose(chord.root, interval),
    bass: chord.bass ? Note.transpose(chord.bass, interval) : undefined,
  };
  return relabel(moved, key);
}
