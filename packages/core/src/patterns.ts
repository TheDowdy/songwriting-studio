import { customPatternId, isCustomPatternId, type StrumPattern } from './strumPattern';
import type { ChordEvent, PatternId, Song } from './schema';

/** The song's own strum pattern behind a `custom:` id, or null (a built-in id, or one that no longer exists). */
export function findStrumPattern(song: Pick<Song, 'patterns'>, patternId: string | undefined): StrumPattern | null {
  if (!patternId || !isCustomPatternId(patternId)) return null;
  return song.patterns?.find((p) => customPatternId(p.id) === patternId) ?? null;
}

const usable = (song: Pick<Song, 'patterns'>, id: PatternId | undefined): id is PatternId =>
  !!id && (!isCustomPatternId(id) || findStrumPattern(song, id) !== null);

/**
 * The pattern a chord plays: its own if it has one, else its section's, else the song's. An id that
 * points at a pattern that has since been deleted is skipped, so the chord falls back a level.
 */
export function patternIdFor(song: Song, sectionId: string, event: Pick<ChordEvent, 'pattern'>): PatternId {
  const section = song.sections.find((s) => s.id === sectionId);
  if (usable(song, event.pattern)) return event.pattern;
  if (usable(song, section?.pattern)) return section!.pattern!;
  return usable(song, song.pattern) ? song.pattern : 'block';
}

/** What to play for a chord: a built-in id, or the song's own strum pattern. */
export type ResolvedPattern = { kind: 'builtin'; id: PatternId } | { kind: 'custom'; pattern: StrumPattern };

export function resolvePattern(song: Song, sectionId: string, event: Pick<ChordEvent, 'pattern'>): ResolvedPattern {
  const id = patternIdFor(song, sectionId, event);
  const custom = findStrumPattern(song, id);
  return custom ? { kind: 'custom', pattern: custom } : { kind: 'builtin', id };
}

/** Where `applyPattern` puts a pattern. */
export type PatternTarget =
  | { scope: 'song' }
  | { scope: 'section'; sectionId: string }
  /** One chord. */
  | { scope: 'chord'; eventId: string }
  /** This chord and every chord after it in its section. */
  | { scope: 'from-chord'; eventId: string };

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
