import { describe, expect, it } from 'vitest';
import { diatonicChords } from './theory/chords';
import { flattenSong, newSong, sectionLoopBounds } from './song';

const c = { tonic: 'C', mode: 'major' } as const;

describe('song helpers', () => {
  it('flattenSong follows the arrangement and repeat counts', () => {
    const song = newSong();
    const [a, b] = diatonicChords(c);
    const sec = song.sections[0];
    sec.events = [
      { id: 'e1', chord: a as never, beats: 4 },
      { id: 'e2', chord: b as never, beats: 4 },
    ];
    sec.repeat = 2;
    expect(flattenSong(song).map((e) => e.id)).toEqual(['e1', 'e2', 'e1', 'e2']);
  });
  it('sectionLoopBounds spans just one arrangement slot, including its own repeats', () => {
    const song = newSong();
    const [a] = diatonicChords(c);
    const verse = song.sections[0];
    verse.events = [
      { id: 'e1', chord: a as never, beats: 4 },
      { id: 'e2', chord: a as never, beats: 2 },
    ];
    verse.repeat = 2; // spans beats 0–12
    const chorus = { id: 'chorus', name: 'Chorus', repeat: 1, events: [{ id: 'e3', chord: a as never, beats: 4 }] };
    const withChorus = { ...song, sections: [verse, chorus], arrangement: [verse.id, chorus.id] };
    expect(sectionLoopBounds(withChorus, verse.id)).toEqual({ start: 0, end: 12 });
    expect(sectionLoopBounds(withChorus, chorus.id)).toEqual({ start: 12, end: 16 });
    expect(sectionLoopBounds(withChorus, 'missing')).toBeNull();
  });

  it('newSong is a valid v2 song with a standard guitar setup', () => {
    const song = newSong();
    expect(song.schemaVersion).toBe(2);
    expect(song.guitar.capo).toBe(0);
    expect(song.guitar.tuning).toHaveLength(6);
    expect(song.sections).toHaveLength(1);
    expect(song.arrangement).toEqual([song.sections[0]!.id]);
  });
});
