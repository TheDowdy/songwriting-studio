import { describe, expect, it } from 'vitest';
import { addChord, addSection, deleteStrumPattern, duplicateEvent, moveEvent, patternForSection, patternForSong, saveStrumPattern, setBlockPattern, setChordPatterns } from './operations';
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

  it('deleting a pattern puts everything that used it back to the song default', () => {
    let { song, ids } = build();
    const id = customPatternId('folk');
    song = patternForSong(song, id);
    song = setBlockPattern(song, ids[0]!, customPatternId('chops'));
    song = setBlockPattern(song, ids[1]!, id);
    const after = deleteStrumPattern(song, 'folk');
    expect(after.patterns?.map((p) => p.id)).toEqual(['chops']);
    expect(after.pattern).toBe('block');
    expect(after.sections[0]!.events[1]!.pattern).toBeUndefined();
    expect(after.sections[0]!.events[0]!.pattern).toBe(customPatternId('chops')); // a different pattern is kept
    expect(deleteStrumPattern(after, 'chops').patterns).toBeUndefined();
  });
});

describe('resolving a chord’s pattern', () => {
  it('a chord’s own beats the song’s', () => {
    let { song, ids, verse } = build();
    expect(patternIdFor(song, {})).toBe('block');
    song = patternForSong(song, 'strum-updown');
    expect(patternIdFor(song, song.sections[0]!.events[0]!)).toBe('strum-updown');
    song = setChordPatterns(song, verse, 1, 1, customPatternId('chops'));
    expect(patternIdFor(song, song.sections[0]!.events[1]!)).toBe(customPatternId('chops'));
    expect(patternIdFor(song, song.sections[0]!.events[0]!)).toBe('strum-updown');
    expect(ids).toHaveLength(4); // three verse chords and one chorus chord
  });

  it('a reference to a deleted pattern falls back to the song instead of breaking', () => {
    const { song } = build();
    const stale = { ...song, pattern: 'pulse' as const };
    expect(patternIdFor(stale, { pattern: customPatternId('gone') })).toBe('pulse');
    expect(patternIdFor({ ...stale, pattern: customPatternId('gone') }, {})).toBe('block');
  });

  it('resolvePattern returns the strum pattern itself for a custom id', () => {
    let { song } = build();
    expect(resolvePattern(song, {})).toEqual({ kind: 'builtin', id: 'block' });
    song = patternForSong(song, customPatternId('chops'));
    const r = resolvePattern(song, {});
    expect(r.kind === 'custom' && r.pattern.name).toBe(chops.name);
  });
});

describe('chords and patterns', () => {
  it('a chord added after one with its own pattern inherits it; after a default chord it does not', () => {
    const { song, ids, verse } = build();
    const patterned = setChordPatterns(song, verse, 2, 2, customPatternId('folk'));
    const after = addChord(patterned, verse, ids[2]!, I!);
    expect(after.song.sections[0]!.events.map((e) => e.pattern)).toEqual([undefined, undefined, customPatternId('folk'), customPatternId('folk')]);
    const plain = addChord(patterned, verse, ids[1]!, I!);
    expect(plain.song.sections[0]!.events[2]!.pattern).toBeUndefined();
    const appended = addChord(setChordPatterns(song, verse, 2, 2, 'pulse'), verse, null, I!);
    expect(appended.song.sections[0]!.events.at(-1)!.pattern).toBe('pulse'); // appended after the last chord
  });

  it('duplicating and moving a chord carries its pattern', () => {
    const { song, ids, verse } = build();
    const patterned = setChordPatterns(song, verse, 0, 0, 'pulse');
    const dup = duplicateEvent(patterned, ids[0]!).song;
    expect(dup.sections[0]!.events.filter((e) => e.pattern === 'pulse')).toHaveLength(2);
    const moved = moveEvent(patterned, ids[0]!, verse, 2);
    expect(moved.sections[0]!.events[2]!.pattern).toBe('pulse');
  });

  it('patternForSection paints every chord of that section only', () => {
    const { song, verse, chorus } = build();
    const next = patternForSection(song, verse, customPatternId('folk'));
    expect(next.sections.find((s) => s.id === verse)!.events.every((e) => e.pattern === customPatternId('folk'))).toBe(true);
    expect(next.sections.find((s) => s.id === chorus)!.events[0]!.pattern).toBeUndefined();
  });
});

describe('storage', () => {
  it('migrateSong keeps patterns and valid references, and drops references to missing ones', () => {
    const { song, ids } = build();
    const used = setBlockPattern(patternForSong(song, customPatternId('folk')), ids[0]!, customPatternId('chops'));
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
