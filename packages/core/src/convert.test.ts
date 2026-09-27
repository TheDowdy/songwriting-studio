import { describe, expect, it } from 'vitest';
import { chordTones, inversionCount, withInversion } from './theory/chords';
import { chroma } from './theory/scales';
import type { ChordRef, Flavor, Key, Quality, Seventh } from './theory/types';
import { chordName, fromChordSpec, spellInKey, toChordSpec, withColour, withFlavor } from './convert';
import { chordSuffix, describeChord, validateChord, type ChordSpec } from './fret/chords';

const KEY: Key = { tonic: 'C', mode: 'major' };
const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
const QUALITIES: Quality[] = ['maj', 'min', 'dim', 'aug'];
const SEVENTHS: Seventh[] = ['maj7', 'dom7', 'min7', 'minMaj7', 'm7b5', 'dim7', 'augMaj7', 'aug7'];
const FLAVORS: Flavor[] = ['triad', '7', 'sus2', 'sus4', 'add9'];

/** The triad quality each seventh type naturally pairs with (how `buildChord`/`diatonicChord`
 *  always constructs a flavor-'7' chord — `seventh` alone determines the third/fifth's colour). */
const NATURAL_QUALITY: Record<Seventh, Quality> = {
  maj7: 'maj',
  dom7: 'maj',
  min7: 'min',
  minMaj7: 'min',
  m7b5: 'dim',
  dim7: 'dim',
  augMaj7: 'aug',
  aug7: 'aug',
};

/**
 * Every PB chord (all roots × qualities × sevenths × flavors × inversions), plain (no colour).
 * For flavor '7', `seventh` alone determines the underlying triad — PB always builds it that way
 * (`defaultSeventh`/`diatonicChord`), and `toChordSpec`'s §3.1 mapping table is seventh-driven for
 * exactly that reason — so `quality` there is fixed to its natural pairing rather than crossed
 * independently with all 8 sevenths (an "maj quality + min7 seventh" chord is not a chord PB's own
 * theory ever constructs).
 */
function everyPbChord(): { chord: ChordRef; label: string }[] {
  const out: { chord: ChordRef; label: string }[] = [];
  for (const root of ROOTS) {
    for (const flavor of FLAVORS) {
      if (flavor === '7') {
        for (const seventh of SEVENTHS) {
          const base: ChordRef = { root, quality: NATURAL_QUALITY[seventh], seventh, flavor, origin: 'diatonic', numeral: '' };
          const count = inversionCount(base);
          for (let inversion = 0; inversion < count; inversion++) {
            const chord = inversion === 0 ? base : withInversion(base, inversion, KEY);
            out.push({ chord, label: `${root} 7 ${seventh} inv${inversion}` });
          }
        }
        continue;
      }
      for (const quality of QUALITIES) {
        const base: ChordRef = { root, quality, seventh: 'maj7', flavor, origin: 'diatonic', numeral: '' };
        const count = inversionCount(base);
        for (let inversion = 0; inversion < count; inversion++) {
          const chord = inversion === 0 ? base : withInversion(base, inversion, KEY);
          out.push({ chord, label: `${root} ${quality} ${flavor} inv${inversion}` });
        }
      }
    }
  }
  return out;
}

const pcsOf = (notes: string[]) => notes.map(chroma).sort((a, b) => a - b);

describe('toChordSpec: pitch classes match chordTones, independently derived (§3.1 safety net)', () => {
  it('for every PB chord (all roots × qualities × sevenths × flavors × inversions)', () => {
    for (const { chord, label } of everyPbChord()) {
      const spec = toChordSpec(chord);
      const fromFf = describeChord(spec).pcs.slice().sort((a, b) => a - b);
      const fromPb = pcsOf(chordTones(chord));
      expect(fromPb, label).toEqual(fromFf);
    }
  });
});

