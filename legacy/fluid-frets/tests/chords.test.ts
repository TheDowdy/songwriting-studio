import { describe, expect, it } from 'vitest';
import {
  ADDED,
  ALTERATIONS,
  DEFAULT_CHORD,
  describeChord,
  EXTENSIONS,
  QUALITIES,
  resolveTones,
  SEVENTHS,
  sanitizeChord,
  validateChord,
  type ChordSpec,
} from '../src/theory/chords';
import { formatNoteName } from '../src/theory/notes';

const C = 0;
const spec = (over: Partial<ChordSpec> = {}): ChordSpec => ({
  ...DEFAULT_CHORD,
  rootPc: C,
  ...over,
});
const name = (over: Partial<ChordSpec>, pref: 'sharp' | 'flat' = 'sharp') =>
  describeChord(spec(over), pref).name;
const notes = (over: Partial<ChordSpec>, pref: 'sharp' | 'flat' = 'sharp') =>
  describeChord(spec(over), pref)
    .tones.map((t) => formatNoteName(t.name))
    .join(' ');
const formula = (over: Partial<ChordSpec>) => describeChord(spec(over)).formula;

describe('canonical names', () => {
  it('produces the plan’s examples', () => {
    expect(name({ seventh: '7', alterations: ['#9'] })).toBe('C7♯9');
    expect(name({ rootPc: 5, seventh: 'maj7', alterations: ['#11'] })).toBe('Fmaj7♯11');
    expect(name({ rootPc: 2, quality: 'dim', seventh: '7' })).toBe('Dm7♭5');
    expect(name({ rootPc: 9, quality: 'sus4', seventh: '7' })).toBe('A7sus4');
    expect(name({ rootPc: 7, bassPc: 11 })).toBe('G/B');
    expect(name({ rootPc: 4, quality: 'power' })).toBe('E5');
  });

  it('names triads and sevenths', () => {
    expect(name({})).toBe('C');
    expect(name({ quality: 'minor' })).toBe('Cm');
    expect(name({ quality: 'dim' })).toBe('Cdim');
    expect(name({ quality: 'aug' })).toBe('Caug');
    expect(name({ quality: 'sus2' })).toBe('Csus2');
    expect(name({ seventh: '7' })).toBe('C7');
    expect(name({ seventh: 'maj7' })).toBe('Cmaj7');
    expect(name({ quality: 'minor', seventh: '7' })).toBe('Cm7');
    expect(name({ quality: 'minor', seventh: 'maj7' })).toBe('Cm(maj7)');
    expect(name({ quality: 'dim', seventh: 'dim7' })).toBe('Cdim7');
    expect(name({ quality: 'aug', seventh: '7' })).toBe('C7♯5');
    expect(name({ seventh: '6' })).toBe('C6');
    expect(name({ quality: 'minor', seventh: '6' })).toBe('Cm6');
    expect(name({ seventh: '6/9' })).toBe('C6/9');
  });

  it('names extensions', () => {
    expect(name({ extension: '9' })).toBe('C9');
    expect(name({ extension: '11' })).toBe('C11');
    expect(name({ extension: '13' })).toBe('C13');
    expect(name({ seventh: 'maj7', extension: '9' })).toBe('Cmaj9');
    expect(name({ quality: 'minor', extension: '9' })).toBe('Cm9');
    expect(name({ quality: 'minor', seventh: 'maj7', extension: '9' })).toBe('Cm(maj9)');
    expect(name({ quality: 'sus4', extension: '9' })).toBe('C9sus4');
    expect(name({ seventh: '6', extension: '9' })).toBe('C6/9');
    expect(name({ quality: 'dim', extension: '9' })).toBe('Cm9♭5');
  });

  it('names alterations, added tones and omissions', () => {
    expect(name({ seventh: '7', alterations: ['b9'] })).toBe('C7♭9');
    expect(name({ seventh: '7', alterations: ['b5'] })).toBe('C7♭5');
    expect(name({ extension: '13', alterations: ['b9'] })).toBe('C13♭9');
    expect(name({ seventh: '7', alterations: ['#5', 'b9'] })).toBe('C7(♯5,♭9)');
    expect(name({ added: ['add9'] })).toBe('Cadd9');
    expect(name({ quality: 'minor', added: ['add9'] })).toBe('Cmadd9');
    expect(name({ added: ['add9', 'add11'] })).toBe('Cadd9,11');
    expect(name({ seventh: '7', omit5: true })).toBe('C7(no5)');
    expect(name({ omit3: true })).toBe('C(no3)');
  });

  it('adds a slash bass, and ignores a bass equal to the root', () => {
    expect(name({ quality: 'minor', seventh: '7', bassPc: 7 })).toBe('Cm7/G');
    expect(name({ bassPc: 0 })).toBe('C');
    expect(name({ bassPc: 2 })).toBe('C/D');
  });
});

