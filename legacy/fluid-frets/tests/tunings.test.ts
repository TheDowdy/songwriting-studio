import { describe, expect, it } from 'vitest';
import { midiToName, parseNote } from '../src/theory/notes';
import {
  clampToRange,
  defaultTuningName,
  findMatchingPreset,
  getPreset,
  isValidStrings,
  isWithinRange,
  PRESET_GROUPS,
  PRESET_TUNINGS,
  STANDARD_STRINGS,
  stringRange,
  validateTuning,
} from '../src/theory/tunings';

const notes = (id: string) => (getPreset(id)?.strings ?? []).map((m) => midiToName(m, 'flat'));

describe('presets', () => {
  it('ships every preset in §6 (22 in total, grouped)', () => {
    expect(PRESET_GROUPS.map((g) => [g.group, g.tunings.length])).toEqual([
      ['Standard & lowered', 5],
      ['Drop', 5],
      ['Open', 8],
      ['Modal & other', 4],
    ]);
    expect(PRESET_TUNINGS).toHaveLength(22);
  });

  it('every preset has 6 valid MIDI notes, a unique id and no validation errors', () => {
    const ids = new Set<string>();
    for (const t of PRESET_TUNINGS) {
      expect(t.strings, t.name).toHaveLength(6);
      expect(isValidStrings(t.strings), t.name).toBe(true);
      expect(validateTuning(t), t.name).toEqual([]);
      expect(t.builtIn).toBe(true);
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false);
      ids.add(t.id);
    }
  });

  it('matches the note lists from the plan', () => {
    expect(notes('standard')).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(notes('half-step-down')).toEqual(['E♭2', 'A♭2', 'D♭3', 'G♭3', 'B♭3', 'E♭4']);
    expect(notes('d-standard')).toEqual(['D2', 'G2', 'C3', 'F3', 'A3', 'D4']);
    expect(notes('c-standard')).toEqual(['C2', 'F2', 'B♭2', 'E♭3', 'G3', 'C4']);
    expect(notes('b-standard')).toEqual(['B1', 'E2', 'A2', 'D3', 'G♭3', 'B3']);
    expect(notes('drop-d')).toEqual(['D2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(notes('double-drop-d')).toEqual(['D2', 'A2', 'D3', 'G3', 'B3', 'D4']);
    expect(notes('drop-c-sharp')).toEqual(['D♭2', 'A♭2', 'D♭3', 'G♭3', 'B♭3', 'E♭4']);
    expect(notes('drop-c')).toEqual(['C2', 'G2', 'C3', 'F3', 'A3', 'D4']);
    expect(notes('drop-b')).toEqual(['B1', 'G♭2', 'B2', 'E3', 'A♭3', 'D♭4']);
    expect(notes('open-d')).toEqual(['D2', 'A2', 'D3', 'G♭3', 'A3', 'D4']);
    expect(notes('open-d-minor')).toEqual(['D2', 'A2', 'D3', 'F3', 'A3', 'D4']);
    expect(notes('open-g')).toEqual(['D2', 'G2', 'D3', 'G3', 'B3', 'D4']);
    expect(notes('open-g-minor')).toEqual(['D2', 'G2', 'D3', 'G3', 'B♭3', 'D4']);
    expect(notes('open-e')).toEqual(['E2', 'B2', 'E3', 'A♭3', 'B3', 'E4']);
    expect(notes('open-a')).toEqual(['E2', 'A2', 'E3', 'A3', 'D♭4', 'E4']);
    expect(notes('open-c')).toEqual(['C2', 'G2', 'C3', 'G3', 'C4', 'E4']);
    expect(notes('open-c6')).toEqual(['C2', 'A2', 'C3', 'G3', 'C4', 'E4']);
    expect(notes('dadgad')).toEqual(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);
    expect(notes('all-fourths')).toEqual(['E2', 'A2', 'D3', 'G3', 'C4', 'F4']);
    expect(notes('new-standard')).toEqual(['C2', 'G2', 'D3', 'A3', 'E4', 'G4']);
    expect(notes('nashville')).toEqual(['E3', 'A3', 'D4', 'G4', 'B3', 'E4']);
  });

  it('standard tuning is E2 A2 D3 G3 B3 E4 as MIDI', () => {
    expect(getPreset('standard')?.strings).toEqual([40, 45, 50, 55, 59, 64]);
    expect([...STANDARD_STRINGS]).toEqual([40, 45, 50, 55, 59, 64]);
  });
});

describe('validation', () => {
  const base = { id: 'x', name: 'X', strings: [...STANDARD_STRINGS], builtIn: false };

  it('accepts a good tuning', () => expect(validateTuning(base)).toEqual([]));

  it('rejects wrong string count, fractional and out-of-range notes, empty names', () => {
    expect(validateTuning({ ...base, strings: [40, 45, 50] })).not.toEqual([]);
    expect(validateTuning({ ...base, strings: [40, 45, 50, 55, 59, 64.5] })).not.toEqual([]);
    expect(validateTuning({ ...base, strings: [40, 45, 50, 55, 59, 200] })).not.toEqual([]);
    expect(validateTuning({ ...base, name: '  ' })).not.toEqual([]);
  });
});

describe('range limits (§0)', () => {
  it('allows 7 semitones down and 5 up by default', () => {
    expect(stringRange(0)).toEqual([33, 45]);
    expect(stringRange(5)).toEqual([57, 69]);
  });

  it('unlimited widens to ±24', () => {
    expect(stringRange(0, true)).toEqual([16, 64]);
  });

  it('clamps', () => {
    expect(clampToRange(10, 0)).toBe(33);
    expect(clampToRange(99, 0)).toBe(45);
    expect(clampToRange(42, 0)).toBe(42);
    expect(clampToRange(42.5, 0)).toBe(42.5);
    expect(clampToRange(10, 0, true)).toBe(16);
  });

  it('rejects an invalid string index', () => {
    expect(() => stringRange(6)).toThrow(RangeError);
  });

  it('covers Drop B and the other non-Nashville presets; Nashville needs the bypass', () => {
    for (const t of PRESET_TUNINGS) {
      expect(isWithinRange(t.strings), t.name).toBe(t.id !== 'nashville');
      expect(isWithinRange(t.strings, true), t.name).toBe(true);
    }
  });
});

describe('preset detection and naming', () => {
  it('finds the preset that matches exactly', () => {
    expect(findMatchingPreset(parseNotes('D2 A2 D3 G3 B3 E4'))?.id).toBe('drop-d');
    expect(findMatchingPreset(parseNotes('E2 A2 D3 G3 B3 E4'))?.id).toBe('standard');
  });

  it('returns undefined for custom tunings', () => {
    expect(findMatchingPreset(parseNotes('C2 G2 D3 G3 B3 D4'))).toBeUndefined();
  });

  it('builds the default save name from the notes', () => {
    expect(defaultTuningName(parseNotes('C2 G2 D3 G3 B3 D4'))).toBe('C G D G B D');
    expect(defaultTuningName(parseNotes('E♭2 A♭2 D♭3 G♭3 B♭3 E♭4'), 'flat')).toBe(
      'E♭ A♭ D♭ G♭ B♭ E♭',
    );
  });
});

function parseNotes(text: string): number[] {
  return text.split(' ').map(parseNote);
}
