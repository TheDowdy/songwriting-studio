import { describe, expect, it } from 'vitest';
import { DEFAULT_CHORD, describeChord, type ChordSpec } from '../src/theory/chords';
import {
  bestVoicingIndex,
  bestVoicingWith,
  DEFAULT_VOICING_RULES,
  findVoicings,
  fingering,
  indexOfShape,
  MAX_LISTED_VOICINGS,
  searchVoicings,
  shapeNotes,
  shapeText,
  targetFromChord,
  type VoicingRules,
} from '../src/theory/voicings';

const STANDARD = [40, 45, 50, 55, 59, 64];
const OPEN_G = [38, 43, 50, 55, 59, 62];
const chord = (over: Partial<ChordSpec>) =>
  targetFromChord(describeChord({ ...DEFAULT_CHORD, ...over }));
const search = (
  target: ReturnType<typeof chord>,
  over: Partial<VoicingRules> = {},
  tuning: readonly number[] = STANDARD,
  frets = 24,
) => searchVoicings(tuning, frets, target, { ...DEFAULT_VOICING_RULES, ...over });
const shapes = (list: { frets: (number | null)[] }[]) => list.map((v) => shapeText(v.frets));
const best = (list: ReturnType<typeof search>) =>
  shapeText((list[bestVoicingIndex(list)] as { frets: (number | null)[] }).frets);

const E = 4;
const C = 0;
const A = 9;
const G = 7;

describe('acceptance: standard tuning', () => {
  it('E major: the default (best) voicing is the open shape 0-2-2-1-0-0', () => {
    expect(best(search(chord({ rootPc: E })))).toBe('0-2-2-1-0-0');
  });

  it('C major includes x-3-2-0-1-0 (and it is the best)', () => {
    const list = search(chord({ rootPc: C }));
    expect(shapes(list)).toContain('x-3-2-0-1-0');
    expect(best(list)).toBe('x-3-2-0-1-0');
  });

  it('A minor includes x-0-2-2-1-0', () => {
    const list = search(chord({ rootPc: A, quality: 'minor' }));
    expect(shapes(list)).toContain('x-0-2-2-1-0');
    expect(best(list)).toBe('x-0-2-2-1-0');
  });

  it('G7 includes 3-2-0-0-0-1', () => {
    const list = search(chord({ rootPc: G, seventh: '7' }));
    expect(shapes(list)).toContain('3-2-0-0-0-1');
  });

  it('open chords come out as the familiar shapes', () => {
    expect(best(search(chord({ rootPc: 2 })))).toBe('x-x-0-2-3-2'); // D
    expect(best(search(chord({ rootPc: E, quality: 'minor' })))).toBe('0-2-2-0-0-0'); // Em
    expect(best(search(chord({ rootPc: G })))).toMatch(/^3-2-0-0-(0|3)-3$/); // G
  });
});

describe('acceptance: Open G tuning', () => {
  it('G major: the default voicing is 0-0-0-0-0-0', () => {
    expect(best(search(chord({ rootPc: G }), {}, OPEN_G))).toBe('0-0-0-0-0-0');
  });
});

describe('every voicing is valid', () => {
  const target = chord({ rootPc: C, seventh: 'maj7' });
  const tonesPcs = new Set([0, 4, 7, 11]);
  const list = search(target);

  it('only sounds chord tones and contains every required tone', () => {
    expect(list.length).toBeGreaterThan(20);
    for (const v of list) {
      const pcs = shapeNotes(STANDARD, v.frets).map((n) => n.midi % 12);
      expect(pcs.every((pc) => tonesPcs.has(pc))).toBe(true);
      for (const need of [0, 4, 11]) expect(pcs).toContain(need); // root, 3rd, 7th
      expect(v.sounding).toBeGreaterThanOrEqual(4); // a seventh chord needs 4 strings
    }
  });

  it('respects the stretch and finger limits', () => {
    for (const v of list) {
      expect(v.stretch).toBeLessThanOrEqual(4);
      expect(v.fingers).toBeLessThanOrEqual(4);
      expect(fingering(v.frets).fingers).toBe(v.fingers);
    }
  });

  it('is sorted by position on the neck', () => {
    for (let i = 1; i < list.length; i++) {
      expect((list[i] as { position: number }).position).toBeGreaterThanOrEqual(
        (list[i - 1] as { position: number }).position,
      );
    }
  });

  it('has no duplicates', () => {
    expect(new Set(shapes(list)).size).toBe(list.length);
  });
});