describe('tones and formulas', () => {
  it('lists the interval formula', () => {
    expect(formula({})).toBe('1 3 5');
    expect(formula({ quality: 'minor', seventh: '7' })).toBe('1 ♭3 5 ♭7');
    expect(formula({ seventh: '7', alterations: ['#9'] })).toBe('1 3 5 ♭7 ♯9');
    expect(formula({ extension: '13' })).toBe('1 3 5 ♭7 9 11 13');
    expect(formula({ quality: 'dim', seventh: 'dim7' })).toBe('1 ♭3 ♭5 𝄫7');
    expect(formula({ quality: 'sus2' })).toBe('1 2 5');
    expect(formula({ seventh: '6/9' })).toBe('1 3 5 6 9');
    expect(formula({ omit5: true, seventh: '7' })).toBe('1 3 ♭7');
  });

  it('an extension implies a seventh; maj7 stays major', () => {
    expect(formula({ extension: '9' })).toBe('1 3 5 ♭7 9');
    expect(formula({ seventh: 'maj7', extension: '9' })).toBe('1 3 5 7 9');
  });

  it('alterations replace the natural tone of the same degree', () => {
    expect(formula({ extension: '13', alterations: ['#11'] })).toBe('1 3 5 ♭7 9 ♯11 13');
    expect(formula({ extension: '13', alterations: ['b9'] })).toBe('1 3 5 ♭7 ♭9 11 13');
    expect(formula({ seventh: '7', alterations: ['b5'] })).toBe('1 3 ♭5 ♭7');
  });

  it('marks required and optional tones', () => {
    const tones = resolveTones(spec({ extension: '13' }));
    const opt = tones.filter((t) => !t.required).map((t) => t.label);
    expect(opt).toEqual(['5', '9', '11']); // 5th, and the lower extensions
    expect(resolveTones(spec({})).every((t) => t.required)).toBe(true);
    expect(resolveTones(spec({ seventh: '7', alterations: ['b5'] })).every((t) => t.required)).toBe(
      true,
    );
  });

  it('spells notes with the right letters', () => {
    expect(notes({})).toBe('C E G');
    expect(notes({ rootPc: 7, seventh: '7' })).toBe('G B D F');
    expect(notes({ rootPc: 5, quality: 'minor' })).toBe('F A♭ C');
    expect(notes({ rootPc: 1, quality: 'minor' })).toBe('C♯ E G♯');
    expect(notes({ rootPc: 0, seventh: '7', alterations: ['#9'] })).toBe('C E G B♭ D♯');
    expect(notes({ quality: 'dim', seventh: 'dim7' })).toBe('C E♭ G♭ B𝄫');
    expect(notes({ rootPc: 0, extension: '13' })).toBe('C E G B♭ D F A');
  });

  it('chooses the enharmonic root that avoids double accidentals', () => {
    // A♯ major would need C𝄪 and E♯; B♭ major is plain.
    expect(name({ rootPc: 10 }, 'sharp')).toBe('B♭');
    expect(notes({ rootPc: 10 }, 'sharp')).toBe('B♭ D F');
    // F♯ major is fine with either; follows the preference.
    expect(name({ rootPc: 6 }, 'sharp')).toBe('F♯');
    expect(name({ rootPc: 6 }, 'flat')).toBe('G♭');
    expect(name({ rootPc: 3, quality: 'minor' }, 'flat')).toBe('E♭m');
    expect(name({ rootPc: 3, quality: 'minor' }, 'sharp')).toBe('D♯m'); // a tie follows the preference
    // B♭ minor (two flats) is simpler than A♯ minor (three sharps), whatever the preference.
    expect(name({ rootPc: 10, quality: 'minor' }, 'sharp')).toBe('B♭m');
  });

  it('spells a slash bass that is outside the chord, and includes it in the tones', () => {
    const info = describeChord(spec({ bassPc: 2 }), 'sharp');
    expect(info.bass?.kind).toBe('bass');
    expect(info.tones.at(-1)?.pc).toBe(2);
    expect(info.pcs).toContain(2);
    const inChord = describeChord(spec({ bassPc: 4 }), 'sharp');
    expect(inChord.tones).toHaveLength(3);
    expect(inChord.bass?.label).toBe('3');
  });
});

