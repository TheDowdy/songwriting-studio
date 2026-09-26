import { describe, expect, it } from 'vitest';
import { edgeOpacity, slidingNotes } from '../src/theory/fretboard';
import { parseNote } from '../src/theory/notes';
import {
  CUSTOM_ID,
  deleteTuning,
  exportTunings,
  findSavedByName,
  importTunings,
  renameTuning,
  resolveTuning,
  sanitizeSaved,
  sanitizeTuning,
  saveTuning,
  suggestName,
} from '../src/theory/savedTunings';
import { getPreset, STANDARD_TUNING, type Tuning } from '../src/theory/tunings';
import {
  interpolateAtFret,
  interpolateClamped,
  fretCentreXs,
  fretWireXs,
} from '../src/components/Fretboard/geometry';

const notes = (text: string) => text.split(' ').map(parseNote);
const CGDGBD = notes('C2 G2 D3 G3 B3 D4');

describe('resolveTuning', () => {
  it('names an edit that equals a preset after that preset', () => {
    expect(resolveTuning(notes('D2 A2 D3 G3 B3 E4'), []).id).toBe('drop-d');
    expect(resolveTuning(STANDARD_TUNING.strings, []).id).toBe('standard');
  });

  it('falls back to a saved tuning, then Custom', () => {
    const saved: Tuning = { id: 'u1', name: 'Mine', strings: CGDGBD, builtIn: false };
    expect(resolveTuning(CGDGBD, [saved]).id).toBe('u1');
    const custom = resolveTuning(notes('E2 A2 D3 G3 B3 F4'), [saved]);
    expect(custom).toMatchObject({ id: CUSTOM_ID, name: 'Custom', builtIn: false });
  });

  it('prefers a preset over a saved tuning with the same strings', () => {
    const dup: Tuning = {
      id: 'u2',
      name: 'Copy',
      strings: getPreset('drop-d')!.strings,
      builtIn: false,
    };
    expect(resolveTuning(dup.strings, [dup]).id).toBe('drop-d');
  });
});

describe('saving, renaming, deleting', () => {
  it('suggests a name from the notes', () => {
    expect(suggestName(CGDGBD, 'sharp')).toBe('C G D G B D');
    expect(suggestName(notes('E♭2 A♭2 D♭3 G♭3 B♭3 E♭4'), 'flat')).toBe('E♭ A♭ D♭ G♭ B♭ E♭');
  });

  it('adds a new tuning with a fresh id', () => {
    const r = saveTuning([], '  My   tuning ', CGDGBD);
    expect(r.overwritten).toBe(false);
    expect(r.saved).toHaveLength(1);
    expect(r.tuning).toMatchObject({ name: 'My tuning', strings: CGDGBD, builtIn: false });
    expect(r.tuning.id).toMatch(/^user-/);
  });

  it('overwrites case-insensitively, keeping the id', () => {
    const first = saveTuning([], 'Cool', CGDGBD);
    const second = saveTuning(first.saved, 'cool', notes('D2 A2 D3 G3 B3 E4'));
    expect(second.overwritten).toBe(true);
    expect(second.saved).toHaveLength(1);
    expect(second.tuning.id).toBe(first.tuning.id);
    expect(second.saved[0]!.strings).toEqual(notes('D2 A2 D3 G3 B3 E4'));
    expect(findSavedByName(second.saved, 'COOL')).toBeDefined();
  });

  it('renames, rejecting empty names and clashes with other tunings', () => {
    const a = saveTuning([], 'A', CGDGBD);
    const b = saveTuning(a.saved, 'B', notes('D2 A2 D3 G3 B3 E4'));
    expect(renameTuning(b.saved, a.tuning.id, 'Renamed').saved[0]!.name).toBe('Renamed');
    expect(renameTuning(b.saved, a.tuning.id, '  ').error).toBeDefined();
    expect(renameTuning(b.saved, a.tuning.id, 'b').error).toMatch(/already exists/);
    expect(renameTuning(b.saved, a.tuning.id, 'A').error).toBeUndefined(); // same tuning, same name
  });

  it('deletes by id', () => {
    const a = saveTuning([], 'A', CGDGBD);
    expect(deleteTuning(a.saved, a.tuning.id)).toEqual([]);
    expect(deleteTuning(a.saved, 'nope')).toHaveLength(1);
  });
});