describe('fromChordSpec(toChordSpec(c), key): round-trips every plain PB chord', () => {
  it('same pitch classes, always', () => {
    for (const { chord, label } of everyPbChord()) {
      const back = fromChordSpec(toChordSpec(chord), KEY);
      expect(pcsOf(chordTones(back)), label).toEqual(pcsOf(chordTones(chord)));
    }
  });

  it('same musical identity (quality/seventh/flavor/root/bass), with one documented exception', () => {
    // Compared by pitch class rather than `chordKey`'s exact spelled strings: `fromChordSpec`
    // spells non-diatonic tones with its own `spellInKey` heuristic, which can reasonably choose
    // a different (but equally valid) enharmonic than whatever `Note.transpose` produced for the
    // *original* chord (e.g. a borrowed dom7's 7th spelled A♯ vs B♭) — same note, different name.
    // `chordKey` itself is unaffected in real use, since every chord actually placed in a song
    // gets its numeral/spelling from `relabel`/`buildChord`, not from a converter round-trip.
    const identity = (c: ChordRef) => ({
      quality: c.quality,
      seventh: c.flavor === '7' ? c.seventh : undefined,
      flavor: c.flavor,
      rootPc: chroma(c.root),
      bassPc: chroma(c.bass ?? c.root),
    });

    // FF's `sus2`/`sus4` quality always uses a perfect 5th and has no separate "function" field:
    // a PB sus chord with quality 'min' is pitch-identical to one with quality 'maj' (sus
    // replaces the 3rd, and maj/min share the same perfect 5th — only dim/aug differ, and those
    // round-trip exactly via the b5/#5 alteration). FF genuinely can't tell them apart, so
    // `fromChordSpec` always resolves a plain sus chord's "function" to 'maj'. This is the one
    // place a full round-trip can't recover the original `quality`.
    const isDocumentedSusCollapse = (chord: ChordRef) =>
      (chord.flavor === 'sus2' || chord.flavor === 'sus4') && chord.quality === 'min';

    for (const { chord, label } of everyPbChord()) {
      const back = fromChordSpec(toChordSpec(chord), KEY);
      if (isDocumentedSusCollapse(chord)) {
        expect(back.quality, label).toBe('maj');
        expect(identity(back), label).toEqual({ ...identity(chord), quality: 'maj' });
        continue;
      }
      expect(identity(back), label).toEqual(identity(chord));
    }
  });
});

describe('chordName agrees with FF chordSuffix for colour chords (§3.1)', () => {
  const withColourOn = (chord: ChordRef, colour: NonNullable<ChordRef['colour']>): ChordRef => ({ ...chord, colour });

  it("C7♯9", () => {
    const c = withColourOn({ root: 'C', quality: 'maj', seventh: 'dom7', flavor: '7', origin: 'diatonic', numeral: '' }, {
      alterations: ['#9'],
    });
    expect(chordName(c)).toBe('C7♯9');
  });

  it('Am7(no5)', () => {
    const c = withColourOn({ root: 'A', quality: 'min', seventh: 'min7', flavor: '7', origin: 'diatonic', numeral: '' }, {
      omit5: true,
    });
    expect(chordName(c)).toBe('Am7(no5)');
  });

  it('F6/9', () => {
    const c = withColourOn({ root: 'F', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: '' }, {
      sixth: '6/9',
    });
    expect(chordName(c)).toBe('F6/9');
  });

  it('D5 (power chord)', () => {
    const c = withColourOn({ root: 'D', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: '' }, {
      omit3: true,
    });
    expect(chordName(c)).toBe('D5');
  });

  it('G13/B', () => {
    const c: ChordRef = {
      root: 'G',
      quality: 'maj',
      seventh: 'dom7',
      flavor: '7',
      bass: 'B',
      origin: 'diatonic',
      numeral: '',
      colour: { extension: '13' },
    };
    expect(chordName(c)).toBe('G13/B');
  });

  it('agrees with chordSuffix(toChordSpec(c)) for a broad sample of colour chords', () => {
    const samples: ChordRef[] = [
      withColourOn({ root: 'D', quality: 'min', seventh: 'min7', flavor: '7', origin: 'diatonic', numeral: '' }, { extension: '9' }),
      withColourOn({ root: 'E', quality: 'maj', seventh: 'maj7', flavor: '7', origin: 'diatonic', numeral: '' }, { extension: '11' }),
      withColourOn({ root: 'A', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: '' }, { sixth: '6' }),
      withColourOn({ root: 'B', quality: 'dim', seventh: 'm7b5', flavor: '7', origin: 'diatonic', numeral: '' }, { alterations: ['b9'] }),
      withColourOn({ root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: '' }, { added: ['add11'] }),
      withColourOn({ root: 'G', quality: 'maj', seventh: 'dom7', flavor: '7', bass: 'B', origin: 'diatonic', numeral: '' } as ChordRef, {
        extension: '13',
      }),
    ];
    for (const c of samples) {
      const suffix = chordSuffix(toChordSpec(c));
      expect(chordName(c)).toBe(`${c.root}${suffix}${c.bass && chroma(c.bass) !== chroma(c.root) ? `/${c.bass}` : ''}`);
    }
  });
});

