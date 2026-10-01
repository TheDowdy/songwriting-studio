import { describe, expect, it } from 'vitest';
import { addChord, diatonicChords } from './index';
import { insertionPoint } from './insertion';
import { newSong } from './song';

const KEY = { tonic: 'C', mode: 'major' } as const;
const [I, , , IV, V] = diatonicChords(KEY);

describe('insertionPoint', () => {
  it('goes after the focused chord, in its own section', () => {
    let song = newSong(KEY);
    const sectionId = song.sections[0]!.id;
    const a = addChord(song, sectionId, null, I!);
    song = a.song;
    const b = addChord(song, sectionId, a.eventId as string, V!);
    song = b.song;
    expect(insertionPoint(song, a.eventId as string)).toEqual({ sectionId, afterEventId: a.eventId });
  });

  it('with nothing focused, extends the end of the last section in the arrangement', () => {
    let song = newSong(KEY);
    const sectionId = song.sections[0]!.id;
    const a = addChord(song, sectionId, null, I!);
    song = a.song;
    const b = addChord(song, sectionId, a.eventId as string, IV!);
    song = b.song;
    expect(insertionPoint(song, null)).toEqual({ sectionId, afterEventId: b.eventId });
    // A stale focus id behaves like no focus.
    expect(insertionPoint(song, 'gone')).toEqual({ sectionId, afterEventId: b.eventId });
  });

  it('an empty song points at the start of its first section', () => {
    const song = newSong(KEY);
    expect(insertionPoint(song, null)).toEqual({ sectionId: song.sections[0]!.id, afterEventId: null });
  });

  it('is null for a song with no sections', () => {
    expect(insertionPoint({ ...newSong(KEY), sections: [], arrangement: [] }, null)).toBeNull();
  });
});