describe('files exported before the rename', () => {
  it('still import (the old format tag is ignored)', () => {
    const old = JSON.stringify({
      format: 'fretscape-tunings',
      version: 1,
      tunings: [{ name: 'Old friend', strings: [38, 43, 50, 55, 59, 62] }],
    });
    const result = importTunings([], old);
    expect(result.errors).toEqual([]);
    expect(result.added).toBe(1);
    expect(result.saved[0]?.name).toBe('Old friend');
  });
});

describe('export / import', () => {
  it('round-trips through JSON', () => {
    const a = saveTuning([], 'A', CGDGBD);
    const b = saveTuning(a.saved, 'B', notes('D2 A2 D3 G3 B3 E4'));
    const text = exportTunings(b.saved);
    expect(JSON.parse(text)).toMatchObject({ format: 'fluid-frets-tunings', version: 1 });
    const back = importTunings([], text);
    expect(back.added).toBe(2);
    expect(back.errors).toEqual([]);
    expect(back.saved.map((t) => [t.name, t.strings])).toEqual(
      b.saved.map((t) => [t.name, t.strings]),
    );
  });

  it('skips identical entries and renames clashing names with different strings', () => {
    const a = saveTuning([], 'A', CGDGBD);
    const text = JSON.stringify([
      { name: 'a', strings: CGDGBD },
      { name: 'A', strings: notes('D2 A2 D3 G3 B3 E4') },
    ]);
    const r = importTunings(a.saved, text);
    expect(r.skipped).toBe(1);
    expect(r.added).toBe(1);
    expect(r.saved.map((t) => t.name)).toEqual(['A', 'A (2)']);
  });

  it('reports bad entries but keeps the good ones', () => {
    const text = JSON.stringify({
      tunings: [
        { name: 'Good', strings: CGDGBD },
        { name: 'Short', strings: [40, 45] },
        { name: '', strings: CGDGBD },
        { name: 'Float', strings: [40, 45, 50, 55, 59, 64.5] },
        null,
      ],
    });
    const r = importTunings([], text);
    expect(r.added).toBe(1);
    expect(r.errors).toHaveLength(4);
  });

  it('handles junk input without throwing', () => {
    expect(importTunings([], 'not json').errors).toHaveLength(1);
    expect(importTunings([], '{"hello":1}').errors).toHaveLength(1);
    expect(importTunings([], '42').errors).toHaveLength(1);
  });

  it('does not exceed the entry cap', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ name: `T${i}`, strings: CGDGBD }));
    const r = importTunings([], JSON.stringify(many));
    expect(r.saved.length).toBeLessThanOrEqual(200);
    expect(r.errors.at(-1)).toMatch(/first 200/);
  });
});

describe('sanitising persisted data', () => {
  it('keeps valid saved tunings and drops the rest', () => {
    const out = sanitizeSaved([
      { id: 'a', name: 'Ok', strings: CGDGBD },
      { id: 'b', name: 'Bad', strings: [1, 2, 3] },
      'junk',
      { id: 'c', strings: CGDGBD },
    ]);
    expect(out.map((t) => t.id)).toEqual(['a']);
    expect(sanitizeSaved(undefined)).toEqual([]);
  });

  it('falls back to standard for a corrupt current tuning', () => {
    expect(sanitizeTuning({ id: 'x', strings: [1] })).toBe(STANDARD_TUNING);
    expect(sanitizeTuning(null)).toBe(STANDARD_TUNING);
    expect(
      sanitizeTuning({ id: 'drop-d', name: 'Drop D', strings: CGDGBD, builtIn: true }).strings,
    ).toEqual(CGDGBD);
  });
});

