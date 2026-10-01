/**
 * The song schema (§3.2), v2: PB's original song plus attachments, a guitar setup and free
 * per-module storage. `migrateSong` upgrades v1 songs (PB's original, no `schemaVersion`) and
 * sanitises anything read from storage or an import — that input is always untrusted (§8).
 */
import { toChordSpec } from './convert';
import { sanitizeCapo } from './fret/capo';
import { resolveTones } from './fret/chords';
import { chroma } from './theory/scales';
import type { ChordRef, Key, Mode } from './theory/types';
import { customPatternId, isCustomPatternId, sanitizeStrumPatterns, type StrumPattern } from './strumPattern';

export const SCHEMA_VERSION = 2 as const;

export type InstrumentId = 'piano' | 'epiano' | 'pad' | 'guitar';
/** The patterns that ship with the app. */
export type BuiltInPatternId =
  | 'block'
  | 'pulse'
  | 'strum-down'
  | 'strum-updown'
  | 'arp-up'
  | 'arp-updown'
  | 'arp-broken'
  | 'bass-chord';

/** A built-in pattern, or one of the song's own strum patterns (`custom:<id>`, see `Song.patterns`). */
export type PatternId = BuiltInPatternId | `custom:${string}`;

export interface TimeSig {
  beats: number;
  unit: 1 | 2 | 4 | 8 | 16;
}

/** Per string, low→high: fret counted from the capo (0 = capo/open), null = muted. */
export interface GuitarVoicing {
  frets: (number | null)[];
  /** Snapshot of the song's guitar setup when committed; used to detect staleness. */
  tuning: number[]; // open-string MIDI, low→high, without capo
  capo: number;
  source: 'recommended' | 'picked' | 'edited';
}

export interface ChordAttachments {
  guitar?: GuitarVoicing;
  // piano?: PianoVoicing  ← future module adds its own key here
}

export interface ChordEvent {
  id: string;
  chord: ChordRef;
  beats: number;
  attachments?: ChordAttachments;
  /** A pattern for this chord alone, in place of its section's or the song's. */
  pattern?: PatternId;
}

export interface Section {
  id: string;
  name: string;
  events: ChordEvent[];
  repeat: number;
  /** This section's own key, when it differs from the song's (a modulation). Absent = the song's key. */
  key?: Key;
  /** A pattern for the whole section (its chords can still override it). Absent = the song's. */
  pattern?: PatternId;
  variantOf?: string; // id of the section it was copied from
  variantLabel?: string; // e.g. "Up the neck (5+)"
}

export interface GuitarSetup {
  tuning: number[];
  tuningName?: string;
  capo: number;
}

/** Standard tuning, low string to high (E2 A2 D3 G3 B3 E4), as MIDI numbers. */
export const STANDARD_GUITAR_TUNING = [40, 45, 50, 55, 59, 64];

export function defaultGuitarSetup(): GuitarSetup {
  return { tuning: [...STANDARD_GUITAR_TUNING], capo: 0 };
}

export interface Song {
  schemaVersion: 2;
  id: string;
  title: string;
  key: Key;
  timeSig: TimeSig;
  bpm: number;
  instrument: InstrumentId;
  /** The default pattern: a built-in one, or `custom:<id>` of an entry in `patterns`. */
  pattern: PatternId;
  /** The song's own strum patterns (built in the pattern builder). */
  patterns?: StrumPattern[];
  sections: Section[];
  arrangement: string[];
  updatedAt: number;
  guitar: GuitarSetup;
  /** Free space for modules that need song-level data. Keyed by module id; each module owns and
   *  sanitises its own entry. Unknown keys are preserved untouched. */
  moduleData?: Record<string, unknown>;
}

// ------------------------------------------------------------------ sanitising

const MODES: Mode[] = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
const INSTRUMENTS: InstrumentId[] = ['piano', 'epiano', 'pad', 'guitar'];
const PATTERNS: BuiltInPatternId[] = [
  'block',
  'pulse',
  'strum-down',
  'strum-updown',
  'arp-up',
  'arp-updown',
  'arp-broken',
  'bass-chord',
];
const QUALITIES = ['maj', 'min', 'dim', 'aug'] as const;
const SEVENTHS = ['maj7', 'dom7', 'min7', 'minMaj7', 'm7b5', 'dim7', 'augMaj7', 'aug7'] as const;
const FLAVORS = ['triad', '7', 'sus2', 'sus4', 'add9'] as const;
const ORIGINS = ['diatonic', 'borrowed', 'secondary'] as const;
const ALTERATIONS = ['b5', '#5', 'b9', '#9', '#11', 'b13'] as const;
const ADDED = ['add11', 'add13'] as const;

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
const oneOf = <T extends string>(v: unknown, options: readonly T[]): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v);

