import { describe, expect, it } from 'vitest';
import { addChord, addSection, applyPattern, clearOwnPattern, deleteStrumPattern, saveStrumPattern } from './operations';
import { findStrumPattern, patternIdFor, resolvePattern } from './patterns';
import { migrateSong } from './schema';
import { diatonicChords } from './theory/chords';
import { newSong } from './song';
import { STRUM_PRESETS, customPatternId, strumPatternFromPreset } from './strumPattern';
import type { Song } from './schema';

const C = { tonic: 'C', mode: 'major' } as const;
const [I, , , IV, V] = diatonicChords(C);
const folk = strumPatternFromPreset('folk', STRUM_PRESETS[2]!);
const chops = strumPatternFromPreset('chops', STRUM_PRESETS[3]!);

function build(): { song: Song; ids: string[]; verse: string; chorus: string } {
  let song = newSong(C);
  const verse = song.sections[0]!.id;
  const ids: string[] = [];
  for (const chord of [I!, IV!, V!]) {
    const r = addChord(song, verse, ids.at(-1) ?? null, chord);
    song = r.song;
    ids.push(r.eventId);
  }
  const added = addSection(song, 'Chorus');
  song = added.song;
  const c = addChord(song, added.sectionId, null, I!);
  song = c.song;
  ids.push(c.eventId);
  return { song: saveStrumPattern(saveStrumPattern(song, folk), chops), ids, verse, chorus: added.sectionId };
}

describe('saving and deleting strum patterns', () => {
  it('saves a pattern, replaces it by id, and leaves the others alone', () => {
    const { song } = build();
    expect(song.patterns?.map((p) => p.id)).toEqual(['folk', 'chops']);
    const renamed = saveStrumPattern(song, { ...folk, name: 'Renamed' });
    expect(renamed.patterns).toHaveLength(2);
    expect(findStrumPattern(renamed, customPatternId('folk'))?.name).toBe('Renamed');
    expect(findStrumPattern(song, 'block')).toBeNull();
    expect(findStrumPattern(song, customPatternId('missing'))).toBeNull();
  });

  it('deleting a pattern puts everything that used it back to the level above', () => {
    let { song, ids, verse, chorus } = build();
    const id = customPatternId('folk');
    song = applyPattern(song, { scope: 'song' }, id);
    song = applyPattern(song, { scope: 'section', sectionId: chorus }, customPatternId('chops'));
    song = applyPattern(song, { scope: 'chord', eventId: ids[0]! }, id);
    const after = deleteStrumPattern(song, 'folk');
    expect(after.patterns?.map((p) => p.id)).toEqual(['chops']);
    expect(after.pattern).toBe('block');
    expect(after.sections.find((s) => s.id === verse)!.events[0]!.pattern).toBeUndefined();
    expect(after.sections.find((s) => s.id === chorus)!.pattern).toBe(customPatternId('chops')); // a different pattern is kept
    expect(deleteStrumPattern(after, 'chops').patterns).toBeUndefined();
  });
});

describe('resolving a chord’s pattern', () => {
  it('a chord’s own beats its section’s, which beats the song’s', () => {
    let { song, ids, verse } = build();
    expect(patternIdFor(song, verse, {})).toBe('block');
    song = applyPattern(song, { scope: 'song' }, 'strum-updown');
    expect(patternIdFor(song, verse, song.sections[0]!.events[0]!)).toBe('strum-updown');
    song = { ...song, sections: song.sections.map((s) => (s.id === verse ? { ...s, pattern: customPatternId('folk') } : s)) };
    expect(patternIdFor(song, verse, song.sections[0]!.events[0]!)).toBe(customPatternId('folk'));
    song = applyPattern({ ...song, sections: song.sections.map((s) => (s.id === verse ? { ...s, pattern: customPatternId('folk') } : s)) }, { scope: 'chord', eventId: ids[1]! }, customPatternId('chops'));
    expect(patternIdFor(song, verse, song.sections[0]!.events[1]!)).toBe(customPatternId('chops'));
    expect(patternIdFor(song, verse, song.sections[0]!.events[0]!)).toBe(customPatternId('folk'));
  });

  it('a reference to a deleted pattern falls back a level instead of breaking', () => {
    const { song, verse } = build();
    const stale = { ...song, pattern: 'pulse' as const };
    expect(patternIdFor(stale, verse, { pattern: customPatternId('gone') })).toBe('pulse');
    expect(patternIdFor({ ...stale, pattern: customPatternId('gone') }, verse, {})).toBe('block');
  });

  it('resolvePattern returns the strum pattern itself for a custom id', () => {
    let { song, verse } = build();
    expect(resolvePattern(song, verse, {})).toEqual({ kind: 'builtin', id: 'block' });
    song = applyPattern(song, { scope: 'song' }, customPatternId('chops'));
    const r = resolvePattern(song, verse, {});
    expect(r.kind === 'custom' && r.pattern.name).toBe(chops.name);
  });
});

