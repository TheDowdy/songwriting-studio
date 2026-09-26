/**
 * Bridges PB's chord model (`ChordRef`, theory/) and FF's (`ChordSpec`, fret/) so both engines
 * agree on what a chord sounds like and is called. This is the safety net for the whole project
 * (§3.1): every consumer that needs the rich chord vocabulary — voicing search, the guitar
 * display, colour-aware naming — goes through `toChordSpec`/`fromChordSpec`, never a hand-rolled
 * mapping of its own.
 */
import { chordName as baseChordName, defaultSeventh, relabel, withFlavor as baseWithFlavor } from './theory/chords';
import { chroma, fmt, scaleNotes } from './theory/scales';
import type { ChordColour, ChordRef, Flavor, Key, Quality, Seventh } from './theory/types';
import {
  chordSuffix,
  normalizeChord,
  validateChord,
  type ChordAdded,
  type ChordAlteration,
  type ChordQuality as FfQuality,
  type ChordSeventh as FfSeventh,
  type ChordSpec,
} from './fret/chords';
import { chromaticName, spellOnLetter, type Letter, type NoteName } from './fret/notes';

// ------------------------------------------------------------------ PB -> FF

const TRIAD_QUALITY: Record<Quality, FfQuality> = {
  maj: 'major',
  min: 'minor',
  dim: 'dim',
  aug: 'aug',
};

const SEVENTH_MAP: Record<Seventh, { quality: FfQuality; seventh: FfSeventh }> = {
  maj7: { quality: 'major', seventh: 'maj7' },
  dom7: { quality: 'major', seventh: '7' },
  min7: { quality: 'minor', seventh: '7' },
  minMaj7: { quality: 'minor', seventh: 'maj7' },
  m7b5: { quality: 'dim', seventh: '7' },
  dim7: { quality: 'dim', seventh: 'dim7' },
  augMaj7: { quality: 'aug', seventh: 'maj7' },
  aug7: { quality: 'aug', seventh: '7' },
};

/**
 * PB's `ChordRef` as FF's `ChordSpec` (§3.1 table). Always returns a normalized, nameable spec —
 * FF's engine (voicing search, `describeChord`, `validateChord`) can consume it directly.
 */
export function toChordSpec(chord: ChordRef): ChordSpec {
  const rootPc = chroma(chord.root);
  const bassPc = chord.bass ? chroma(chord.bass) : null;

  let quality: FfQuality;
  let seventh: FfSeventh = 'none';
  const extraAlterations: ChordAlteration[] = [];
  let added: ChordSpec['added'] = [];

  switch (chord.flavor) {
    case 'triad':
      quality = TRIAD_QUALITY[chord.quality];
      break;
    case 'add9':
      quality = TRIAD_QUALITY[chord.quality];
      added = ['add9'];
      break;
    case 'sus2':
    case 'sus4':
      quality = chord.flavor;
      if (chord.quality === 'dim') extraAlterations.push('b5');
      else if (chord.quality === 'aug') extraAlterations.push('#5');
      break;
    case '7': {
      const mapped = SEVENTH_MAP[chord.seventh];
      quality = mapped.quality;
      seventh = mapped.seventh;
      break;
    }
  }

  const colour = chord.colour;
  let omit3 = colour?.omit3 ?? false;
  const omit5 = colour?.omit5 ?? false;
  const extension: ChordSpec['extension'] = colour?.extension ?? 'none';
  const alterations: ChordAlteration[] = [...extraAlterations, ...(colour?.alterations ?? [])];
  if (colour?.added) added = [...added, ...colour.added];

  // colour.sixth only applies to a plain triad (§3.1); it takes the place of `seventh`.
  if (chord.flavor === 'triad' && colour?.sixth) seventh = colour.sixth;

  // A plain major triad with only `omit3` set is the power chord ("C5"): FF has a dedicated
  // quality for it, so both engines agree on the name and on what's valid.
  const isPowerChord =
    chord.flavor === 'triad' &&
    chord.quality === 'maj' &&
    omit3 &&
    !omit5 &&
    !colour?.sixth &&
    alterations.length === 0 &&
    added.length === 0;
  if (isPowerChord) {
    quality = 'power';
    omit3 = false;
  }

  return normalizeChord({
    rootPc,
    quality,
    seventh,
    extension,
    alterations,
    added,
    omit3,
    omit5,
    bassPc,
  });
}