function sanitizeKey(raw: unknown): Key {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    tonic: isString(r.tonic) ? r.tonic : 'C',
    mode: oneOf(r.mode, MODES) ? r.mode : 'major',
  };
}

function sanitizeTimeSig(raw: unknown): TimeSig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const beats = isFiniteNumber(r.beats) ? Math.max(1, Math.min(32, Math.round(r.beats))) : 4;
  const unit = ([1, 2, 4, 8, 16] as const).includes(r.unit as never) ? (r.unit as TimeSig['unit']) : 4;
  return { beats, unit };
}

/** Untrusted colour input (storage/import) → a valid `ChordColour`, or undefined if empty. */
function sanitizeColour(raw: unknown): ChordRef['colour'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const sixth = r.sixth === '6' || r.sixth === '6/9' ? r.sixth : undefined;
  const extension = r.extension === '9' || r.extension === '11' || r.extension === '13' ? r.extension : undefined;
  const alterations = Array.isArray(r.alterations)
    ? ALTERATIONS.filter((a) => (r.alterations as unknown[]).includes(a))
    : [];
  const added = Array.isArray(r.added) ? ADDED.filter((a) => (r.added as unknown[]).includes(a)) : [];
  const omit3 = r.omit3 === true;
  const omit5 = r.omit5 === true;
  const hasAny = sixth || extension || alterations.length > 0 || added.length > 0 || omit3 || omit5;
  if (!hasAny) return undefined;
  return {
    ...(sixth ? { sixth } : {}),
    ...(extension ? { extension } : {}),
    ...(alterations.length ? { alterations } : {}),
    ...(added.length ? { added } : {}),
    ...(omit3 ? { omit3 } : {}),
    ...(omit5 ? { omit5 } : {}),
  };
}

/** Untrusted chord input → a valid `ChordRef`, or null if it isn't shaped like one at all. */
function sanitizeChordRef(raw: unknown): ChordRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.root)) return null;
  const quality = oneOf(r.quality, QUALITIES) ? r.quality : 'maj';
  const seventh = oneOf(r.seventh, SEVENTHS) ? r.seventh : 'maj7';
  const flavor = oneOf(r.flavor, FLAVORS) ? r.flavor : 'triad';
  const origin = oneOf(r.origin, ORIGINS) ? r.origin : 'diatonic';
  return {
    root: r.root,
    quality,
    seventh,
    flavor,
    origin,
    bass: isString(r.bass) ? r.bass : undefined,
    numeral: isString(r.numeral) ? r.numeral : '',
    colour: sanitizeColour(r.colour),
  };
}

function sanitizeVoicing(raw: unknown): GuitarVoicing | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.frets) || !Array.isArray(r.tuning)) return null;
  const frets = r.frets.map((f) => (f === null ? null : isFiniteNumber(f) ? Math.round(f) : null));
  const tuning = r.tuning.filter(isFiniteNumber).map((n) => Math.round(n));
  if (tuning.length === 0) return null;
  const capo = sanitizeCapo(r.capo);
  const source = r.source === 'picked' || r.source === 'edited' ? r.source : 'recommended';
  return { frets, tuning, capo, source };
}

function sanitizeAttachments(raw: unknown): ChordAttachments | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const guitar = sanitizeVoicing(r.guitar);
  return guitar ? { guitar } : undefined;
}

/** A pattern id from untrusted input: a built-in, or a custom one that exists; otherwise absent. */
function sanitizePatternId(raw: unknown, known: ReadonlySet<string>): PatternId | undefined {
  if (oneOf(raw, PATTERNS)) return raw;
  return typeof raw === 'string' && isCustomPatternId(raw) && known.has(raw) ? raw : undefined;
}

function sanitizeEvent(raw: unknown, known: ReadonlySet<string>): ChordEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const chord = sanitizeChordRef(r.chord);
  if (!isString(r.id) || !chord) return null;
  const beats = isFiniteNumber(r.beats) ? Math.max(1, Math.min(32, Math.round(r.beats))) : 4;
  const attachments = sanitizeAttachments(r.attachments);
  const pattern = sanitizePatternId(r.pattern, known);
  return { id: r.id, chord, beats, ...(attachments ? { attachments } : {}), ...(pattern ? { pattern } : {}) };
}

function sanitizeSection(raw: unknown, known: ReadonlySet<string>): Section | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.id)) return null;
  const events = Array.isArray(r.events) ? r.events.map((e) => sanitizeEvent(e, known)).filter((e): e is ChordEvent => e !== null) : [];
  const repeat = isFiniteNumber(r.repeat) ? Math.max(1, Math.min(16, Math.round(r.repeat))) : 1;
  const section: Section = { id: r.id, name: isString(r.name) ? r.name : 'Section', events, repeat };
  if (r.key !== undefined && r.key !== null && typeof r.key === 'object') section.key = sanitizeKey(r.key);
  const sectionPattern = sanitizePatternId(r.pattern, known);
  if (sectionPattern) section.pattern = sectionPattern;
  if (isString(r.variantOf)) section.variantOf = r.variantOf;
  if (isString(r.variantLabel)) section.variantLabel = r.variantLabel;
  return section;
}

