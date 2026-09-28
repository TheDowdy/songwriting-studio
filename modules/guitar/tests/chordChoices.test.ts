import { describe, expect, it } from 'vitest';
import { addChord, chordKey, chordName, newSong, type ChordRef, type Song } from '@sw/core';
import { chordChoices } from '../src/state/chordChoices';

const KEY = { tonic: 'C', mode: 'major' } as const;
const chord = (root: string, quality: ChordRef['quality'], numeral: string): ChordRef => ({
  root,
  quality,
  seventh: quality === 'min' ? 'min7' : 'maj7',
  flavor: 'triad',
  origin: 'diatonic',
  numeral,
});

function songWith(chords: ChordRef[]): { song: Song; ids: string[] } {
  let song = newSong(KEY);
  const ids: string[] = [];
  for (const c of chords) {
    const r = addChord(song, song.sections[0]!.id, ids[ids.length - 1] ?? null, c);
    song = r.song;
    ids.push(r.eventId);
  }
  return { song, ids };
}

describe('chordChoices', () => {
  it('an empty song offers the key’s diatonic chords to start with', () => {
    const { suggested, diatonic } = chordChoices(newSong(KEY), null, 'add');
    expect(suggested).toEqual([]);
    expect(diatonic.map(chordName)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  });

  it('adding after a chord ranks what follows it, then the rest of the key', () => {
    const { song, ids } = songWith([chord('C', 'maj', 'I'), chord('G', 'maj', 'V')]);
    const { suggested, diatonic } = chordChoices(song, ids[1]!, 'add');
    expect(suggested.length).toBeGreaterThan(0);
    // No chord appears twice across the two lists.
    const all = [...suggested.map((s) => chordKey(s.chord)), ...diatonic.map(chordKey)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('replacing a chord judges candidates against the chord before it, not the one replaced', () => {
    const { song, ids } = songWith([chord('C', 'maj', 'I'), chord('G', 'maj', 'V')]);
    const replaceG = chordChoices(song, ids[1]!, 'replace');
    const afterC = chordChoices(song, ids[0]!, 'add');
    expect(replaceG.suggested.map((s) => chordKey(s.chord))).toEqual(afterC.suggested.map((s) => chordKey(s.chord)));
  });

  it('replacing the first chord offers the starting chords', () => {
    const { song, ids } = songWith([chord('C', 'maj', 'I')]);
    const { suggested, diatonic } = chordChoices(song, ids[0]!, 'replace');
    expect(suggested).toEqual([]);
    expect(diatonic.length).toBe(7);
  });
});