// ------------------------------------------------------------------ FF -> PB

const TRIAD_QUALITY_REVERSE: Partial<Record<FfQuality, Quality>> = {
  major: 'maj',
  minor: 'min',
  dim: 'dim',
  aug: 'aug',
};

const SEVENTH_MAP_REVERSE: Record<string, { quality: Quality; seventh: Seventh }> = {
  'major:maj7': { quality: 'maj', seventh: 'maj7' },
  'major:7': { quality: 'maj', seventh: 'dom7' },
  'minor:7': { quality: 'min', seventh: 'min7' },
  'minor:maj7': { quality: 'min', seventh: 'minMaj7' },
  'dim:7': { quality: 'dim', seventh: 'm7b5' },
  'dim:dim7': { quality: 'dim', seventh: 'dim7' },
  'aug:maj7': { quality: 'aug', seventh: 'augMaj7' },
  'aug:7': { quality: 'aug', seventh: 'aug7' },
};

interface Mapped {
  quality: Quality;
  seventh: Seventh;
  flavor: Flavor;
  colour?: ChordColour;
}

interface ColourInput {
  sixth?: ChordColour['sixth'];
  extension?: ChordSpec['extension'];
  alterations?: readonly ChordAlteration[];
  added?: readonly ChordAdded[];
  omit3?: boolean;
  omit5?: boolean;
}

function colourFrom(partial: ColourInput): ChordColour | undefined {
  const alterations = [...(partial.alterations ?? [])] as ChordColour['alterations'];
  const added = [...(partial.added ?? [])] as ChordColour['added'];
  const extension = partial.extension && partial.extension !== 'none' ? partial.extension : undefined;
  const hasAny =
    partial.sixth !== undefined ||
    extension !== undefined ||
    (alterations && alterations.length > 0) ||
    (added && added.length > 0) ||
    partial.omit3 ||
    partial.omit5;
  if (!hasAny) return undefined;
  return {
    ...(partial.sixth !== undefined ? { sixth: partial.sixth } : {}),
    ...(extension !== undefined ? { extension } : {}),
    ...(alterations && alterations.length ? { alterations } : {}),
    ...(added && added.length ? { added } : {}),
    ...(partial.omit3 ? { omit3: true } : {}),
    ...(partial.omit5 ? { omit5: true } : {}),
  };
}

/** Reverse of the PB → FF mapping above. Normalizes `spec` first, so callers can pass anything
 *  that has already passed (or will be checked against) `validateChord`. */