describe('fingering and barres', () => {
  it('counts a barre as one finger', () => {
    expect(fingering([1, 3, 3, 2, 1, 1])).toEqual({ fingers: 3, barre: 1, barreSpan: 5 }); // F major: barre + two flats
    expect(fingering([null, 3, 5, 5, 5, 3])).toEqual({ fingers: 2, barre: 3, barreSpan: 4 });
    expect(fingering([null, 0, 2, 2, 2, 0])).toEqual({ fingers: 1, barre: 2, barreSpan: 2 }); // A major, one flat finger
  });

  it('separate strings at different frets each need a finger', () => {
    expect(fingering([0, 2, 2, 1, 0, 0])).toEqual({ fingers: 2, barre: null, barreSpan: 0 }); // a flat pair + one
    expect(fingering([null, 3, 2, 0, 1, 0])).toEqual({ fingers: 3, barre: null, barreSpan: 0 }); // C major
    expect(fingering([3, 2, 0, 0, 0, 1])).toEqual({ fingers: 3, barre: null, barreSpan: 0 }); // G7
  });

  it('a shape like D major uses a separate finger per string', () => {
    expect(fingering([null, null, 0, 2, 3, 2]).fingers).toBe(3);
  });

  it('a barre cannot span an open or muted string', () => {
    expect(fingering([2, 0, 2, 2, null, null]).barre).toBeNull();
    expect(fingering([2, null, 2, 2, null, null]).barre).toBeNull();
    expect(fingering([2, null, 2, 2, null, null]).fingers).toBe(2); // one on the low string, a flat pair
  });

  it('no fretted notes needs no fingers', () => {
    expect(fingering([0, 0, 0, 0, 0, 0])).toEqual({ fingers: 0, barre: null, barreSpan: 0 });
  });

  it('finds barre-chord shapes up the neck', () => {
    const f = shapes(search(chord({ rootPc: 5 })));
    expect(f).toContain('1-3-3-2-1-1'); // F major, E-shape barre
    expect(f).toContain('x-8-10-10-10-8'); // F major, A-shape barre on the 8th fret
  });
});

describe('rules and filters', () => {
  const target = chord({ rootPc: C });

  it('root in bass only', () => {
    const list = search(target, { rootInBass: true });
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((v) => v.rootInBass)).toBe(true);
    expect(search(target).some((v) => !v.rootInBass)).toBe(true);
  });

  it('no muted inner strings', () => {
    const list = search(target, { noInnerMutes: true });
    for (const v of list) {
      const first = v.frets.findIndex((f) => f !== null);
      const last = v.frets.length - 1 - [...v.frets].reverse().findIndex((f) => f !== null);
      expect(v.frets.slice(first, last + 1).every((f) => f !== null)).toBe(true);
    }
  });

  it('include open strings off removes every open string', () => {
    const list = search(target, { includeOpen: false });
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((v) => v.frets.every((f) => f !== 0))).toBe(true);
  });

  it('max stretch and max fingers narrow the list', () => {
    const wide = search(target, { maxStretch: 5 });
    const narrow = search(target, { maxStretch: 2 });
    expect(narrow.length).toBeLessThan(wide.length);
    expect(narrow.every((v) => v.stretch <= 2)).toBe(true);
    expect(search(target, { maxFingers: 2 }).every((v) => v.fingers <= 2)).toBe(true);
  });

  it('min strings sounding', () => {
    expect(search(target, { minStrings: 5 }).every((v) => v.sounding >= 5)).toBe(true);
    expect(
      search(target, { minStrings: 2 }).some((v) => v.sounding === 2 || v.sounding === 3),
    ).toBe(true);
  });
});

