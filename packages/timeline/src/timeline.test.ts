import { describe, expect, it } from 'vitest';
import { addChord, addSection, diatonicChord, DEFAULT_KEY, makeVariant, newSong, type Song } from '@sw/core';
import { blockWidth } from './layout';
import { sectionsInOrder } from './order';
import { advancePlayhead, clearPlayhead, nextCursor, playhead } from './playhead';

/** Verse (2 chords), Chorus (1), arranged Verse · Chorus · Verse · Chorus. */
function song(): Song {
  let s = newSong();
  const verseId = s.sections[0]!.id;
  const first = addChord(s, verseId, null, diatonicChord(DEFAULT_KEY, 1));
  s = addChord(first.song, verseId, first.eventId, diatonicChord(DEFAULT_KEY, 5)).song;
  const added = addSection(s, 'Chorus');
  s = addChord(added.song, added.sectionId, null, diatonicChord(DEFAULT_KEY, 4)).song;
  return { ...s, arrangement: [verseId, added.sectionId, verseId, added.sectionId] };
}

describe('blockWidth', () => {
  it('grows with the beats and never drops below the minimum', () => {
    expect(blockWidth(1, 'compact')).toBe(64);
    expect(blockWidth(4, 'compact')).toBe(96);
    expect(blockWidth(8, 'compact')).toBe(192);
    expect(blockWidth(4, 'comfortable')).toBe(176);
    expect(blockWidth(1, 'comfortable')).toBe(56);
  });
  it('makes a longer chord wider once past the minimum', () => {
    expect(blockWidth(8, 'compact')).toBeGreaterThan(blockWidth(4, 'compact'));
  });
});

describe('sectionsInOrder', () => {
  it('lists each section once, in first-played order', () => {
    const s = song();
    expect(sectionsInOrder(s).map((x) => x.name)).toEqual([s.sections[0]!.name, 'Chorus']);
  });
  it('puts a variant right after its source, wherever it plays', () => {
    let s = song();
    const [verse, chorus] = s.sections;
    const v = makeVariant(s, verse!.id, 'Up the neck');
    s = { ...v.song, arrangement: [verse!.id, chorus!.id, v.sectionId] };
    expect(sectionsInOrder(s).map((x) => x.id)).toEqual([verse!.id, v.sectionId, chorus!.id]);
  });
  it('still lists a section the arrangement never plays', () => {
    const s = song();
    const extra = addSection(s, 'Outro');
    expect(sectionsInOrder(extra.song).map((x) => x.name)).toContain('Outro');
  });
});

describe('playhead', () => {
  it('finds the next place a chord plays, wrapping round', () => {
    expect(nextCursor(['a', 'b', 'a', 'b'], null, 'a')).toBe(0);
    expect(nextCursor(['a', 'b', 'a', 'b'], 1, 'a')).toBe(2);
    expect(nextCursor(['a', 'b', 'a', 'b'], 3, 'a')).toBe(0);
    expect(nextCursor(['a'], 0, 'z')).toBe(-1);
  });
  it('follows the arrangement slot, even when a section repeats', () => {
    const s = song();
    const verse = s.sections[0]!;
    const chorus = s.sections[1]!;
    const slots: (number | null)[] = [];
    for (const id of [verse.events[0]!.id, verse.events[1]!.id, chorus.events[0]!.id, verse.events[0]!.id, verse.events[1]!.id, chorus.events[0]!.id]) {
      advancePlayhead(s, id);
      slots.push(playhead.getState().slot);
    }
    expect(slots).toEqual([0, 0, 1, 2, 2, 3]);
    clearPlayhead();
    expect(playhead.getState().slot).toBeNull();
  });
});
