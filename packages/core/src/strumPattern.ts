/**
 * Custom strum patterns: a row of steps, each a down or up stroke (or a rest) that plays every
 * string, only the low ones or only the high ones. Pure data and maths, no ids generated here, so
 * this file depends on nothing and the schema can use it.
 */

export type StrumStroke = 'down' | 'up';
/** Which strings a stroke sounds: all of them, or the lower or upper half (a partial strum). */
export type StrumExtent = 'full' | 'low' | 'high';

export interface StrumStep {
  stroke: StrumStroke;
  extent: StrumExtent;
  /** A harder stroke. */
  accent?: boolean;
}

/** Steps in each beat: 1 = quarter notes, 2 = eighths, 4 = sixteenths. */
export type StepsPerBeat = 1 | 2 | 4;
export const STEPS_PER_BEAT: readonly StepsPerBeat[] = [1, 2, 4];

export interface StrumPattern {
  id: string;
  name: string;
  /** Length of the pattern in beats (usually one bar). It repeats to fill a longer chord. */
  beats: number;
  stepsPerBeat: StepsPerBeat;
  /** `beats * stepsPerBeat` entries; null is a rest. */
  steps: (StrumStep | null)[];
}

export const PATTERN_BEATS_MIN = 1;
export const PATTERN_BEATS_MAX = 8;
export const CUSTOM_PATTERN_PREFIX = 'custom:';

export const customPatternId = (id: string): `custom:${string}` => `${CUSTOM_PATTERN_PREFIX}${id}`;
export const isCustomPatternId = (id: string): id is `custom:${string}` => id.startsWith(CUSTOM_PATTERN_PREFIX);
export const strumPatternIdOf = (patternId: string): string => patternId.slice(CUSTOM_PATTERN_PREFIX.length);

const D: StrumStep = { stroke: 'down', extent: 'full' };
const U: StrumStep = { stroke: 'up', extent: 'full' };
const Uh: StrumStep = { stroke: 'up', extent: 'high' };
const Dl: StrumStep = { stroke: 'down', extent: 'low' };
const Da: StrumStep = { stroke: 'down', extent: 'full', accent: true };

/** Starting points for a new pattern. Eighth-note grids over one bar of four beats unless noted. */
export const STRUM_PRESETS: readonly { name: string; beats: number; stepsPerBeat: StepsPerBeat; steps: (StrumStep | null)[] }[] = [
  { name: 'Down strums', beats: 4, stepsPerBeat: 1, steps: [Da, D, D, D] },
  { name: 'Down, up', beats: 4, stepsPerBeat: 2, steps: [D, U, D, U, D, U, D, U] },
  { name: 'Folk (D, DU, UDU)', beats: 4, stepsPerBeat: 2, steps: [D, null, D, U, null, U, D, U] },
  { name: 'Off-beat chops', beats: 4, stepsPerBeat: 2, steps: [null, U, null, U, null, U, null, U] },
  { name: 'Bass, then strum', beats: 4, stepsPerBeat: 2, steps: [Dl, null, D, Uh, Dl, null, D, Uh] },
  { name: 'Waltz', beats: 3, stepsPerBeat: 1, steps: [Da, D, D] },
];

/** A blank pattern (all rests) with the given id; the caller supplies the id. */
export function emptyStrumPattern(id: string, name: string, beats = 4, stepsPerBeat: StepsPerBeat = 2): StrumPattern {
  return { id, name, beats, stepsPerBeat, steps: Array.from({ length: beats * stepsPerBeat }, () => null) };
}

/** A pattern from one of the presets (steps copied, so editing never changes the preset). */
export function strumPatternFromPreset(id: string, preset: (typeof STRUM_PRESETS)[number]): StrumPattern {
  return { id, name: preset.name, beats: preset.beats, stepsPerBeat: preset.stepsPerBeat, steps: preset.steps.map((s) => (s ? { ...s } : null)) };
}

const clampBeats = (n: number) => Math.max(PATTERN_BEATS_MIN, Math.min(PATTERN_BEATS_MAX, Math.round(n)));

/**
 * The pattern with a new length or resolution. Steps keep their place in time: going from eighths to
 * sixteenths puts each stroke at the same moment; going to a coarser grid drops strokes that no longer
 * land on a step; a longer pattern gets rests at the end, a shorter one loses its last steps.
 */
export function resizeStrumPattern(pattern: StrumPattern, beats: number, stepsPerBeat: StepsPerBeat): StrumPattern {
  const nextBeats = clampBeats(beats);
  const steps: (StrumStep | null)[] = Array.from({ length: nextBeats * stepsPerBeat }, () => null);
  pattern.steps.forEach((step, i) => {
    if (!step) return;
    const at = (i / pattern.stepsPerBeat) * stepsPerBeat;
    if (Number.isInteger(at) && at < steps.length) steps[at] = step;
  });
  return { ...pattern, beats: nextBeats, stepsPerBeat, steps };
}

