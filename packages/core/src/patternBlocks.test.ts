import { describe, expect, it } from 'vitest';
import {
  addChord,
  patternForChordOnly,
  patternForSection,
  patternForSong,
  saveStrumPattern,
  setBlockLength,
  setBlockPattern,
  setChordPatterns,
  setEventBeats,
} from './operations';
import { blockOf, chordPattern, chordStrokes, ownPattern, patternBlocks } from './patterns';
import { diatonicChords } from './theory/chords';
import { newSong } from './song';
import { STRUM_PRESETS, strumEvents, strumPatternFromPreset } from './strumPattern';
import type { Song } from './schema';

const C = { tonic: 'C', mode: 'major' } as const;
const chords = diatonicChords(C);
const folk = strumPatternFromPreset('folk', STRUM_PRESETS[2]!);

/** A verse of four chords with beats 4, 2, 2, 4 and the folk pattern saved. */
function build(): { song: Song; ids: string[]; verse: string } {
  let song = newSong(C);
  const verse = song.sections[0]!.id;
  const ids: string[] = [];
  for (const chord of chords.slice(0, 4)) {
    const r = addChord(song, verse, ids.at(-1) ?? null, chord);
    song = r.song;
    ids.push(r.eventId);
  }
  song = setEventBeats(song, ids[1]!, 2);
  song = setEventBeats(song, ids[2]!, 2);
  return { song: saveStrumPattern(song, folk), ids, verse };
}
const own = (song: Song) => song.sections[0]!.events.map((e) => e.pattern);

describe('strumEvents with a phase', () => {
  it('phase 0 matches the plain call', () => {
    expect(strumEvents(folk, 4, 0)).toEqual(strumEvents(folk, 4));
  });
  it('takes the second half of a bar at phase 2, rebased to the chord start', () => {
    const events = strumEvents(folk, 2, 2);
    expect(events.map((e) => e.offsetBeats)).toEqual([0.5, 1, 1.5]);
    expect(events.at(-1)!.durationBeats).toBe(0.5);
  });
  it('wraps: phase 6 matches phase 2', () => {
    expect(strumEvents(folk, 2, 6)).toEqual(strumEvents(folk, 2, 2));
  });
  it('gives nothing for a chord with no length', () => {
    expect(strumEvents(folk, 0, 2)).toEqual([]);
  });
});

describe('pattern blocks', () => {
  it('treats an all-default section as one default run', () => {
    const { song, verse } = build();
    const blocks = patternBlocks(song, verse);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ own: undefined, patternId: 'block', startIndex: 0, endIndex: 3, startBeat: 0, beats: 12 });
  });
  it('splits where the own pattern changes', () => {
    const { song, verse } = build();
    const next = setChordPatterns(setChordPatterns(song, verse, 0, 1, 'custom:folk'), verse, 2, 2, 'pulse');
    expect(patternBlocks(next, verse).map((b) => [b.own, b.startIndex, b.endIndex, b.startBeat, b.beats])).toEqual([
      ['custom:folk', 0, 1, 0, 6],
      ['pulse', 2, 2, 6, 2],
      [undefined, 3, 3, 8, 4],
    ]);
  });
  it('has no blocks for an unknown section', () => {
    expect(patternBlocks(build().song, 'nope')).toEqual([]);
  });
  it('ignores an own pattern whose custom pattern was deleted', () => {
    const { song } = build();
    expect(ownPattern(song, { pattern: 'custom:gone' })).toBeUndefined();
    expect(ownPattern(song, { pattern: 'custom:folk' })).toBe('custom:folk');
  });
});

describe('chordPattern and chordStrokes', () => {
  it('accumulates phase along a block', () => {
    const { song, verse, ids } = build();
    const next = patternForSection(song, verse, 'custom:folk');
    expect(ids.map((id) => chordPattern(next, id)!.phaseBeats)).toEqual([0, 4, 6, 8]);
  });
  it('returns null strokes for a built-in pattern, and shortens with a beats override', () => {
    const { song, verse, ids } = build();
    expect(chordStrokes(song, ids[0]!)).toBeNull();
    const next = patternForSection(song, verse, 'custom:folk');
    expect(chordStrokes(next, ids[0]!)!.length).toBeGreaterThan(chordStrokes(next, ids[0]!, 1)!.length);
  });
});

describe('block operations', () => {
  it('a default run gets the pattern on one chord only; a block changes whole; null clears it', () => {
    const { song, ids } = build();
    const one = setBlockPattern(song, ids[1]!, 'custom:folk');
    expect(own(one)).toEqual([undefined, 'custom:folk', undefined, undefined]);
    const grown = setBlockLength(one, ids[1]!, 2);
    expect(own(setBlockPattern(grown, ids[1]!, 'pulse'))).toEqual([undefined, 'pulse', 'pulse', undefined]);
    expect(own(setBlockPattern(grown, ids[2]!, null))).toEqual([undefined, undefined, undefined, undefined]);
  });
  it('setBlockLength grows over others, clamps, shrinks, and ignores default runs', () => {
    const { song, verse, ids } = build();
    const start = setChordPatterns(setChordPatterns(song, verse, 0, 0, 'custom:folk'), verse, 2, 2, 'pulse');
    expect(own(setBlockLength(start, ids[0]!, 3))).toEqual(['custom:folk', 'custom:folk', 'custom:folk', undefined]);
    expect(own(setBlockLength(start, ids[0]!, 99))).toEqual(Array(4).fill('custom:folk'));
    expect(own(setBlockLength(setBlockLength(start, ids[0]!, 3), ids[0]!, 1))).toEqual(['custom:folk', undefined, undefined, undefined]);
    expect(own(setBlockLength(start, ids[0]!, 0))).toEqual(own(start));
    expect(setBlockLength(song, ids[0]!, 2)).toBe(song);
  });
  it('patternForChordOnly keeps one chord, patternForSection paints all, patternForSong clears the rest', () => {
    const { song, verse, ids } = build();
    const all = patternForSection(song, verse, 'custom:folk');
    expect(own(patternForChordOnly(all, ids[1]!))).toEqual([undefined, 'custom:folk', undefined, undefined]);
    const wide = patternForSong(all, 'pulse');
    expect(wide.pattern).toBe('pulse');
    expect(own(wide)).toEqual(Array(4).fill(undefined));
  });
  it('ignores a custom pattern that does not exist', () => {
    const { song, verse, ids } = build();
    expect(setBlockPattern(song, ids[0]!, 'custom:nope')).toBe(song);
    expect(patternForSection(song, verse, 'custom:nope')).toBe(song);
    expect(patternForSong(song, 'custom:nope')).toBe(song);
    expect(blockOf(song, ids[0]!)).not.toBeNull();
  });
});
