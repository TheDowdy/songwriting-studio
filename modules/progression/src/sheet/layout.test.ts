import { describe, expect, it } from 'vitest';
import { addChord, addSection, changeSectionKey, diatonicChord, diatonicChords, newSong } from '@sw/core';
import { layoutBars, buildSheet, keySignatureFor, spellKey, splitDuration, splitStaves } from './layout';

const ev = (beats: number, symbol = 'C') => ({ symbol, numeral: 'I', midi: [36, 48, 52, 55], spellings: ['C', 'E', 'G'], beats });
const fourFour = { beats: 4, unit: 4 as const };

describe('splitDuration', () => {
  it('uses standard note lengths', () => {
    expect(splitDuration(16).map((d) => d.vex)).toEqual(['w']);
    expect(splitDuration(12).map((d) => d.vex)).toEqual(['hd']);
    expect(splitDuration(4).map((d) => d.vex)).toEqual(['q']);
    expect(splitDuration(5).map((d) => d.vex)).toEqual(['q', '16']);
  });
});

describe('spellKey', () => {
  it('keeps the chord spelling and computes the octave', () => {
    expect(spellKey(60, ['C', 'E', 'G'])).toBe('c/4');
    expect(spellKey(61, ['Db', 'F', 'Ab'])).toBe('db/4');
    expect(spellKey(61, ['C#', 'E#', 'G#'])).toBe('c#/4');
    expect(spellKey(71, ['Cb', 'Eb', 'Gb'])).toBe('cb/5'); // Cb5 sounds as B4
  });
});

describe('splitStaves', () => {
  it('puts notes below middle C on the bass staff', () => {
    const { treble, bass } = splitStaves([36, 48, 52, 55, 60, 64], ['C', 'E', 'G']);
    expect(bass).toEqual(['c/2', 'c/3', 'e/3', 'g/3']);
    expect(treble).toEqual(['c/4', 'e/4']);
  });
});

describe('layoutBars', () => {
  it('fills bars exactly: four 4-beat chords are four bars of one whole note each', () => {
    const bars = layoutBars([ev(4), ev(4), ev(4), ev(4)], fourFour);
    expect(bars).toHaveLength(4);
    expect(bars.every((b) => b.notes.length === 1 && b.notes[0].vex === 'w')).toBe(true);
  });
  it('puts two 2-beat chords in one bar', () => {
    const bars = layoutBars([ev(2, 'C'), ev(2, 'F')], fourFour);
    expect(bars).toHaveLength(1);
    expect(bars[0].notes.map((n) => [n.vex, n.symbol])).toEqual([['h', 'C'], ['h', 'F']]);
  });
  it('splits a chord across a bar line and ties it', () => {
    const bars = layoutBars([ev(2, 'C'), ev(4, 'F')], fourFour);
    expect(bars).toHaveLength(2);
    expect(bars[0].notes.map((n) => n.vex)).toEqual(['h', 'h']);
    expect(bars[0].notes[1].tieNext).toBe(true);
    expect(bars[1].notes[0].symbol).toBeUndefined(); // continuation carries no chord symbol
    expect(bars[1].notes[0].tieNext).toBe(false);
    expect(bars[1].notes[1].rest).toBe(true); // 2 beats of the second bar are left over, rested
  });
  it('a chord longer than a bar ties across several bars', () => {
    const bars = layoutBars([ev(8)], fourFour);
    expect(bars).toHaveLength(2);
    expect(bars[0].notes[0].tieNext).toBe(true);
    expect(bars[1].notes[0].tieNext).toBe(false);
  });
  it('handles 6/8 (beats are eighth notes)', () => {
    const bars = layoutBars([ev(6), ev(3), ev(3)], { beats: 6, unit: 8 });
    expect(bars).toHaveLength(2);
    expect(bars[0].notes[0].vex).toBe('hd');
    expect(bars[1].notes.map((n) => n.vex)).toEqual(['qd', 'qd']);
  });
});

describe('keySignatureFor', () => {
  it('maps modes to their relative major signature', () => {
    expect(keySignatureFor({ tonic: 'C', mode: 'major' })).toBe('C');
    expect(keySignatureFor({ tonic: 'A', mode: 'minor' })).toBe('C');
    expect(keySignatureFor({ tonic: 'D', mode: 'dorian' })).toBe('C');
    expect(keySignatureFor({ tonic: 'D', mode: 'major' })).toBe('D');
    expect(keySignatureFor({ tonic: 'E', mode: 'minor' })).toBe('G');
  });
  it('uses the imported chord helper without error', () => {
    expect(diatonicChord({ tonic: 'C', mode: 'major' }, 0).root).toBe('C');
  });
});

describe('buildSheet and section keys', () => {
  const C = { tonic: 'C', mode: 'major' } as const;
  const G = { tonic: 'G', mode: 'major' } as const;
  const [I, , , IV] = diatonicChords(C);

  function twoSections() {
    let song = newSong(C);
    const verse = song.sections[0]!.id;
    song = addChord(song, verse, null, I!).song;
    const added = addSection(song, 'Chorus');
    song = addChord(added.song, added.sectionId, null, IV!).song;
    return { song, chorus: added.sectionId };
  }

  it('draws every section in the song key when none modulates', () => {
    const sheet = buildSheet(twoSections().song, 'C Major');
    expect(sheet.sections.map((s) => s.keySignature)).toEqual(['C', 'C']);
    expect(sheet.sections.map((s) => s.keyChange)).toEqual([false, false]);
    expect(sheet.sections.every((s) => s.cancelKeySignature === undefined)).toBe(true);
  });

  it('gives a modulated section its own signature and marks the change, cancelling the old one', () => {
    const { song, chorus } = twoSections();
    const sheet = buildSheet(changeSectionKey(song, chorus, G, 'relabel'), 'C Major');
    expect(sheet.keySignature).toBe('C'); // the header still states the song's key
    expect(sheet.sections.map((s) => s.keySignature)).toEqual(['C', 'G']);
    expect(sheet.sections.map((s) => s.keyLabel)).toEqual(['C Major', 'G Major']);
    expect(sheet.sections.map((s) => s.keyChange)).toEqual([false, true]);
    expect(sheet.sections[1]!.cancelKeySignature).toBe('C');
  });

  it('a minor key shares its relative major’s signature, so no cancelling is drawn between them', () => {
    const { song, chorus } = twoSections();
    const sheet = buildSheet(changeSectionKey(song, chorus, { tonic: 'A', mode: 'minor' }, 'relabel'), 'C Major');
    expect(sheet.sections[1]!.keyChange).toBe(true); // the key did change
    expect(sheet.sections[1]!.keySignature).toBe('C');
    expect(sheet.sections[1]!.cancelKeySignature).toBeUndefined(); // but the signature did not
  });

  it('follows the arrangement: the change is marked where the key differs from the section played before', () => {
    const { song, chorus } = twoSections();
    const verse = song.sections[0]!.id;
    const arranged = { ...changeSectionKey(song, chorus, G, 'relabel'), arrangement: [verse, chorus, verse] };
    const sheet = buildSheet(arranged, 'C Major');
    expect(sheet.sections.map((s) => s.keyChange)).toEqual([false, true, true]);
    expect(sheet.sections[2]!.cancelKeySignature).toBe('G');
  });
});
