import { describe, expect, it } from 'vitest';
import {
  STRUM_PRESETS,
  cycleStrumStroke,
  emptyStrumPattern,
  resizeStrumPattern,
  sanitizeStrumPattern,
  sanitizeStrumPatterns,
  setStrumStep,
  strumEvents,
  strumGlyph,
  strumNotes,
  strumPatternFromPreset,
  strumVelocity,
  type StrumPattern,
  type StrumStep,
} from './strumPattern';

const D: StrumStep = { stroke: 'down', extent: 'full' };
const U: StrumStep = { stroke: 'up', extent: 'full' };
const folk = strumPatternFromPreset('p', STRUM_PRESETS[2]!); // D . D U . U D U in eighths

describe('strumEvents', () => {
  it('lays the pattern over one bar, skipping rests, each stroke lasting to the next', () => {
    const ev = strumEvents(folk, 4);
    expect(ev.map((e) => e.offsetBeats)).toEqual([0, 1, 1.5, 2.5, 3, 3.5]);
    expect(ev.map((e) => e.step.stroke)).toEqual(['down', 'down', 'up', 'up', 'down', 'up']);
    expect(ev.map((e) => e.durationBeats)).toEqual([1, 0.5, 1, 0.5, 0.5, 0.5]);
  });

  it('repeats to fill a longer chord and is cut off at the end of a shorter one', () => {
    expect(strumEvents(folk, 8).map((e) => e.offsetBeats)).toEqual([0, 1, 1.5, 2.5, 3, 3.5, 4, 5, 5.5, 6.5, 7, 7.5]);
    expect(strumEvents(folk, 2).map((e) => e.offsetBeats)).toEqual([0, 1, 1.5]);
    expect(strumEvents(folk, 2).at(-1)!.durationBeats).toBe(0.5);
    expect(strumEvents(folk, 0)).toEqual([]);
    expect(strumEvents(emptyStrumPattern('x', 'Empty'), 4)).toEqual([]);
  });

  it('handles a pattern of a different length from the chord (a waltz bar over a 4-beat chord)', () => {
    const waltz = strumPatternFromPreset('w', STRUM_PRESETS[5]!);
    expect(waltz.beats).toBe(3);
    expect(strumEvents(waltz, 4).map((e) => e.offsetBeats)).toEqual([0, 1, 2, 3]);
  });
});

describe('strumNotes', () => {
  const six = ['E', 'A', 'D', 'G', 'B', 'e'];
  it('a down stroke sounds low to high and an up stroke high to low', () => {
    expect(strumNotes(six, D)).toEqual(six);
    expect(strumNotes(six, U)).toEqual([...six].reverse());
  });
  it('a partial strum takes the lower or upper half', () => {
    expect(strumNotes(six, { stroke: 'down', extent: 'low' })).toEqual(['E', 'A', 'D']);
    expect(strumNotes(six, { stroke: 'down', extent: 'high' })).toEqual(['G', 'B', 'e']);
    expect(strumNotes(six, { stroke: 'up', extent: 'high' })).toEqual(['e', 'B', 'G']);
  });
  it('always sounds at least one note, and rounds the half up', () => {
    expect(strumNotes(['a'], { stroke: 'down', extent: 'high' })).toEqual(['a']);
    expect(strumNotes(['a', 'b', 'c'], { stroke: 'down', extent: 'low' })).toEqual(['a', 'b']);
    expect(strumNotes(['a', 'b', 'c'], { stroke: 'down', extent: 'high' })).toEqual(['b', 'c']);
    expect(strumNotes([], D)).toEqual([]);
  });
  it('does not change the notes it is given', () => {
    const notes = [1, 2, 3];
    strumNotes(notes, U);
    expect(notes).toEqual([1, 2, 3]);
  });
});