/** The pattern with step `index` replaced (null = a rest). Out-of-range indices change nothing. */
export function setStrumStep(pattern: StrumPattern, index: number, step: StrumStep | null): StrumPattern {
  if (index < 0 || index >= pattern.steps.length) return pattern;
  return { ...pattern, steps: pattern.steps.map((s, i) => (i === index ? step : s)) };
}

/** Rest, then a down stroke, then an up stroke, then a rest again: what tapping a step does. */
export function cycleStrumStroke(step: StrumStep | null): StrumStep | null {
  if (!step) return { stroke: 'down', extent: 'full' };
  if (step.stroke === 'down') return { ...step, stroke: 'up' };
  return null;
}

export interface StrumEvent {
  /** Beats from the start of the chord. */
  offsetBeats: number;
  /** Beats until the next stroke or the end of the chord. */
  durationBeats: number;
  step: StrumStep;
}

/**
 * The strokes of `pattern` laid over a chord `chordBeats` long: the pattern repeats from the chord's
 * start, and whatever falls after the chord ends is cut off (a chord shorter than the pattern plays
 * only its first part).
 */
export function strumEvents(pattern: StrumPattern, chordBeats: number): StrumEvent[] {
  const per = pattern.stepsPerBeat;
  const length = pattern.steps.length;
  if (length === 0 || chordBeats <= 0) return [];
  const hits: { offsetBeats: number; step: StrumStep }[] = [];
  for (let cycle = 0; cycle * pattern.beats < chordBeats; cycle++) {
    pattern.steps.forEach((step, i) => {
      const offsetBeats = cycle * pattern.beats + i / per;
      if (step && offsetBeats < chordBeats) hits.push({ offsetBeats, step });
    });
  }
  return hits.map((h, i) => ({ ...h, durationBeats: (hits[i + 1]?.offsetBeats ?? chordBeats) - h.offsetBeats }));
}

/**
 * Which of a chord's notes (given low to high) one stroke sounds, in the order they sound: a down
 * stroke goes low to high, an up stroke high to low. A partial strum takes the lower or upper half
 * (rounding up), and always at least one note.
 */
export function strumNotes<T>(notes: readonly T[], step: StrumStep): T[] {
  const n = notes.length;
  const half = Math.max(1, Math.ceil(n / 2));
  const chosen = step.extent === 'low' ? notes.slice(0, half) : step.extent === 'high' ? notes.slice(n - half) : notes.slice();
  return step.stroke === 'up' ? chosen.reverse() : chosen;
}

/** 0–1 loudness: up strokes are lighter, an accent is harder. */
export function strumVelocity(step: StrumStep): number {
  const base = step.stroke === 'down' ? 0.8 : 0.6;
  return Math.min(1, base + (step.accent ? 0.2 : 0));
}

/** A short text form for labels: "D", "U", with "·" for a rest (lower case for a partial strum). */
export function strumGlyph(step: StrumStep | null): string {
  if (!step) return '·';
  const letter = step.stroke === 'down' ? 'D' : 'U';
  return step.extent === 'full' ? letter : letter.toLowerCase();
}

// ------------------------------------------------------------------ sanitising (storage and imports are untrusted)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function sanitizeStep(raw: unknown): StrumStep | null {
  if (!isObject(raw)) return null;
  if (raw.stroke !== 'down' && raw.stroke !== 'up') return null;
  const extent: StrumExtent = raw.extent === 'low' || raw.extent === 'high' ? raw.extent : 'full';
  return { stroke: raw.stroke, extent, ...(raw.accent === true ? { accent: true } : {}) };
}

export function sanitizeStrumPattern(raw: unknown): StrumPattern | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  const stepsPerBeat = (STEPS_PER_BEAT as readonly unknown[]).includes(raw.stepsPerBeat) ? (raw.stepsPerBeat as StepsPerBeat) : 2;
  const beats = typeof raw.beats === 'number' && Number.isFinite(raw.beats) ? clampBeats(raw.beats) : 4;
  const given = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = Array.from({ length: beats * stepsPerBeat }, (_, i) => sanitizeStep(given[i]));
  return { id: raw.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 60) : 'Pattern', beats, stepsPerBeat, steps };
}

/** A list of patterns from untrusted input: malformed ones are dropped, duplicate ids keep the first. */
export function sanitizeStrumPatterns(raw: unknown): StrumPattern[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StrumPattern[] = [];
  for (const item of raw.slice(0, 50)) {
    const p = sanitizeStrumPattern(item);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}
