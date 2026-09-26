import { describe, expect, it } from 'vitest';
import { describeChord, DEFAULT_CHORD, validateChord } from '../src/theory/chords';
import { identifyChord, libraryStats } from '../src/theory/identify';
import { shapeNotes } from '../src/theory/voicings';

const STANDARD = [40, 45, 50, 55, 59, 64];
/** Parse "x-3-2-0-1-0" against standard tuning and identify it. */
const id = (shape: string, pref: 'sharp' | 'flat' = 'sharp') => {
  const frets = shape.split('-').map((f) => (f === 'x' ? null : Number(f)));
  return identifyChord(
    shapeNotes(STANDARD, frets).map((n) => n.midi),
    pref,
  );
};
const names = (shape: string) => id(shape).map((r) => r.name);

describe('the plan’s identification examples', () => {
  it('x-3-2-0-1-0 → C', () => expect(id('x-3-2-0-1-0')[0]?.name).toBe('C'));
  it('0-2-2-1-0-0 → E', () => expect(id('0-2-2-1-0-0')[0]?.name).toBe('E'));
  it('x-0-2-2-1-0 → Am', () => expect(id('x-0-2-2-1-0')[0]?.name).toBe('Am'));
  it('x-x-0-2-3-2 → D', () => expect(id('x-x-0-2-3-2')[0]?.name).toBe('D'));

  it('0-2-2-1-0-0 with string 6 muted → E/B', () => {
    expect(id('x-2-2-1-0-0')[0]?.name).toBe('E/B');
  });

  it('a C6 shape is named C6 with Am7/C as an alternative', () => {
    // C E G A — the notes of C6 and of Am7 over C.
    const readings = identifyChord([48, 52, 55, 57]).map((r) => r.name);
    expect(readings[0]).toBe('C6');
    expect(readings).toContain('Am7/C');
  });

  it('x-3-2-2-1-0 (C E A C E, no G) reads as C6 and Am/C', () => {
    const readings = names('x-3-2-2-1-0');
    expect(readings[0]).toBe('C6');
    expect(readings).toContain('Am/C');
  });

  // The plan lists "3-x-0-0-0-x → G5 or G(no3)" and "x-0-2-0-2-0 → A6 / F♯m7/A", but in standard
  // tuning those shapes sound G D G B (a G major chord) and A E G C♯ E (A7). These are the
  // readings that match the notes actually played.
  it('3-x-0-0-0-x is G D G B: a G major chord', () => {
    expect(id('3-x-0-0-0-x')[0]?.name).toBe('G');
  });
  it('x-0-2-0-2-0 is A E G C♯ E: A7', () => {
    expect(id('x-0-2-0-2-0')[0]?.name).toBe('A7');
  });
  it('root and fifth only is a power chord', () => {
    // G2 D3 G3 → G5
    expect(identifyChord([43, 50, 55])[0]?.name).toBe('G5');
    expect(identifyChord([43, 50])[0]?.name).toBe('G5');
  });
});

describe('common shapes', () => {
  it('names open and barre chords', () => {
    expect(id('0-2-2-0-0-0')[0]?.name).toBe('Em');
    expect(id('x-0-2-2-2-0')[0]?.name).toBe('A');
    expect(id('3-2-0-0-0-1')[0]?.name).toBe('G7');
    expect(id('x-3-2-0-0-0')[0]?.name).toBe('Cmaj7');
    expect(id('0-2-0-1-0-0')[0]?.name).toBe('E7');
    expect(id('1-3-3-2-1-1')[0]?.name).toBe('F');
    expect(id('x-2-4-4-4-2')[0]?.name).toBe('B');
    expect(id('x-x-0-2-1-2')[0]?.name).toBe('D7');
    expect(id('x-x-0-2-3-1')[0]?.name).toBe('Dm');
    expect(id('x-0-2-2-3-0')[0]?.name).toBe('Asus4');
    expect(id('x-0-2-2-0-0')[0]?.name).toBe('Asus2');
    expect(id('x-2-3-4-3-x')[0]?.name).toBe('Bdim');
  });

  it('names extended and altered chords', () => {
    expect(id('x-3-2-3-3-0')[0]?.name).toBe('C9');
    expect(id('x-x-1-2-1-2')[0]?.name).toBe('D♯dim7');
    expect(id('x-3-2-3-1-0')[0]?.name).toBe('C7');
  });

  it('follows the flat preference', () => {
    // B♭ major triad from A♯/B♭ root.
    const notes = [46, 50, 53];
    expect(identifyChord(notes, 'flat')[0]?.name).toBe('B♭');
    expect(identifyChord(notes, 'sharp')[0]?.name).toBe('B♭'); // fewest accidentals wins
  });
});