describe('Phase 3 "Done when": a 7th, a sus4, an inversion and a borrowed chord each show exactly their tones', () => {
  const pcsOfSpec = (spec: ReturnType<typeof toChordSpec>) => describeChord(spec).pcs.slice().sort((a, b) => a - b);

  it('a dominant 7th (G7): 1 3 5 ♭7', () => {
    const g7: ChordRef = { root: 'G', quality: 'maj', seventh: 'dom7', flavor: '7', origin: 'diatonic', numeral: 'V7' };
    expect(pcsOfSpec(toChordSpec(g7))).toEqual(pcsOf(['G', 'B', 'D', 'F']));
    expect(pcsOfSpec(toChordSpec(g7))).toEqual(pcsOf(chordTones(g7)));
  });

  it('a sus4 (Dsus4): 1 4 5, no 3rd at all', () => {
    const dsus4: ChordRef = { root: 'D', quality: 'maj', seventh: 'maj7', flavor: 'sus4', origin: 'diatonic', numeral: 'Vsus4' };
    const pcs = pcsOfSpec(toChordSpec(dsus4));
    expect(pcs).toEqual(pcsOf(['D', 'G', 'A']));
    expect(pcs).not.toContain(chroma('F#'));
    expect(pcs).not.toContain(chroma('F'));
  });

  it('an inversion (C/E, first inversion): same tones as C major, bass is the 3rd', () => {
    const c: ChordRef = { root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'I' };
    const firstInversion = withInversion(c, 1, KEY);
    const spec = toChordSpec(firstInversion);
    expect(pcsOfSpec(spec)).toEqual(pcsOf(['C', 'E', 'G']));
    expect(spec.bassPc).toBe(chroma('E'));
  });

  it('a borrowed chord (bVII in C major, i.e. B♭ major borrowed from the parallel minor): 1 3 5 on its own root, unaffected by origin', () => {
    const bVII: ChordRef = { root: 'Bb', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'borrowed', numeral: '♭VII' };
    expect(pcsOfSpec(toChordSpec(bVII))).toEqual(pcsOf(['Bb', 'D', 'F']));
    expect(pcsOfSpec(toChordSpec(bVII))).toEqual(pcsOf(chordTones(bVII)));
  });
});

describe('spellInKey', () => {
  it('spells a diatonic pitch class exactly as the scale does', () => {
    const fSharpMajor: Key = { tonic: 'F#', mode: 'major' };
    expect(spellInKey(chroma('C#'), fSharpMajor)).toBe('C#');
  });
  it('always spells a pitch class that reduces to the same chroma', () => {
    for (const t of ['C', 'F#', 'Bb', 'D']) {
      for (const mode of ['major', 'minor'] as const) {
        for (let pc = 0; pc < 12; pc++) {
          const spelled = spellInKey(pc, { tonic: t, mode });
          expect(chroma(spelled), `${t} ${mode} pc ${pc}`).toBe(pc);
        }
      }
    }
  });
});

