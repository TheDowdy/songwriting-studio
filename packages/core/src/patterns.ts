import { customPatternId, isCustomPatternId, strumEvents, type StrumEvent, type StrumPattern } from './strumPattern';
import { findEvent } from './song';
import type { ChordEvent, PatternId, Song } from './schema';

/** The song's own strum pattern behind a `custom:` id, or null (a built-in id, or one that no longer exists). */
export function findStrumPattern(song: Pick<Song, 'patterns'>, patternId: string | undefined): StrumPattern | null {
  if (!patternId || !isCustomPatternId(patternId)) return null;
  return song.patterns?.find((p) => customPatternId(p.id) === patternId) ?? null;
}

export const usable = (song: Pick<Song, 'patterns'>, id: PatternId | undefined): id is PatternId =>
  !!id && (!isCustomPatternId(id) || findStrumPattern(song, id) !== null);

/**
 * The pattern a chord plays: its own if it has one, else the song's. An id that
 * points at a pattern that has since been deleted is skipped, so the chord falls back a level.
 */
export function patternIdFor(song: Song, event: Pick<ChordEvent, 'pattern'>): PatternId {
  if (usable(song, event.pattern)) return event.pattern;
  return usable(song, song.pattern) ? song.pattern : 'block';
}

/** What to play for a chord: a built-in id, or the song's own strum pattern. */
export type ResolvedPattern = { kind: 'builtin'; id: PatternId } | { kind: 'custom'; pattern: StrumPattern };

export function resolvePattern(song: Song, event: Pick<ChordEvent, 'pattern'>): ResolvedPattern {
  const id = patternIdFor(song, event);
  const custom = findStrumPattern(song, id);
  return custom ? { kind: 'custom', pattern: custom } : { kind: 'builtin', id };
}

/** The built-in patterns, with the names shown in pickers. */
export const BUILT_IN_PATTERNS: readonly { id: PatternId; label: string }[] = [
  { id: 'block', label: 'Block' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'strum-down', label: 'Strum down' },
  { id: 'strum-updown', label: 'Strum down-up' },
  { id: 'arp-up', label: 'Arpeggio up' },
  { id: 'arp-updown', label: 'Arpeggio up-down' },
  { id: 'arp-broken', label: 'Arpeggio broken' },
  { id: 'bass-chord', label: 'Bass + chord' },
];

/** Every pattern a song can use, built-in first and then its own, as picker options. */
export function patternOptions(song: Pick<Song, 'patterns'>): { id: PatternId; label: string; custom: boolean }[] {
  return [
    ...BUILT_IN_PATTERNS.map((p) => ({ ...p, custom: false })),
    ...(song.patterns ?? []).map((p) => ({ id: customPatternId(p.id), label: p.name, custom: true })),
  ];
}

/** The name of a pattern id for display (built-in label, or the song's pattern name). */
export function patternLabel(song: Pick<Song, 'patterns'>, id: PatternId): string {
  return patternOptions(song).find((o) => o.id === id)?.label ?? 'Block';
}

// ------------------------------------------------------------------ pattern blocks

/** A chord's own pattern if it has a usable one (a built-in, or a custom one that still exists). */
export function ownPattern(song: Pick<Song, 'patterns'>, event: Pick<ChordEvent, 'pattern'>): PatternId | undefined {
  return usable(song, event.pattern) ? event.pattern : undefined;
}

/**
 * A run of neighbouring chords in a section that share one own pattern, or that all have none (a
 * default run, which plays the song's pattern). Blocks are computed from the chords, never stored.
 */
export interface PatternBlock {
  sectionId: string;
  /** undefined = a default run. */
  own: PatternId | undefined;
  /** What actually plays: the own pattern, else the song's. */
  patternId: PatternId;
  startIndex: number;
  /** Inclusive. */
  endIndex: number;
  eventIds: string[];
  /** Beats from the section's start. */
  startBeat: number;
  beats: number;
}

export function patternBlocks(song: Song, sectionId: string): PatternBlock[] {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section) return [];
  const fallback: PatternId = usable(song, song.pattern) ? song.pattern : 'block';
  const blocks: PatternBlock[] = [];
  let beat = 0;
  section.events.forEach((event, index) => {
    const own = ownPattern(song, event);
    const last = blocks[blocks.length - 1];
    if (last && last.own === own) {
      last.endIndex = index;
      last.eventIds.push(event.id);
      last.beats += event.beats;
    } else {
      blocks.push({ sectionId, own, patternId: own ?? fallback, startIndex: index, endIndex: index, eventIds: [event.id], startBeat: beat, beats: event.beats });
    }
    beat += event.beats;
  });
  return blocks;
}

/** The block a chord belongs to. */
export function blockOf(song: Song, eventId: string): PatternBlock | null {
  const found = findEvent(song, eventId);
  if (!found) return null;
  return patternBlocks(song, found.section.id).find((b) => b.eventIds.includes(eventId)) ?? null;
}

/** Everything needed to play or draw one chord: its pattern, and how far into it the chord starts. */
export function chordPattern(song: Song, eventId: string): { resolved: ResolvedPattern; phaseBeats: number } | null {
  const found = findEvent(song, eventId);
  if (!found) return null;
  const block = patternBlocks(song, found.section.id).find((b) => b.eventIds.includes(eventId));
  if (!block) return null;
  const phaseBeats = found.section.events.slice(block.startIndex, found.index).reduce((sum, e) => sum + e.beats, 0);
  return { resolved: resolvePattern(song, found.section.events[found.index]!), phaseBeats };
}

/**
 * The strokes of a custom pattern for one chord, at the right phase, or null for a built-in pattern.
 * `beats` overrides the chord's length (the timeline passes the live length while resizing).
 */
export function chordStrokes(song: Song, eventId: string, beats?: number): StrumEvent[] | null {
  const found = findEvent(song, eventId);
  const cp = chordPattern(song, eventId);
  if (!found || !cp || cp.resolved.kind !== 'custom') return null;
  return strumEvents(cp.resolved.pattern, beats ?? found.section.events[found.index]!.beats, cp.phaseBeats);
}