describe('bass and roots', () => {
  it('slash chords name the bass', () => {
    // E G B C from E in the bass: C major over E → C/E
    expect(identifyChord([40, 48, 55, 60])[0]?.name).toBe('C/E');
    expect(id('3-3-2-0-1-0')[0]?.name).toBe('C/G');
  });

  it('prefers root position over an inversion of the same notes', () => {
    const readings = identifyChord([48, 52, 55, 57]);
    expect(readings[0]?.spec?.bassPc).toBeNull();
  });

  it('exposes the spec so a reading can be loaded into the builder', () => {
    const r = id('x-2-2-1-0-0')[0];
    expect(r?.rootPc).toBe(4);
    expect(r?.bassPc).toBe(11);
    expect(r?.spec && validateChord(r.spec)).toBeNull();
    expect(r?.spec && describeChord(r.spec).name).toBe(r?.name);
  });
});

describe('few notes', () => {
  it('one note is just the note', () => {
    expect(identifyChord([64])[0]).toMatchObject({ name: 'E', kind: 'note' });
    expect(identifyChord([64, 76])[0]?.kind).toBe('note'); // an octave is still one pitch class
  });

  it('two notes are an interval, or a power chord', () => {
    expect(identifyChord([48, 52])[0]).toMatchObject({ name: 'Major 3rd (C–E)', kind: 'interval' });
    expect(identifyChord([48, 51])[0]?.name).toBe('Minor 3rd (C–D♯)');
    expect(identifyChord([48, 54])[0]?.name).toBe('Tritone (C–F♯)');
    expect(identifyChord([48, 55])[0]).toMatchObject({ name: 'C5', kind: 'power' });
    expect(identifyChord([55, 60])[0]?.name).toBe('C5/G');
  });

  it('nothing sounding, or a cluster that fits nothing, gives no reading', () => {
    expect(identifyChord([])).toEqual([]);
    expect(identifyChord([48, 49, 50, 51, 52, 53, 54, 55])).toEqual([]);
  });
});

describe('round trip with the builder', () => {
  it('every simple chord the builder makes is recognised as itself', () => {
    const cases = [
      {},
      { quality: 'minor' as const },
      { seventh: '7' as const },
      { seventh: 'maj7' as const },
      { quality: 'minor' as const, seventh: '7' as const },
      { quality: 'dim' as const },
      { quality: 'dim' as const, seventh: 'dim7' as const },
      { quality: 'dim' as const, seventh: '7' as const },
      { quality: 'aug' as const },
      { quality: 'sus4' as const },
      { quality: 'sus2' as const },
      { seventh: '6' as const },
      { quality: 'minor' as const, seventh: '6' as const },
      { extension: '9' as const },
      { seventh: 'maj7' as const, extension: '9' as const },
      { seventh: '7' as const, alterations: ['#9' as const] },
      { seventh: '7' as const, alterations: ['b9' as const] },
      { added: ['add9' as const] },
    ];
    for (const rootPc of [0, 3, 7, 10]) {
      for (const c of cases) {
        const info = describeChord({ ...DEFAULT_CHORD, rootPc, ...c }, 'flat');
        // Voice the chord with its root in the bass.
        const midis = info.tones.map((t, i) => 36 + rootPc + t.semitones + (i > 0 ? 12 : 0));
        const readings = identifyChord(midis, 'flat');
        const own = readings.find(
          (r) => r.spec && describeChord(r.spec, 'flat').name === info.name,
        );
        expect(own, `${info.name} → ${readings.map((r) => r.name).join(', ')}`).toBeDefined();
      }
    }
  });
});

describe('the template library', () => {
  it('builds quickly and covers a broad set of chords', () => {
    const t = performance.now();
    const stats = libraryStats();
    expect(performance.now() - t).toBeLessThan(500);
    expect(stats.masks).toBeGreaterThan(300);
    expect(Math.min(...stats.sizes)).toBeGreaterThanOrEqual(3);
  });
});