describe('applying a pattern', () => {
  it('to the song sets the default and clears every other choice', () => {
    let { song, ids, chorus } = build();
    song = applyPattern(song, { scope: 'chord', eventId: ids[0]! }, customPatternId('chops'));
    song = applyPattern(song, { scope: 'section', sectionId: chorus }, customPatternId('chops'));
    const all = applyPattern(song, { scope: 'song' }, customPatternId('folk'));
    expect(all.pattern).toBe(customPatternId('folk'));
    expect(all.sections.every((s) => s.pattern === undefined && s.events.every((e) => e.pattern === undefined))).toBe(true);
  });

  it('to a section sets that section and clears its chords’ own choices', () => {
    let { song, ids, verse, chorus } = build();
    song = applyPattern(song, { scope: 'chord', eventId: ids[0]! }, customPatternId('chops'));
    const next = applyPattern(song, { scope: 'section', sectionId: verse }, customPatternId('folk'));
    expect(next.sections.find((s) => s.id === verse)!.pattern).toBe(customPatternId('folk'));
    expect(next.sections.find((s) => s.id === verse)!.events.every((e) => e.pattern === undefined)).toBe(true);
    expect(next.sections.find((s) => s.id === chorus)!.pattern).toBeUndefined();
  });

  it('to a chord sets just that chord; from a chord sets it and the rest of its section', () => {
    const { song, ids, verse, chorus } = build();
    const one = applyPattern(song, { scope: 'chord', eventId: ids[1]! }, customPatternId('folk'));
    expect(one.sections[0]!.events.map((e) => e.pattern)).toEqual([undefined, customPatternId('folk'), undefined]);
    const rest = applyPattern(song, { scope: 'from-chord', eventId: ids[1]! }, customPatternId('folk'));
    expect(rest.sections[0]!.events.map((e) => e.pattern)).toEqual([undefined, customPatternId('folk'), customPatternId('folk')]);
    expect(rest.sections.find((s) => s.id === chorus)!.events[0]!.pattern).toBeUndefined();
    expect(rest.sections.find((s) => s.id === verse)).toBeDefined();
  });

  it('ignores a pattern that does not exist, an unknown chord or section, and can clear a choice', () => {
    const { song, ids, verse } = build();
    expect(applyPattern(song, { scope: 'song' }, customPatternId('nope'))).toBe(song);
    expect(applyPattern(song, { scope: 'chord', eventId: 'x' }, 'pulse')).toBe(song);
    expect(applyPattern(song, { scope: 'section', sectionId: 'x' }, 'pulse')).toBe(song);
    const set = applyPattern(song, { scope: 'chord', eventId: ids[0]! }, 'pulse');
    expect(set.sections[0]!.events[0]!.pattern).toBe('pulse');
    expect(clearOwnPattern(set, { eventId: ids[0]! }).sections[0]!.events[0]!.pattern).toBeUndefined();
    const sec = applyPattern(song, { scope: 'section', sectionId: verse }, 'pulse');
    expect(clearOwnPattern(sec, { sectionId: verse }).sections[0]!.pattern).toBeUndefined();
  });
});

describe('storage', () => {
  it('migrateSong keeps patterns and valid references, and drops references to missing ones', () => {
    const { song, ids } = build();
    const used = applyPattern(applyPattern(song, { scope: 'song' }, customPatternId('folk')), { scope: 'chord', eventId: ids[0]! }, customPatternId('chops'));
    const round = migrateSong(JSON.parse(JSON.stringify(used)))!;
    expect(round.patterns?.map((p) => p.id)).toEqual(['folk', 'chops']);
    expect(round.pattern).toBe(customPatternId('folk'));
    expect(round.sections[0]!.events[0]!.pattern).toBe(customPatternId('chops'));

    const broken = JSON.parse(JSON.stringify(used));
    broken.patterns = [];
    const fixed = migrateSong(broken)!;
    expect(fixed.pattern).toBe('block');
    expect(fixed.sections[0]!.events[0]!.pattern).toBeUndefined();
    expect(fixed.patterns).toBeUndefined();
  });

  it('a song with no custom patterns is unchanged (no empty list is added)', () => {
    const round = migrateSong(JSON.parse(JSON.stringify(newSong(C))))!;
    expect('patterns' in round).toBe(false);
    expect(round.pattern).toBe('block');
  });
});