describe('slash chords and omitted tones', () => {
  it('a slash chord’s lowest sounding note is the bass', () => {
    const list = search(chord({ rootPc: G, bassPc: 11 })); // G/B
    expect(list.length).toBeGreaterThan(3);
    expect(list.every((v) => v.bassPc === 11)).toBe(true);
    expect(shapes(list)).toContain('x-2-0-0-3-3');
  });

  it('a bass that isn’t in the chord is still required and sounded lowest', () => {
    const list = search(chord({ rootPc: C, bassPc: 2 })); // C/D
    expect(list.length).toBeGreaterThan(0);
    for (const v of list) {
      const notes = shapeNotes(STANDARD, v.frets);
      expect((notes[0]?.midi ?? -1) % 12).toBe(2);
    }
  });

  it('the 5th may be left out of a 9th chord, but not a triad', () => {
    const ninth = search(chord({ rootPc: C, extension: '9' }));
    const noFifth = ninth.filter(
      (v) => !shapeNotes(STANDARD, v.frets).some((n) => n.midi % 12 === 7),
    );
    expect(noFifth.length).toBeGreaterThan(0);
    const triad = search(chord({ rootPc: C }));
    expect(triad.every((v) => shapeNotes(STANDARD, v.frets).some((n) => n.midi % 12 === 7))).toBe(
      true,
    );
  });

  it('a chord with an omitted 3rd needs no third', () => {
    const list = search(chord({ rootPc: A, seventh: '7', omit3: true }));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((v) => !shapeNotes(STANDARD, v.frets).some((n) => n.midi % 12 === 1))).toBe(
      true,
    );
  });
});

describe('selection helpers', () => {
  const list = search(chord({ rootPc: C }));

  it('finds the best voicing containing a clicked root', () => {
    // The C on the A string at fret 3 → the open C shape.
    const i = bestVoicingWith(list, 1, 3);
    expect(shapeText((list[i] as { frets: (number | null)[] }).frets)).toBe('x-3-2-0-1-0');
    expect(bestVoicingWith(list, 1, 4)).toBe(-1); // that note (C♯) isn't in any voicing
  });

  it('prefers a voicing whose bass is the clicked note', () => {
    const i = bestVoicingWith(list, 0, 8); // C on the low E string
    expect(i).toBeGreaterThanOrEqual(0);
    const v = list[i] as { frets: (number | null)[] };
    expect(v.frets[0]).toBe(8);
    expect(v.frets.findIndex((f) => f !== null)).toBe(0);
  });

  it('locates a shape in the list', () => {
    const i = indexOfShape(list, [null, 3, 2, 0, 1, 0]);
    expect(shapeText((list[i] as { frets: (number | null)[] }).frets)).toBe('x-3-2-0-1-0');
    expect(indexOfShape(list, [null, null, null, null, null, null])).toBe(-1);
  });

  it('caps the browsable list at the best voicings, still sorted by position', () => {
    const target = chord({ rootPc: E, seventh: '7', extension: '13' });
    const all = search(target);
    expect(all.length).toBeGreaterThan(MAX_LISTED_VOICINGS); // thousands of loose 13th voicings
    const listed = findVoicings(STANDARD, 24, target);
    expect(listed).toHaveLength(MAX_LISTED_VOICINGS);
    for (let i = 1; i < listed.length; i++) {
      expect((listed[i] as { position: number }).position).toBeGreaterThanOrEqual(
        (listed[i - 1] as { position: number }).position,
      );
    }
    // The best voicing always survives the cut.
    expect(shapes(listed)).toContain(best(all));
  });

  it('memoises', () => {
    const target = chord({ rootPc: C });
    expect(findVoicings(STANDARD, 22, target)).toBe(findVoicings(STANDARD, 22, target));
    expect(findVoicings(STANDARD, 22, target)).not.toBe(findVoicings(STANDARD, 21, target));
  });
});

describe('performance', () => {
  const heavy: Partial<ChordSpec>[] = [
    { rootPc: C },
    { rootPc: G, seventh: '7' },
    { rootPc: C, extension: '13' },
    { rootPc: C, extension: '13', alterations: ['b9', '#11'] },
    { rootPc: 3, quality: 'minor', extension: '11' },
    { rootPc: C, seventh: 'maj7', alterations: ['#11'], bassPc: 4 },
  ];

  it('searches every chord across 24 frets in under 50 ms', () => {
    for (const over of heavy) {
      const target = chord(over);
      // Warm up the JIT once, then time.
      searchVoicings(STANDARD, 24, target);
      const t0 = performance.now();
      const list = searchVoicings(STANDARD, 24, target);
      const ms = performance.now() - t0;
      expect(ms, JSON.stringify(over)).toBeLessThan(50);
      expect(list.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('is fast in other tunings too', () => {
    for (const tuning of [OPEN_G, [50, 55, 60, 65, 69, 74], [38, 45, 50, 55, 59, 62]]) {
      searchVoicings(tuning, 24, chord({ rootPc: G }));
      const t0 = performance.now();
      searchVoicings(tuning, 24, chord({ rootPc: G, seventh: 'maj7', extension: '9' }));
      expect(performance.now() - t0).toBeLessThan(50);
    }
  });
});