function mapSpec(spec: ChordSpec): Mapped {
  const s = normalizeChord(spec);

  if (s.quality === 'power') {
    // Reverse of the power-chord special case: a plain major triad, colour-flagged as omit3.
    return { quality: 'maj', seventh: defaultSeventh('maj'), flavor: 'triad', colour: { omit3: true } };
  }

  if (s.quality === 'sus2' || s.quality === 'sus4') {
    // FF's sus quality always uses a perfect 5th; PB encodes a diminished/augmented "function"
    // for a sus chord via the b5/#5 alteration instead (see toChordSpec above).
    let quality: Quality = 'maj';
    let alterations = s.alterations;
    if (alterations.includes('b5')) {
      quality = 'dim';
      alterations = alterations.filter((a) => a !== 'b5');
    } else if (alterations.includes('#5')) {
      quality = 'aug';
      alterations = alterations.filter((a) => a !== '#5');
    }
    // FF also allows a 6th/7th/extension stacked on a sus quality; PB's `sus2`/`sus4` flavor has
    // no such slot (a known, documented gap — see PLAN.md §3.1 notes in the phase report), so
    // that part of the spec is dropped rather than silently mis-voiced.
    const colour = colourFrom({ alterations, added: s.added, omit3: s.omit3, omit5: s.omit5 });
    return { quality, seventh: defaultSeventh(quality), flavor: s.quality, colour };
  }

  const hasExtension = s.extension !== 'none';
  const effectiveSeventh = s.seventh === 'none' && hasExtension ? '7' : s.seventh;

  if (effectiveSeventh === '6' || effectiveSeventh === '6/9') {
    // colour.sixth: a plain triad (§3.1).
    const quality = TRIAD_QUALITY_REVERSE[s.quality] ?? 'maj';
    const colour = colourFrom({
      sixth: effectiveSeventh,
      alterations: s.alterations,
      added: s.added,
      omit3: s.omit3,
      omit5: s.omit5,
    });
    return { quality, seventh: defaultSeventh(quality), flavor: 'triad', colour };
  }

  if (effectiveSeventh === 'none') {
    // A plain triad, or 'add9' (PB's dedicated flavor for the 9th; add11/add13 alongside it, if
    // any, still ride along as colour.added).
    const quality = TRIAD_QUALITY_REVERSE[s.quality] ?? 'maj';
    if (s.added.includes('add9')) {
      const remaining = s.added.filter((a) => a !== 'add9');
      const colour = colourFrom({ alterations: s.alterations, added: remaining, omit3: s.omit3, omit5: s.omit5 });
      return { quality, seventh: defaultSeventh(quality), flavor: 'add9', colour };
    }
    const colour = colourFrom({ alterations: s.alterations, added: s.added, omit3: s.omit3, omit5: s.omit5 });
    return { quality, seventh: defaultSeventh(quality), flavor: 'triad', colour };
  }

  // A '7'-flavored chord, possibly with a 9/11/13 extension (which replaces the seventh's digit
  // in the name, but the underlying seventh "family" — major/dominant/minor/half-dim/dim/aug —
  // is still what `effectiveSeventh` carries).
  const key = `${s.quality}:${effectiveSeventh}`;
  const mapped = SEVENTH_MAP_REVERSE[key] ?? { quality: 'maj' as Quality, seventh: 'dom7' as Seventh };
  const colour = colourFrom({
    extension: s.extension,
    alterations: s.alterations,
    added: s.added,
    omit3: s.omit3,
    omit5: s.omit5,
  });
  return { quality: mapped.quality, seventh: mapped.seventh, flavor: '7', colour };
}

/**
 * Spell a pitch class in a key (§3.1): prefer the letter of a scale degree, then the key's own
 * accidental direction. Returns a plain-ASCII note (e.g. 'F#', 'Bb'), matching `ChordRef.root`.
 */
export function spellInKey(pc: number, key: Key): string {
  const scale = scaleNotes(key);
  const exact = scale.find((n) => chroma(n) === pc);
  if (exact) return exact;

  const sharpCount = scale.filter((n) => n.includes('#')).length;
  const flatCount = scale.filter((n) => n.includes('b')).length;
  const preferSharp = flatCount <= sharpCount;

  let best: NoteName | null = null;
  for (const note of scale) {
    const letter = note[0] as Letter;
    const spelled = spellOnLetter(pc, letter);
    if (!spelled) continue;
    if (!best || Math.abs(spelled.acc) < Math.abs(best.acc)) {
      best = spelled;
    } else if (Math.abs(spelled.acc) === Math.abs(best.acc)) {
      const spelledIsSharp = spelled.acc > 0;
      if (spelledIsSharp === preferSharp && (best.acc > 0) !== preferSharp) best = spelled;
    }
  }
  const name = best ?? chromaticName(pc, preferSharp ? 'sharp' : 'flat');
  return toAscii(name);
}

function toAscii(name: NoteName): string {
  const acc = name.acc > 0 ? '#'.repeat(name.acc) : 'b'.repeat(-name.acc);
  return `${name.letter}${acc}`;
}