describe('validation', () => {
  const bad = (over: Partial<ChordSpec>) => validateChord(spec(over));

  it('accepts ordinary chords', () => {
    expect(bad({})).toBeNull();
    expect(bad({ seventh: '7', alterations: ['#9', 'b13'] })).toBeNull();
    expect(bad({ extension: '13', alterations: ['b9', '#11'] })).toBeNull();
    expect(bad({ quality: 'sus4', seventh: '7', extension: '9' })).toBeNull();
    expect(bad({ quality: 'dim', seventh: 'dim7' })).toBeNull();
    expect(bad({ added: ['add9', 'add11'] })).toBeNull();
    expect(bad({ omit5: true, seventh: '7' })).toBeNull();
  });

  it('a diminished 6th is just the diminished 7th', () => {
    expect(validateChord(spec({ quality: 'dim', seventh: '6' }))).toMatch(/Diminished 7/);
  });

  it('dim7 belongs to diminished chords only', () => {
    expect(bad({ seventh: 'dim7' })).toMatch(/diminished/i);
    expect(bad({ quality: 'minor', seventh: 'dim7' })).toMatch(/diminished/i);
  });

  it('power chords take nothing extra', () => {
    for (const over of [
      { seventh: '7' as const },
      { extension: '9' as const },
      { alterations: ['b5' as const] },
      { added: ['add9' as const] },
      { omit3: true },
      { omit5: true },
    ]) {
      expect(bad({ quality: 'power', ...over })).not.toBeNull();
    }
    expect(bad({ quality: 'power', bassPc: 7 })).toBeNull();
  });

  it('added tones need a chord with no seventh or extension', () => {
    expect(bad({ added: ['add9'], seventh: '7' })).toMatch(/added/i);
    expect(bad({ added: ['add9'], extension: '9' })).toMatch(/added/i);
    expect(bad({ added: ['add9'], quality: 'sus2' })).toMatch(/sus2/i);
    expect(bad({ added: ['add11'], quality: 'sus4' })).toMatch(/sus4/i);
  });

  it('rejects contradictory alterations', () => {
    expect(bad({ seventh: '7', alterations: ['b5', '#5'] })).toMatch(/combined/);
    expect(bad({ seventh: '7', alterations: ['b9', '#9'] })).toMatch(/combined/);
    expect(bad({ quality: 'aug', alterations: ['#5'] })).not.toBeNull();
    expect(bad({ quality: 'dim', alterations: ['b5'] })).not.toBeNull();
    expect(bad({ quality: 'minor', seventh: '7', alterations: ['#9'] })).toMatch(/minor 3rd/);
    expect(bad({ seventh: '7', alterations: ['b13', '#5'] })).not.toBeNull();
    expect(bad({ seventh: '7', alterations: ['#11', 'b5'] })).not.toBeNull();
  });

  it('upper alterations need a seventh or an extension', () => {
    expect(bad({ alterations: ['b9'] })).toMatch(/7th or an extension/);
    expect(bad({ alterations: ['#11'] })).toMatch(/7th or an extension/);
    expect(bad({ seventh: '6', alterations: ['b9'] })).not.toBeNull();
    expect(bad({ extension: '9', alterations: ['#11'] })).toBeNull();
  });

  it('rejects extensions that duplicate a tone the chord already has', () => {
    expect(bad({ quality: 'sus2', extension: '9' })).not.toBeNull();
    expect(bad({ quality: 'sus4', extension: '11' })).not.toBeNull();
    expect(bad({ seventh: '6', extension: '13' })).not.toBeNull();
    expect(bad({ seventh: '6/9', extension: '9' })).not.toBeNull();
    expect(bad({ seventh: 'dim7', quality: 'dim', extension: '9' })).not.toBeNull();
    expect(bad({ extension: '9', alterations: ['b9'] })).not.toBeNull();
    expect(bad({ extension: '13', alterations: ['b13'] })).not.toBeNull();
  });

  it('omissions make sense', () => {
    expect(bad({ quality: 'sus4', omit3: true })).toMatch(/no 3rd/i);
    expect(bad({ omit3: true, omit5: true })).not.toBeNull();
    expect(bad({ seventh: '7', omit5: true, alterations: ['b5'] })).not.toBeNull();
  });

  it('every valid spec resolves to a sensible chord', () => {
    let valid = 0;
    for (const q of QUALITIES) {
      for (const s of SEVENTHS) {
        for (const e of EXTENSIONS) {
          for (let ab = 0; ab < 1 << ALTERATIONS.length; ab += 5) {
            for (let db = 0; db < 1 << ADDED.length; db++) {
              const c = spec({
                quality: q.id,
                seventh: s.id,
                extension: e.id,
                alterations: ALTERATIONS.filter((_, i) => ab & (1 << i)),
                added: ADDED.filter((_, i) => db & (1 << i)),
              });
              if (validateChord(c)) continue;
              valid++;
              const info = describeChord(c);
              const semis = info.tones.map((t) => t.semitones);
              expect(new Set(semis).size).toBe(semis.length); // no two tones share a pitch
              expect(info.tones.length).toBeGreaterThanOrEqual(2);
              expect(info.name.startsWith('C')).toBe(true);
              expect(info.name).not.toMatch(/undefined|NaN/);
            }
          }
        }
      }
    }
    expect(valid).toBeGreaterThan(150);
  });
});

describe('sanitizeChord', () => {
  it('falls back to the default for junk and for invalid combinations', () => {
    expect(sanitizeChord(null)).toEqual(DEFAULT_CHORD);
    expect(sanitizeChord({ rootPc: 99, quality: 'wat' })).toEqual(DEFAULT_CHORD);
    const invalid = sanitizeChord({ rootPc: 2, quality: 'power', seventh: '7' });
    expect(validateChord(invalid)).toBeNull();
    expect(invalid.rootPc).toBe(2);
  });

  it('keeps a valid chord and puts lists in canonical order', () => {
    const s = sanitizeChord({
      rootPc: 7,
      quality: 'major',
      seventh: '7',
      alterations: ['#9', 'b5', 'nope'],
      bassPc: 7,
    });
    expect(s.alterations).toEqual(['b5', '#9']);
    expect(s.bassPc).toBeNull();
  });
});