describe('editing', () => {
  it('cycles rest, down, up, rest, keeping the extent and accent', () => {
    expect(cycleStrumStroke(null)).toEqual({ stroke: 'down', extent: 'full' });
    expect(cycleStrumStroke({ stroke: 'down', extent: 'low', accent: true })).toEqual({ stroke: 'up', extent: 'low', accent: true });
    expect(cycleStrumStroke(U)).toBeNull();
  });

  it('setStrumStep replaces one step and ignores a bad index', () => {
    const p = emptyStrumPattern('x', 'X', 2, 1);
    expect(setStrumStep(p, 1, D).steps).toEqual([null, D]);
    expect(setStrumStep(p, 5, D)).toBe(p);
    expect(p.steps).toEqual([null, null]); // the original is untouched
  });

  it('resizing keeps strokes at the same moment in time', () => {
    const fine = resizeStrumPattern(folk, 4, 4);
    expect(fine.steps.length).toBe(16);
    expect(strumEvents(fine, 4).map((e) => e.offsetBeats)).toEqual(strumEvents(folk, 4).map((e) => e.offsetBeats));
    const coarse = resizeStrumPattern(folk, 4, 1);
    expect(coarse.steps).toEqual([D, D, null, D]); // only the strokes on a beat survive
    const longer = resizeStrumPattern(folk, 6, 2);
    expect(longer.steps.length).toBe(12);
    expect(longer.steps.slice(8)).toEqual([null, null, null, null]);
    expect(resizeStrumPattern(folk, 2, 2).steps.length).toBe(4);
    expect(resizeStrumPattern(folk, 99, 2).beats).toBe(8);
    expect(resizeStrumPattern(folk, 0, 2).beats).toBe(1);
  });

  it('describes a step in a word and gives up strokes less force than down strokes', () => {
    expect(['·', 'D', 'U', 'd', 'u'].join()).toBe([null, D, U, { stroke: 'down', extent: 'low' } as StrumStep, { stroke: 'up', extent: 'high' } as StrumStep].map(strumGlyph).join());
    expect(strumVelocity(U)).toBeLessThan(strumVelocity(D));
    expect(strumVelocity({ ...D, accent: true })).toBeGreaterThan(strumVelocity(D));
    expect(strumVelocity({ ...D, accent: true })).toBeLessThanOrEqual(1);
  });

  it('every preset is the right length and starts with a stroke or a rest only', () => {
    for (const preset of STRUM_PRESETS) {
      expect(preset.steps.length, preset.name).toBe(preset.beats * preset.stepsPerBeat);
      expect(strumEvents(strumPatternFromPreset('p', preset), preset.beats).length, preset.name).toBeGreaterThan(0);
    }
    // Copying a preset never shares its steps.
    const copy = strumPatternFromPreset('c', STRUM_PRESETS[0]!);
    copy.steps[0]!.stroke = 'up';
    expect(STRUM_PRESETS[0]!.steps[0]!.stroke).toBe('down');
  });
});

describe('sanitising', () => {
  it('keeps a good pattern as it is', () => {
    expect(sanitizeStrumPattern(folk)).toEqual(folk);
  });

  it('repairs a bad one: steps padded to length, unknown values dropped, size clamped', () => {
    const p = sanitizeStrumPattern({ id: 'a', name: '  ', beats: 99, stepsPerBeat: 3, steps: [{ stroke: 'down' }, { stroke: 'sideways' }, 'x', { stroke: 'up', extent: 'wild', accent: 'yes' }] }) as StrumPattern;
    expect(p.beats).toBe(8);
    expect(p.stepsPerBeat).toBe(2);
    expect(p.steps).toHaveLength(16);
    expect(p.steps[0]).toEqual({ stroke: 'down', extent: 'full' });
    expect(p.steps[1]).toBeNull();
    expect(p.steps[3]).toEqual({ stroke: 'up', extent: 'full' });
    expect(p.name).toBe('Pattern');
  });

  it('rejects things that are not patterns, and drops duplicates', () => {
    expect(sanitizeStrumPattern(null)).toBeNull();
    expect(sanitizeStrumPattern({ name: 'no id' })).toBeNull();
    expect(sanitizeStrumPattern({ id: '' })).toBeNull();
    expect(sanitizeStrumPatterns('nope')).toEqual([]);
    expect(sanitizeStrumPatterns([folk, { ...folk, name: 'dup' }, 5]).map((p) => p.name)).toEqual([folk.name]);
  });
});