/** FF's `ChordSpec` as PB's `ChordRef` (§3.1), spelled and labelled for `key`. */
export function fromChordSpec(spec: ChordSpec, key: Key): ChordRef {
  const s = normalizeChord(spec);
  const mapped = mapSpec(s);
  const root = spellInKey(s.rootPc, key);
  const bass = s.bassPc !== null ? spellInKey(s.bassPc, key) : undefined;
  const draft: ChordRef = {
    root,
    quality: mapped.quality,
    seventh: mapped.seventh,
    flavor: mapped.flavor,
    bass,
    numeral: '',
    origin: 'diatonic',
    colour: mapped.colour,
  };
  return relabel(draft, key);
}

/** `chordSuffix(toChordSpec(chord))` when the chord has colour, else PB's own (unchanged)
 *  base name — every existing chord names exactly as it did before colour existed. */
export function chordName(chord: ChordRef): string {
  const c = chord.colour;
  const hasColour =
    c &&
    (c.sixth ||
      c.extension ||
      (c.alterations && c.alterations.length > 0) ||
      (c.added && c.added.length > 0) ||
      c.omit3 ||
      c.omit5);
  if (!hasColour) return baseChordName(chord);
  const suffix = chordSuffix(toChordSpec(chord));
  const bass = chord.bass && chroma(chord.bass) !== chroma(chord.root) ? `/${fmt(chord.bass)}` : '';
  return `${fmt(chord.root)}${suffix}${bass}`;
}

/**
 * `withFlavor` (theory/chords.ts), plus dropping any colour that the new flavor makes invalid
 * (§3.1) — checked against FF's own `validateChord` via `toChordSpec`, keeping whatever colour
 * is still valid rather than clearing it all.
 */
export function withFlavor(chord: ChordRef, flavor: Flavor, key: Key): ChordRef {
  const next = baseWithFlavor(chord, flavor, key);
  return sanitizeColour(next, key);
}

/** Change or clear the chord's colour (§3.1), dropping whatever the new combination makes
 *  invalid (checked the same way as `withFlavor`) and recomputing the numeral/name inputs. */
export function withColour(chord: ChordRef, patch: ChordColour | undefined, key: Key): ChordRef {
  const next: ChordRef = { ...chord, colour: patch };
  return sanitizeColour(next, key);
}

/** Drops whichever parts of `chord.colour` `validateChord` rejects for the chord's current
 *  flavor/quality, keeping everything else; recomputes the numeral either way. */
function sanitizeColour(chord: ChordRef, key: Key): ChordRef {
  if (!chord.colour) return relabel(chord, key);
  let spec = toChordSpec(chord);
  // Iteratively strip whatever `validateChord` names first, in case dropping one thing still
  // leaves another invalid combination (e.g. an alteration that only made sense with an
  // extension that was itself just dropped).
  for (let guard = 0; guard < 8; guard++) {
    const reason = validateChord(spec);
    if (!reason) break;
    spec = relaxOneStep(spec);
  }
  const cleaned = fromChordSpec(spec, key);
  return relabel({ ...chord, colour: cleaned.colour }, key);
}

/** Removes one colour ingredient likely to be the cause of `validateChord`'s complaint, in a
 *  fixed, safe order (alterations, then added tones, then extension, then omissions, then sixth).
 *  Never removes the base quality/seventh/extension structure that came from flavor/quality. */
function relaxOneStep(spec: ChordSpec): ChordSpec {
  if (spec.alterations.length > 0) return { ...spec, alterations: spec.alterations.slice(0, -1) };
  if (spec.added.length > 0) return { ...spec, added: spec.added.slice(0, -1) };
  if (spec.extension !== 'none') return { ...spec, extension: 'none' };
  if (spec.omit5) return { ...spec, omit5: false };
  if (spec.omit3) return { ...spec, omit3: false };
  if (spec.seventh === '6' || spec.seventh === '6/9') return { ...spec, seventh: 'none' };
  return spec;
}
