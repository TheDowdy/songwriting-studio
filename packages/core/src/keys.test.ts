import { describe, expect, it } from 'vitest';
import { addChord, changeKey, changeSectionKey, addSection, duplicateSection } from './operations';
import { migrateSong } from './schema';
import { canToggleMajorMinor, toggleMajorMinor } from './chordQuality';
import { keyOfEvent, keyOfSection } from './keys';
import { buildChord, diatonicChords } from './theory/chords';
import { newSong } from './song';
import type { Key } from './theory/types';

const C: Key = { tonic: 'C', mode: 'major' };
const G: Key = { tonic: 'G', mode: 'major' };
const [I, ii, iii, IV, V, vi] = diatonicChords(C);

describe('toggleMajorMinor', () => {
  it('turns IV into a minor chord borrowed from the parallel minor, without changing the key', () => {
    const iv = toggleMajorMinor(IV!, C);
    expect(iv.root).toBe('F');
    expect(iv.quality).toBe('min');
    expect(iv.numeral).toBe('iv');
    expect(iv.origin).toBe('borrowed');
  });

  it('turns vi into VI (borrowed) and back again to the original', () => {
    const big = toggleMajorMinor(vi!, C);
    expect(big.quality).toBe('maj');
    expect(big.origin).toBe('borrowed');
    const back = toggleMajorMinor(big, C);
    expect(back.quality).toBe('min');
    expect(back.origin).toBe('diatonic');
    expect(back.numeral).toBe(vi!.numeral);
  });

  it('keeps the root, the flavour and the inversion', () => {
    const g7 = { ...V!, flavor: '7' as const, seventh: 'dom7' as const };
    const gm7 = toggleMajorMinor(g7, C);
    expect(gm7).toMatchObject({ root: 'G', quality: 'min', flavor: '7', seventh: 'min7' });
    const firstInv = { ...I!, bass: 'E' };
    const inv = toggleMajorMinor(firstInv, C);
    expect(inv.quality).toBe('min');
    expect(inv.bass).toBe('Eb'); // still in first inversion, over the new third
  });

  it('a secondary dominant that turns minor is no longer a secondary dominant', () => {
    const vOfV = buildChord({ root: 'D', quality: 'maj', origin: 'secondary' }, C);
    expect(vOfV.numeral).toMatch(/V\/V/);
    const dm = toggleMajorMinor(vOfV, C);
    expect(dm.origin).not.toBe('secondary');
    expect(dm.numeral).toBe('ii');
  });

  it('leaves chords that cannot swap alone', () => {
    const dim = buildChord({ root: 'B', quality: 'dim' }, C);
    expect(canToggleMajorMinor(dim)).toBe(false);
    expect(toggleMajorMinor(dim, C)).toBe(dim);
    const power = { ...I!, colour: { omit3: true } };
    expect(canToggleMajorMinor(power)).toBe(false);
    expect(canToggleMajorMinor(IV!)).toBe(true);
  });
});

describe('section keys', () => {
  it('migrateSong keeps a section key and drops a malformed one', () => {
    const song = newSong(C);
    const ok = migrateSong({ ...song, sections: [{ ...song.sections[0], key: { tonic: 'G', mode: 'major' } }] });
    expect(ok?.sections[0]?.key).toEqual(G);
    const bad = migrateSong({ ...song, sections: [{ ...song.sections[0], key: 'nope' }] });
    expect(bad?.sections[0]?.key).toBeUndefined();
    const junk = migrateSong({ ...song, sections: [{ ...song.sections[0], key: { tonic: 5, mode: 'weird' } }] });
    expect(junk?.sections[0]?.key).toEqual({ tonic: 'C', mode: 'major' });
  });

  it('keyOfSection and keyOfEvent fall back to the song key', () => {
    let song = newSong(C);
    const first = song.sections[0]!.id;
    const added = addChord(song, first, null, I!);
    song = added.song;
    expect(keyOfSection(song, first)).toEqual(C);
    song = changeSectionKey(song, first, G, 'relabel');
    expect(keyOfSection(song, first)).toEqual(G);
    expect(keyOfEvent(song, added.eventId)).toEqual(G);
    expect(keyOfSection(song, 'missing')).toEqual(C);
  });

  it('changeSectionKey transposes only that section and can return it to the song key', () => {
    let song = newSong(C);
    const verse = song.sections[0]!.id;
    song = addChord(song, verse, null, I!).song;
    const chorus = (song = addSection(song, 'Chorus').song).sections[1]!.id;
    song = addChord(song, chorus, null, IV!).song;

    const up = changeSectionKey(song, chorus, G, 'transpose');
    expect(up.sections[1]!.key).toEqual(G);
    expect(up.sections[1]!.events[0]!.chord.root).toBe('C'); // F up a fifth is C
    expect(up.sections[1]!.events[0]!.chord.numeral).toBe('IV'); // numerals stay the same
    expect(up.sections[0]!.events[0]!.chord.root).toBe('C');
    expect(up.sections[0]!.key).toBeUndefined();

    const back = changeSectionKey(up, chorus, null, 'transpose');
    expect(back.sections[1]!.key).toBeUndefined();
    expect(back.sections[1]!.events[0]!.chord.root).toBe('F');

    // Choosing the song's own key is the same as removing the override.
    expect(changeSectionKey(up, chorus, C, 'transpose').sections[1]!.key).toBeUndefined();
  });

  it('relabel keeps the notes and recomputes numerals for the section key', () => {
    let song = newSong(C);
    const sid = song.sections[0]!.id;
    song = addChord(song, sid, null, V!).song; // G in C is V
    const rekeyed = changeSectionKey(song, sid, G, 'relabel');
    expect(rekeyed.sections[0]!.events[0]!.chord.root).toBe('G');
    expect(rekeyed.sections[0]!.events[0]!.chord.numeral).toBe('I');
  });

  it('changing the song key leaves a modulated section alone', () => {
    let song = newSong(C);
    const verse = song.sections[0]!.id;
    song = addChord(song, verse, null, I!).song;
    const bridgeId = (song = addSection(song, 'Bridge').song).sections[1]!.id;
    song = addChord(song, bridgeId, null, ii!).song;
    song = changeSectionKey(song, bridgeId, { tonic: 'E', mode: 'minor' }, 'relabel');
    const moved = changeKey(song, G, 'transpose');
    expect(moved.key).toEqual(G);
    expect(moved.sections[0]!.events[0]!.chord.root).toBe('G'); // verse followed the song key
    expect(moved.sections[1]!.key).toEqual({ tonic: 'E', mode: 'minor' });
    expect(moved.sections[1]!.events[0]!.chord.root).toBe('D'); // bridge unchanged
  });

  it('a duplicated section keeps its key', () => {
    let song = newSong(C);
    const sid = song.sections[0]!.id;
    song = changeSectionKey(addChord(song, sid, null, I!).song, sid, G, 'relabel');
    const copy = duplicateSection(song, sid);
    expect(song.sections[0]!.key).toEqual(G);
    expect(copy.song.sections.find((x) => x.id === copy.sectionId)?.key).toEqual(G);
    void iii;
  });
});
