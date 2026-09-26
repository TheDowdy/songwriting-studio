import { describe, expect, it } from 'vitest';
import {
  cycleOpen,
  emptySelection,
  isEmpty,
  readSelection,
  selectionToShape,
  shapeToSelection,
  tapSelection,
  type IdentifyCell,
} from '../src/theory/identifySelection';

const STANDARD = [40, 45, 50, 55, 59, 64];

/** Build a selection from "x-3-2-0-1-0" (x = muted). */
const sel = (shape: string): IdentifyCell[] =>
  shape.split('-').map((f) => (f === 'x' ? 'x' : Number(f)));
const read = (shape: string, pref: 'sharp' | 'flat' = 'sharp') =>
  readSelection(STANDARD, sel(shape), pref);
const best = (shape: string) => read(shape).readings[0]?.name;

describe('selection rules', () => {
  it('starts empty', () => {
    expect(emptySelection()).toEqual([null, null, null, null, null, null]);
    expect(isEmpty(emptySelection())).toBe(true);
  });

  it('tapping a fret selects it', () => {
    expect(tapSelection(emptySelection(), 2, 5)[2]).toBe(5);
  });

  it('allows at most one note per string: another fret on the same string moves the pick', () => {
    let s = tapSelection(emptySelection(), 2, 5);
    s = tapSelection(s, 2, 7);
    expect(s[2]).toBe(7);
    expect(s.filter((c) => typeof c === 'number')).toHaveLength(1);
    // Other strings are untouched.
    s = tapSelection(s, 4, 3);
    s = tapSelection(s, 2, 9);
    expect(s).toEqual([null, null, 9, null, 3, null]);
  });

  it('tapping the picked fret again deselects it', () => {
    const s = tapSelection(tapSelection(emptySelection(), 2, 5), 2, 5);
    expect(s[2]).toBeNull();
    expect(isEmpty(s)).toBe(true);
  });

  it('does not change the selection it was given', () => {
    const before = emptySelection();
    tapSelection(before, 0, 3);
    cycleOpen(before, 0);
    expect(before).toEqual(emptySelection());
  });
});

describe('the toggle behind the nut', () => {
  it('cycles unused → open → muted → unused', () => {
    let s = emptySelection();
    s = tapSelection(s, 1, 0);
    expect(s[1]).toBe(0);
    s = tapSelection(s, 1, 0);
    expect(s[1]).toBe('x');
    s = tapSelection(s, 1, 0);
    expect(s[1]).toBeNull();
    s = tapSelection(s, 1, 0);
    expect(s[1]).toBe(0);
  });

  it('a fretted string goes to open first', () => {
    expect(cycleOpen(tapSelection(emptySelection(), 3, 5), 3)[3]).toBe(0);
  });

  it('only sounds fretted and open strings', () => {
    expect(selectionToShape(sel('x-3-2-0-1-0'))).toEqual([null, 3, 2, 0, 1, 0]);
    expect(selectionToShape([null, 'x', 3, 0, null, 'x'])).toEqual([null, null, 3, 0, null, null]);
    expect(shapeToSelection([null, 3, 0])).toEqual(['x', 3, 0]);
  });

  it('a muted or unused string does not count as picked', () => {
    expect(isEmpty(['x', null, 'x', null, null, null])).toBe(true);
    expect(isEmpty([null, 0, null, null, null, null])).toBe(false);
  });
});

describe('the plan’s identification examples, from the neck', () => {
  it('x-3-2-0-1-0 → C', () => expect(best('x-3-2-0-1-0')).toBe('C'));
  it('0-2-2-1-0-0 → E', () => expect(best('0-2-2-1-0-0')).toBe('E'));
  it('x-0-2-2-1-0 → Am', () => expect(best('x-0-2-2-1-0')).toBe('Am'));
  it('x-x-0-2-3-2 → D', () => expect(best('x-x-0-2-3-2')).toBe('D'));
  it('0-2-2-1-0-0 with string 6 muted → E/B', () => expect(best('x-2-2-1-0-0')).toBe('E/B'));

  it('a C6 shape is C6 with Am/C as an alternative', () => {
    const names = read('x-3-2-2-1-0').readings.map((r) => r.name);
    expect(names[0]).toBe('C6');
    expect(names).toContain('Am/C');
  });

  // The plan says G5 / G(no3) and A6 for these two; the notes played are a G major chord
  // (G D G B) and A7 (A E G C♯ E) — see the Phase 7 notes.
  it('3-x-0-0-0-x sounds G D G B, a G major chord', () => expect(best('3-x-0-0-0-x')).toBe('G'));
  it('x-0-2-0-2-0 sounds A E G C♯ E, an A7', () => expect(best('x-0-2-0-2-0')).toBe('A7'));

  it('a power chord is named as one', () => {
    expect(best('3-x-0-x-x-x')).toBe('G5');
    expect(read('3-x-0-x-x-x').readings[0]?.kind).toBe('power');
  });
});

describe('spelled notes and intervals', () => {
  it('lists the sounding notes lowest first with their intervals from the root', () => {
    const { notes } = read('x-3-2-0-1-0');
    expect(notes.map((n) => n.name.letter + (n.name.acc ? '?' : ''))).toEqual([
      'C',
      'E',
      'G',
      'C',
      'E',
    ]);
    expect(notes.map((n) => n.interval)).toEqual(['R', '3', '5', 'R', '3']);
    expect(notes.map((n) => n.midi)).toEqual([48, 52, 55, 60, 64]);
  });

  it('measures intervals from the chord’s root, not the bass', () => {
    // E/B: the bass is B (the 5th).
    expect(read('x-2-2-1-0-0').notes.map((n) => n.interval)).toEqual(['5', 'R', '3', '5', 'R']);
  });

  it('spells for the chord: G♯ in E major, B♭ in an F chord', () => {
    const e = read('0-2-2-1-0-0').notes.map((n) => n.name.letter + n.name.acc);
    expect(e).toContain('G1');
    const f = readSelection(STANDARD, sel('1-3-3-2-1-1'), 'flat').notes;
    expect(f.map((n) => n.interval)).toEqual(['R', '5', 'R', '3', '5', 'R']);
  });

  it('a lone note is just that note; two notes give an interval', () => {
    const one = readSelection(STANDARD, [null, 3, null, null, null, null]);
    expect(one.readings[0]).toMatchObject({ name: 'C', kind: 'note' });
    const two = readSelection(STANDARD, [null, 3, null, null, 4, null]); // C and D♯
    expect(two.readings[0]?.kind).toBe('interval');
    expect(two.notes.map((n) => n.interval)).toEqual(['R', '♭3']);
  });

  it('nothing picked, or only muted strings, is empty', () => {
    expect(readSelection(STANDARD, emptySelection())).toEqual({ notes: [], readings: [] });
    expect(readSelection(STANDARD, ['x', 'x', null, null, null, null]).readings).toEqual([]);
  });

  it('follows the tuning: the same frets name a different chord in another tuning', () => {
    // Open G (D G D G B D), all strings open: G major with the D in the bass.
    const openG = readSelection([38, 43, 50, 55, 59, 62], sel('0-0-0-0-0-0'));
    expect(openG.readings[0]?.name).toBe('G/D');
    expect(openG.notes[0]?.interval).toBe('5'); // the D in the bass is the 5th
  });
});