describe('sliding notes (pitch → position)', () => {
  it('at rest, shows frets 0…N exactly (plus nothing beyond)', () => {
    const notes = slidingNotes(45, 22);
    expect(notes.map((n) => n.fret)).toEqual(Array.from({ length: 23 }, (_, i) => i));
    expect(notes[0]!.midi).toBe(45);
    expect(notes.at(-1)!.midi).toBe(67);
  });

  it('every label moves by exactly the pitch change, so labels slide (higher pitch → left)', () => {
    const at = (p: number) => new Map(slidingNotes(p, 22).map((n) => [n.midi, n.fret]));
    const a = at(45);
    const b = at(45.3);
    for (const [midi, fret] of a) {
      if (b.has(midi)) expect(b.get(midi)!).toBeCloseTo(fret - 0.3, 10);
    }
  });

  it('brings new labels in from the edges as the pitch changes', () => {
    const down = slidingNotes(44.6, 22);
    // Lowering the pitch by 0.4: the note at MIDI 45 is now at fret 0.4, and MIDI 44 (fret −0.6)
    // is not yet visible, while MIDI 67 (fret 22.4) is.
    expect(down.find((n) => n.midi === 44)).toBeUndefined();
    expect(down.find((n) => n.midi === 67)!.fret).toBeCloseTo(22.4, 10);
    const half = slidingNotes(44.5, 22);
    expect(half.find((n) => n.midi === 44)!.fret).toBeCloseTo(-0.5, 10); // just appearing
  });

  it('holds only notes within half a fret of the neck', () => {
    for (const p of [40, 40.25, 40.5, 40.99, 43.5]) {
      for (const n of slidingNotes(p, 24)) {
        expect(n.fret).toBeGreaterThanOrEqual(-0.5 - 1e-9);
        expect(n.fret).toBeLessThanOrEqual(24.5 + 1e-9);
      }
    }
  });

  it('fades at the edges', () => {
    expect(edgeOpacity(0, 22)).toBe(1);
    expect(edgeOpacity(22, 22)).toBe(1);
    expect(edgeOpacity(-0.25, 22)).toBeCloseTo(0.5, 10);
    expect(edgeOpacity(-0.5, 22)).toBe(0);
    expect(edgeOpacity(22.25, 22)).toBeCloseTo(0.5, 10);
    expect(edgeOpacity(23, 22)).toBe(0);
  });
});

describe('interpolation along the neck', () => {
  const centres = fretCentreXs(fretWireXs(22, true));

  it('is exact at integer frets and linear between', () => {
    for (const f of [0, 1, 7, 22])
      expect(interpolateAtFret(centres, f)).toBeCloseTo(centres[f]!, 10);
    expect(interpolateAtFret(centres, 3.5)).toBeCloseTo((centres[3]! + centres[4]!) / 2, 10);
  });

  it('extends smoothly past the nut and the last fret', () => {
    expect(interpolateAtFret(centres, -0.5)).toBeLessThan(centres[0]!);
    expect(interpolateAtFret(centres, 22.5)).toBeGreaterThan(centres[22]!);
    // Continuous across the boundary.
    expect(interpolateAtFret(centres, -1e-9)).toBeCloseTo(centres[0]!, 6);
    expect(interpolateAtFret(centres, 22 + 1e-9)).toBeCloseTo(centres[22]!, 6);
  });

  it('is monotonic in fret, so labels never cross each other', () => {
    let prev = -Infinity;
    for (let f = -0.5; f <= 22.5; f += 0.05) {
      const x = interpolateAtFret(centres, f);
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it('clamped interpolation holds the end values', () => {
    const spaces = [44, 60, 58, 50];
    expect(interpolateClamped(spaces, -1)).toBe(44);
    expect(interpolateClamped(spaces, 9)).toBe(50);
    expect(interpolateClamped(spaces, 0.5)).toBe(52);
  });
});