function sanitizeGuitarSetup(raw: unknown): GuitarSetup {
  if (!raw || typeof raw !== 'object') return defaultGuitarSetup();
  const r = raw as Record<string, unknown>;
  const tuning = Array.isArray(r.tuning) ? r.tuning.filter(isFiniteNumber).map((n) => Math.round(n)) : [];
  const capo = sanitizeCapo(r.capo);
  return {
    tuning: tuning.length >= 4 ? tuning : [...STANDARD_GUITAR_TUNING],
    capo,
    ...(isString(r.tuningName) ? { tuningName: r.tuningName } : {}),
  };
}

/**
 * Upgrades a v1 song (PB's original, no `schemaVersion`) or sanitises a v2 one — storage and
 * imports are untrusted (§8). Returns null only when `raw` isn't shaped like a song at all.
 */
export function migrateSong(raw: unknown): Song | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.id) || !Array.isArray(r.sections) || !Array.isArray(r.arrangement)) return null;

  const patterns = sanitizeStrumPatterns(r.patterns);
  const known = new Set(patterns.map((p) => customPatternId(p.id)));
  const sections = r.sections.map((x) => sanitizeSection(x, known)).filter((s): s is Section => s !== null);
  if (sections.length === 0) sections.push({ id: 'section-1', name: 'Verse', events: [], repeat: 1 });
  const sectionIds = new Set(sections.map((s) => s.id));
  const arrangement = r.arrangement.filter((id): id is string => typeof id === 'string' && sectionIds.has(id));

  return {
    schemaVersion: SCHEMA_VERSION,
    id: r.id,
    title: isString(r.title) ? r.title : 'Untitled song',
    key: sanitizeKey(r.key),
    timeSig: sanitizeTimeSig(r.timeSig),
    bpm: isFiniteNumber(r.bpm) ? Math.max(30, Math.min(300, Math.round(r.bpm))) : 100,
    instrument: oneOf(r.instrument, INSTRUMENTS) ? r.instrument : 'piano',
    pattern: sanitizePatternId(r.pattern, known) ?? 'block',
    ...(patterns.length > 0 ? { patterns } : {}),
    sections,
    arrangement: arrangement.length ? arrangement : [sections[0].id],
    updatedAt: isFiniteNumber(r.updatedAt) ? r.updatedAt : Date.now(),
    guitar: sanitizeGuitarSetup(r.guitar),
    ...(r.moduleData && typeof r.moduleData === 'object' ? { moduleData: r.moduleData as Record<string, unknown> } : {}),
  };
}

// ------------------------------------------------------------------ voicing status

export type VoicingStatus = 'none' | 'ok' | 'chord-changed' | 'tuning-changed';

function sameTuning(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/**
 * Whether a committed guitar voicing still fits its chord and the song's current tuning/capo
 * (§3.2). Computed fresh every time — never stored, so it can never go stale itself.
 */
export function voicingStatus(event: Pick<ChordEvent, 'chord' | 'attachments'>, song: Pick<Song, 'guitar'>): VoicingStatus {
  const voicing = event.attachments?.guitar;
  if (!voicing) return 'none';
  if (voicing.capo !== song.guitar.capo || !sameTuning(voicing.tuning, song.guitar.tuning)) return 'tuning-changed';

  const spec = toChordSpec(event.chord);
  const tones = resolveTones(spec);
  const allowedPcs = new Set(tones.map((t) => ((spec.rootPc + t.semitones) % 12 + 12) % 12));
  const requiredPcs = new Set(tones.filter((t) => t.required).map((t) => ((spec.rootPc + t.semitones) % 12 + 12) % 12));

  const sounding: { stringIndex: number; midi: number }[] = [];
  voicing.frets.forEach((f, i) => {
    if (f === null) return;
    const tuningNote = voicing.tuning[i];
    if (tuningNote === undefined) return;
    sounding.push({ stringIndex: i, midi: tuningNote + voicing.capo + f });
  });
  if (sounding.length === 0) return 'chord-changed';

  const soundingPcs = sounding.map((s) => ((s.midi % 12) + 12) % 12);
  if (soundingPcs.some((pc) => !allowedPcs.has(pc))) return 'chord-changed';
  if ([...requiredPcs].some((pc) => !soundingPcs.includes(pc))) return 'chord-changed';

  const lowest = sounding.reduce((a, b) => (a.midi <= b.midi ? a : b));
  const bassPc = chroma(event.chord.bass ?? event.chord.root);
  if (((lowest.midi % 12) + 12) % 12 !== bassPc) return 'chord-changed';

  return 'ok';
}
