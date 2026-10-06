import { describe, expect, it } from 'vitest';
import { addChord, diatonicChord, DEFAULT_KEY, newSong } from '@sw/core';
import { progressionBeatMarks } from './progressionPlayback';

describe('progressionBeatMarks', () => {
  it('marks every beat of every chord, a beat apart at the song tempo', () => {
    let song = newSong();
    const sectionId = song.sections[0]!.id;
    const a = addChord(song, sectionId, null, diatonicChord(DEFAULT_KEY, 1));
    song = addChord(a.song, sectionId, a.eventId, diatonicChord(DEFAULT_KEY, 5)).song;
    song = { ...song, bpm: 120, sections: song.sections.map((s) => ({ ...s, events: s.events.map((e, i) => ({ ...e, beats: i === 0 ? 2 : 3 })) })) };
    const marks = progressionBeatMarks(song, null);
    expect(marks.map((m) => [m.beat, m.atSeconds])).toEqual([
      [0, 0],
      [1, 0.5],
      [0, 1],
      [1, 1.5],
      [2, 2],
    ]);
    expect(marks[0]!.eventId).toBe(song.sections[0]!.events[0]!.id);
  });
});