describe('fromChordSpec: a generated sample of every valid FF spec (§3.1)', () => {
  const QUALITIES_FF: ChordSpec['quality'][] = ['major', 'minor', 'dim', 'aug', 'sus2', 'sus4', 'power'];
  const SEVENTHS_FF: ChordSpec['seventh'][] = ['none', '6', '7', 'maj7', 'dim7', '6/9'];
  const EXTENSIONS_FF: ChordSpec['extension'][] = ['none', '9', '11', '13'];
  const ALTERATION_SETS: ChordSpec['alterations'][] = [[], ['b5'], ['#5'], ['b9'], ['#9'], ['#11'], ['b13']];
  const ADDED_SETS: ChordSpec['added'][] = [[], ['add9'], ['add11'], ['add9', 'add13']];

  function sample(): ChordSpec[] {
    const specs: ChordSpec[] = [];
    for (const quality of QUALITIES_FF) {
      for (const seventh of SEVENTHS_FF) {
        for (const extension of EXTENSIONS_FF) {
          for (const alterations of ALTERATION_SETS) {
            for (const added of ADDED_SETS) {
              for (const omit3 of [false, true]) {
                for (const omit5 of [false, true]) {
                  for (const bassPc of [null, 4, 7]) {
                    // Known, documented gaps (see convert.ts `mapSpec`): PB's ChordColour (§3.1)
                    // has `sixth` only for flavor 'triad' and `extension` only for flavor '7' —
                    // one chord can't carry both — and PB's sus2/sus4 flavor has no slot for a
                    // stacked 6th/7th/extension at all (only the b5/#5-as-quality trick). Skip
                    // those combinations here; `mapSpec` degrades them gracefully (drops the
                    // un-representable part) rather than being exact.
                    if ((quality === 'sus2' || quality === 'sus4') && (seventh !== 'none' || extension !== 'none')) continue;
                    if ((seventh === '6' || seventh === '6/9') && extension !== 'none') continue;
                    // PB's `Seventh` enum (§3.1's own table) has no "diminished major 7th" entry
                    // (dim quality + a natural 7th) — every other quality×seventh pairing FF
                    // allows does have one.
                    if (quality === 'dim' && seventh === 'maj7') continue;
                    specs.push({ rootPc: 4, quality, seventh, extension, alterations, added, omit3, omit5, bassPc });
                  }
                }
              }
            }
          }
        }
      }
    }
    return specs;
  }

  it('toChordSpec(fromChordSpec(s)) has the same pitch classes and bass as s', () => {
    let checked = 0;
    for (const raw of sample()) {
      if (validateChord(raw)) continue; // only valid specs are in scope
      checked++;
      const chord = fromChordSpec(raw, KEY);
      const roundTripped = toChordSpec(chord);
      const original = describeChord(raw);
      const back = describeChord(roundTripped);
      expect(back.pcs.slice().sort(), JSON.stringify(raw)).toEqual(original.pcs.slice().sort());
      expect(back.bass?.pc ?? null, JSON.stringify(raw)).toBe(original.bass?.pc ?? null);
    }
    expect(checked).toBeGreaterThan(50); // the sample is broad enough to be a real check
  });
});

describe('withFlavor and withColour drop whatever becomes invalid, keeping the rest (§3.1)', () => {
  it('withFlavor to sus4 drops a 6/9 colour (sus has no room for a 6th)', () => {
    const c: ChordRef = {
      root: 'C',
      quality: 'maj',
      seventh: 'maj7',
      flavor: 'triad',
      origin: 'diatonic',
      numeral: '',
      colour: { sixth: '6/9' },
    };
    const next = withFlavor(c, 'sus4', KEY);
    expect(validateChord(toChordSpec(next))).toBeNull();
  });

  it('withColour keeps a valid combination untouched', () => {
    const c: ChordRef = { root: 'D', quality: 'min', seventh: 'min7', flavor: '7', origin: 'diatonic', numeral: '' };
    const next = withColour(c, { extension: '9' }, KEY);
    expect(next.colour?.extension).toBe('9');
    expect(validateChord(toChordSpec(next))).toBeNull();
  });

  it('withColour drops an alteration that becomes invalid on its own (b9 needs a 7th/extension)', () => {
    const c: ChordRef = { root: 'D', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: '' };
    const next = withColour(c, { alterations: ['b9'] }, KEY);
    expect(validateChord(toChordSpec(next))).toBeNull();
    expect(next.colour?.alterations ?? []).not.toContain('b9');
  });
});
