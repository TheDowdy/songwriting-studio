import { describe, expect, it } from 'vitest';
import { buildFretboard } from '../src/theory/fretboard';
import { formatNoteName, parseNoteName } from '../src/theory/notes';
import {
  describeOverlay,
  diatonicChords,
  overlayPitchClasses,
  supportsDiatonicChords,
} from '../src/theory/overlays';
import {
  DEFAULT_PLAYBACK,
  DEFAULT_SCALE_SETTINGS,
  sanitizeOverlay,
  sanitizePlayback,
  sanitizeScaleSettings,
} from '../src/theory/scaleSettings';
import { buildPitchViews } from '../src/theory/scaleView';
import { getScale, SCALES } from '../src/theory/scales';
import { STANDARD_TUNING } from '../src/theory/tunings';

const note = parseNoteName;
const views = (root: string, scaleId: string, overlay: ReadonlySet<number> | null = null) =>
  buildPitchViews(note(root), getScale(scaleId), overlay);

describe('buildPitchViews', () => {
  it('marks the tonic, in-scale and out-of-scale pitch classes', () => {
    const v = views('C', 'major');
    expect(v[0]?.role).toBe('tonic');
    expect([2, 4, 5, 7, 9, 11].every((pc) => v[pc]?.role === 'scale')).toBe(true);
    expect([1, 3, 6, 8, 10].every((pc) => v[pc]?.role === 'out')).toBe(true);
  });

  it('records the degree and interval from the tonic', () => {
    const v = views('E', 'minor-pentatonic');
    expect(v[4]?.role).toBe('tonic');
    expect(v[7]?.degree?.label).toBe('♭3');
    expect(v[7]?.interval).toBe(3);
    expect(v[2]?.degree?.label).toBe('♭7');
  });

  it('gives an altered degree a variant marker only when another note shares its number', () => {
    const blues = views('A', 'blues');
    // ♭5 (pc 3) shares number 5 with the natural 5 (pc 4); ♭3 and ♭7 are alone.
    expect(blues[3]?.variant).toBe(true);
    expect(blues[4]?.variant).toBe(false);
    expect(blues[0]?.variant).toBe(false);
    expect(blues[7]?.variant).toBe(false);
    const majorBlues = views('C', 'major-blues');
    expect(majorBlues[3]?.variant).toBe(true); // ♭3 next to 3
    expect(majorBlues[4]?.variant).toBe(false);
    const minorPent = views('A', 'minor-pentatonic');
    expect(minorPent.some((p) => p.variant)).toBe(false);
  });

  it('flags diminished scales’ doubled numbers and never marks the chromatic scale', () => {
    const hw = views('C', 'diminished-hw');
    expect(hw[3]?.variant).toBe(true); // ♭3 next to 3
    expect(hw[4]?.variant).toBe(false);
    expect(views('C', 'chromatic').some((p) => p.variant)).toBe(false);
  });

  it('flags overlay pitch classes', () => {
    const v = views('C', 'major', new Set([0, 4, 7]));
    expect(v.filter((p) => p.overlay).map((p) => p.interval)).toEqual([0, 4, 7]);
    expect(views('C', 'major').some((p) => p.overlay)).toBe(false);
  });
});

describe('E minor pentatonic in standard tuning (Phase 6 acceptance)', () => {
  const board = buildFretboard(STANDARD_TUNING.strings, 15, {
    scale: { root: note('E'), def: getScale('minor-pentatonic') },
  });
  const inScale = (lo: number, hi: number) =>
    board.map((frets) =>
      frets.filter((c) => c.fret >= lo && c.fret <= hi && c.role !== 'out').map((c) => c.fret),
    );

  it('shows the familiar box at frets 0–3', () => {
    // Strings low → high: E G | A B ... i.e. two notes per string, none on fret 1.
    expect(inScale(0, 3)).toEqual([
      [0, 3],
      [0, 2],
      [0, 2],
      [0, 2],
      [0, 3],
      [0, 3],
    ]);
  });

  it('repeats the box an octave up at frets 12–15', () => {
    expect(inScale(12, 15)).toEqual([
      [12, 15],
      [12, 14],
      [12, 14],
      [12, 14],
      [12, 15],
      [12, 15],
    ]);
  });
});

