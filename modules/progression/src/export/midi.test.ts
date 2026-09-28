import { describe, expect, it } from 'vitest';
import { buildChord, newEvent, newSong } from '@sw/core';
import type { Song } from '@sw/core';
import { buildMidi, midiFilename } from './midi';

const KEY = { tonic: 'C', mode: 'major' } as const;

function songWithChords(): Song {
  const song = newSong(KEY);
  const section = { ...song.sections[0] };
  section.events = [
    newEvent(buildChord({ root: 'C', quality: 'maj' }, KEY), 4),
    newEvent(buildChord({ root: 'G', quality: 'maj' }, KEY), 4),
  ];
  return { ...song, title: 'My Song!', sections: [section], arrangement: [section.id], pattern: 'block' };
}

describe('buildMidi', () => {
  it('sets tempo converted to quarter notes per minute', () => {
    const song = { ...songWithChords(), bpm: 120, timeSig: { beats: 6, unit: 8 as const } };
    const midi = buildMidi(song);
    // 120 eighth notes/min -> 60 quarter notes/min
    expect(midi.header.tempos[0].bpm).toBeCloseTo(60, 5);
  });

  it('sets the time signature header', () => {
    const song = { ...songWithChords(), timeSig: { beats: 7, unit: 8 as const } };
    const midi = buildMidi(song);
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([7, 8]);
  });

  it('writes a pattern track and a block-chords track', () => {
    const song = songWithChords();
    const midi = buildMidi(song);
    expect(midi.tracks.length).toBe(2);
    expect(midi.tracks[0].notes.length).toBeGreaterThan(0);
    expect(midi.tracks[1].notes.length).toBeGreaterThan(0);
  });

  it('the block track has one note-group per chord, at the right beat offsets', () => {
    const song = songWithChords();
    const midi = buildMidi(song);
    const blockTrack = midi.tracks[1];
    const secondsPerBeat = 60 / song.bpm;
    const starts = [...new Set(blockTrack.notes.map((n) => Math.round(n.time * 1000)))].sort((a, b) => a - b);
    expect(starts).toEqual([0, Math.round(4 * secondsPerBeat * 1000)]);
  });

  it('produces a non-empty binary file', () => {
    const midi = buildMidi(songWithChords());
    expect(midi.toArray().length).toBeGreaterThan(0);
  });

  it('handles an empty song without throwing', () => {
    const song = newSong(KEY);
    expect(() => buildMidi(song)).not.toThrow();
  });
});

describe('midiFilename', () => {
  it('slugifies the title', () => {
    expect(midiFilename({ ...songWithChords(), title: 'My Song!' })).toBe('my-song.mid');
  });

  it('falls back to "song" for an empty/blank title', () => {
    expect(midiFilename({ ...songWithChords(), title: '   ' })).toBe('song.mid');
  });
});

describe('guitar voicings (Phase 5 item 3)', () => {
  const openC = { frets: [null, 3, 2, 0, 1, 0], tuning: [40, 45, 50, 55, 59, 64], capo: 0, source: 'picked' as const };
  const withVoicing = (instrument: Song['instrument']): Song => {
    const song = songWithChords();
    const section = song.sections[0]!;
    const events = section.events.map((e, i) => (i === 0 ? { ...e, attachments: { guitar: openC } } : e));
    return { ...song, instrument, sections: [{ ...section, events }] };
  };
  const firstChordNotes = (song: Song, track: number) =>
    buildMidi(song)
      .tracks[track]!.notes.filter((n) => n.time === 0)
      .map((n) => n.midi)
      .sort((a, b) => a - b);

  it('on guitar, both tracks contain exactly the committed shape’s notes', () => {
    const song = withVoicing('guitar');
    expect(firstChordNotes(song, 1)).toEqual([48, 52, 55, 60, 64]);
    expect(firstChordNotes(song, 0)).toEqual([48, 52, 55, 60, 64]);
  });

  it('on any other instrument, the committed shape is ignored', () => {
    expect(firstChordNotes(withVoicing('piano'), 1)).not.toEqual([48, 52, 55, 60, 64]);
  });
});
