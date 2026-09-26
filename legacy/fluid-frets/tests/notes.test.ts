import { describe, expect, it } from 'vitest';
import {
  chromaticName,
  chromaticSpelling,
  formatNoteName,
  freqToMidi,
  midiOctave,
  midiToFreq,
  midiToName,
  midiToPitchName,
  noteNamePc,
  parseNote,
  parseNoteName,
  pitchClass,
  spellOnLetter,
  spelledMidiName,
} from '../src/theory/notes';

describe('MIDI / pitch class / frequency', () => {
  it('maps MIDI to pitch class, including negatives and fractions', () => {
    expect(pitchClass(60)).toBe(0);
    expect(pitchClass(40)).toBe(4);
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(63.6)).toBe(4);
  });

  it('uses C4 = 60 octave numbering', () => {
    expect(midiOctave(40)).toBe(2);
    expect(midiOctave(60)).toBe(4);
    expect(midiOctave(59)).toBe(3);
  });

  it('converts to frequency with A4 = 440 Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 10);
    expect(midiToFreq(45)).toBeCloseTo(110, 10); // open A string
    expect(midiToFreq(40)).toBeCloseTo(82.407, 3);
    expect(midiToFreq(69.5)).toBeCloseTo(440 * 2 ** (0.5 / 12), 10);
  });

  it('round-trips freq ↔ midi', () => {
    for (const m of [28, 40, 55.25, 69, 88]) expect(freqToMidi(midiToFreq(m))).toBeCloseTo(m, 10);
  });
});

describe('names and parsing', () => {
  it('names MIDI notes with octave', () => {
    expect(midiToName(40)).toBe('E2');
    expect(midiToName(39, 'flat')).toBe('E♭2');
    expect(midiToName(39, 'sharp')).toBe('D♯2');
    expect(midiToName(69)).toBe('A4');
  });

  it('names without octave', () => {
    expect(midiToPitchName(58, 'flat')).toBe('B♭');
    expect(midiToPitchName(58, 'sharp')).toBe('A♯');
  });

  it('parses ASCII and unicode accidentals', () => {
    expect(parseNote('E2')).toBe(40);
    expect(parseNote('B♭2')).toBe(46);
    expect(parseNote('Bb2')).toBe(46);
    expect(parseNote('F#3')).toBe(54);
    expect(parseNote('C♯2')).toBe(37);
    expect(parseNote('C-1')).toBe(0);
  });

  it('rejects junk', () => {
    expect(() => parseNote('H2')).toThrow();
    expect(() => parseNote('E')).toThrow();
    expect(() => parseNoteName('E2')).toThrow();
  });

  it('round-trips every MIDI value in guitar range for both preferences', () => {
    for (let m = 24; m <= 96; m++) {
      expect(parseNote(midiToName(m, 'sharp'))).toBe(m);
      expect(parseNote(midiToName(m, 'flat'))).toBe(m);
    }
  });

  it('gives octave by letter for enharmonic edge cases', () => {
    expect(spelledMidiName(59, { letter: 'C', acc: -1 })).toBe('C♭4');
    expect(spelledMidiName(60, { letter: 'B', acc: 1 })).toBe('B♯3');
  });

  it('formats double accidentals', () => {
    expect(formatNoteName({ letter: 'F', acc: 2 })).toBe('F𝄪');
    expect(formatNoteName({ letter: 'B', acc: -2 })).toBe('B𝄫');
    expect(formatNoteName({ letter: 'C', acc: 1 })).toBe('C♯');
  });
});

describe('spelling', () => {
  it('chromatic spelling follows the preference', () => {
    expect(formatNoteName(chromaticName(1, 'sharp'))).toBe('C♯');
    expect(formatNoteName(chromaticName(1, 'flat'))).toBe('D♭');
    expect(chromaticSpelling('sharp')).toHaveLength(12);
    expect(chromaticSpelling('flat')).toHaveLength(12);
  });

  it('every chromatic spelling round-trips to its pitch class', () => {
    for (const pref of ['sharp', 'flat'] as const) {
      for (let pc = 0; pc < 12; pc++) expect(noteNamePc(chromaticName(pc, pref))).toBe(pc);
    }
  });

  it('spells a pitch class on a given letter', () => {
    expect(spellOnLetter(10, 'B')).toEqual({ letter: 'B', acc: -1 });
    expect(spellOnLetter(7, 'F')).toEqual({ letter: 'F', acc: 2 });
    expect(spellOnLetter(0, 'B')).toEqual({ letter: 'B', acc: 1 });
    expect(spellOnLetter(1, 'A')).toBeNull(); // A→C♯ is four semitones: beyond a double accidental
  });
});