describe('diatonic chords', () => {
  const chords = (
    root: string,
    scaleId: string,
    kind: 'triad' | 'seventh',
    pref = 'sharp' as const,
  ) => diatonicChords(note(root), getScale(scaleId), kind, pref);

  it('builds the major-scale triads with the plan’s numerals', () => {
    expect(chords('C', 'major', 'triad')?.map((c) => c.numeral)).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
    expect(chords('C', 'major', 'triad')?.map((c) => c.name)).toEqual([
      'C',
      'Dm',
      'Em',
      'F',
      'G',
      'Am',
      'Bdim',
    ]);
  });

  it('builds the major-scale seventh chords', () => {
    expect(chords('C', 'major', 'seventh')?.map((c) => c.name)).toEqual([
      'Cmaj7',
      'Dm7',
      'Em7',
      'Fmaj7',
      'G7',
      'Am7',
      'Bm7♭5',
    ]);
    expect(chords('C', 'major', 'seventh')?.map((c) => c.numeral)).toEqual([
      'Imaj7',
      'ii7',
      'iii7',
      'IVmaj7',
      'V7',
      'vi7',
      'viiø7',
    ]);
  });

  it('spells chord names with the key’s letters', () => {
    expect(chords('F', 'major', 'triad')?.map((c) => c.name)).toEqual([
      'F',
      'Gm',
      'Am',
      'B♭',
      'C',
      'Dm',
      'Edim',
    ]);
  });

  it('follows the scale (harmonic minor has an augmented III and a diminished vii°7)', () => {
    const t = chords('A', 'harmonic-minor', 'triad');
    expect(t?.map((c) => c.numeral)).toEqual(['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']);
    expect(chords('A', 'harmonic-minor', 'seventh')?.[6]?.name).toBe('G♯dim7');
  });

  it('returns the chord’s pitch classes', () => {
    expect(chords('C', 'major', 'triad')?.[4]?.pcs).toEqual([7, 11, 2]);
  });

  it('only applies to seven-note scales, and never fails on them', () => {
    for (const def of SCALES) {
      const ok = def.degrees.length === 7 && !def.chromatic;
      expect(supportsDiatonicChords(def)).toBe(ok);
      const result = diatonicChords(note('C'), def, 'seventh', 'sharp');
      expect(result === null).toBe(!ok);
      result?.forEach((c) => expect(c.numeral.length).toBeGreaterThan(0));
    }
  });
});

describe('overlayPitchClasses', () => {
  const pcs = (
    overlay: Parameters<typeof overlayPitchClasses>[2],
    root = 'A',
    scale = 'natural-minor',
  ) => {
    const set = overlayPitchClasses(note(root), getScale(scale), overlay, 'sharp');
    return set && [...set].sort((a, b) => a - b);
  };

  it('is null for none, and for a chord overlay on a scale that has no diatonic chords', () => {
    expect(pcs({ kind: 'none' })).toBeNull();
    expect(pcs({ kind: 'triad', degree: 0 }, 'A', 'minor-pentatonic')).toBeNull();
  });

  it('rings a diatonic triad', () => {
    expect(pcs({ kind: 'triad', degree: 0 })).toEqual([0, 4, 9]); // Am = A C E
    expect(pcs({ kind: 'seventh', degree: 2 })).toEqual([0, 4, 7, 11]); // Cmaj7
  });

  it('rings another scale on the same root (minor pentatonic inside natural minor)', () => {
    expect(pcs({ kind: 'scale', scaleId: 'minor-pentatonic' })).toEqual([0, 2, 4, 7, 9]);
    // Blues adds a note (♭5 = E♭) that natural minor doesn't have.
    expect(pcs({ kind: 'scale', scaleId: 'blues' })).toContain(3);
  });

  it('describes the overlay for the legend', () => {
    const d = (o: Parameters<typeof describeOverlay>[2]) =>
      describeOverlay(note('C'), getScale('major'), o, 'sharp');
    expect(d({ kind: 'triad', degree: 5 })).toBe('vi — Am');
    expect(d({ kind: 'scale', scaleId: 'major-pentatonic' })).toBe('C Major pentatonic');
    expect(d({ kind: 'none' })).toBeNull();
    expect(formatNoteName(note('C'))).toBe('C');
  });
});

describe('settings sanitizers', () => {
  it('fall back to defaults for junk', () => {
    expect(sanitizeScaleSettings(null)).toEqual(DEFAULT_SCALE_SETTINGS);
    expect(sanitizeScaleSettings({ rootPc: 99, scaleId: 'nope', colourMode: 'yes' })).toEqual(
      DEFAULT_SCALE_SETTINGS,
    );
    expect(sanitizePlayback('x')).toEqual(DEFAULT_PLAYBACK);
    expect(sanitizePlayback({ tempo: 9999, direction: 'sideways', position: -3 })).toEqual({
      ...DEFAULT_PLAYBACK,
      tempo: 240,
    });
  });

  it('keep valid values', () => {
    const s = {
      rootPc: 4,
      scaleId: 'blues',
      hideOutOfScale: true,
      colourMode: true,
      overlay: { kind: 'triad' as const, degree: 3 },
    };
    expect(sanitizeScaleSettings(s)).toEqual(s);
    expect(
      sanitizePlayback({ tempo: 133, direction: 'updown', range: 'neck', position: 5 }),
    ).toEqual({
      tempo: 133,
      direction: 'updown',
      range: 'neck',
      position: 5,
    });
  });

  it('rejects an overlay pointing at a missing scale or degree', () => {
    expect(sanitizeOverlay({ kind: 'scale', scaleId: 'nope' })).toEqual({ kind: 'none' });
    expect(sanitizeOverlay({ kind: 'triad', degree: 9 })).toEqual({ kind: 'none' });
  });
});
