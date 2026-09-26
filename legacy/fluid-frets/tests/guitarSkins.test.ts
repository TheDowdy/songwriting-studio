import { describe, expect, it } from 'vitest';
import { SOUND_PRESETS } from '../src/audio/synth/presets';
import {
  FINISHES,
  GUITAR_MODELS,
  getGuitarModel,
  INLAY_STYLES,
  isGuitarModelId,
  NO_CUSTOMISE,
  paint,
  resolveSkin,
  sanitizeCustomise,
  WOODS,
  type Shape,
} from '../src/components/Fretboard/guitarSkins';
import { MAX_FRETS, MIN_FRETS } from '../src/state/store';

/** Names and design language of real instruments that these original designs must not use. */
const BANNED = [
  'fender',
  'gibson',
  'martin',
  'taylor',
  'ibanez',
  'yamaha',
  'prs',
  'epiphone',
  'gretsch',
  'rickenbacker',
  'jackson',
  'schecter',
  'esp',
  'dean',
  'squier',
  'ovation',
  'takamine',
  'guild',
  'washburn',
  'kramer',
  'charvel',
  'danelectro',
  'ricken',
  'stratocaster',
  'strat',
  'telecaster',
  'tele',
  'les paul',
  'sg',
  'flying v',
  'explorer',
  'firebird',
  'jazzmaster',
  'jaguar',
  'mustang',
  'es-335',
  '335',
  'dreadnought',
  'd-28',
  'j-45',
  'superstrat',
  'offset',
  'humbucker',
];

const allShapes = (m: (typeof GUITAR_MODELS)[number]): Shape[] => [
  ...m.headstock.shapes,
  ...m.body.shapes,
];
const PATH_COMMANDS = /^[MLCZmlczHhVvSsQqTtAa0-9,.\-\s]+$/;

describe('the shipped guitar models', () => {
  it('has the five models the plan lists, with unique ids', () => {
    expect(GUITAR_MODELS.map((m) => m.id)).toEqual([
      'steel-acoustic',
      'classical',
      'double-cut',
      'single-cut',
      'hollow-body',
    ]);
    expect(new Set(GUITAR_MODELS.map((m) => m.id)).size).toBe(GUITAR_MODELS.length);
    expect(GUITAR_MODELS.map((m) => m.name)).toEqual([
      'Steel-string acoustic',
      'Classical (nylon)',
      'Solid-body electric, double cutaway',
      'Solid-body electric, single cutaway',
      'Hollow-body electric',
    ]);
  });

  it('carries no brand or model names, in any text of any model', () => {
    for (const m of GUITAR_MODELS) {
      const text = JSON.stringify(m).toLowerCase();
      for (const word of BANNED) {
        const found = new RegExp(`(^|[^a-z])${word.replace(/[-]/g, '\\-')}([^a-z]|$)`).test(text);
        expect(found, `${m.id} mentions "${word}"`).toBe(false);
      }
    }
  });

  it('gives every model a natural sound preset and a fret count the app supports', () => {
    const presets = new Set(SOUND_PRESETS.map((p) => p.id));
    for (const m of GUITAR_MODELS) {
      expect(presets.has(m.defaultSound), m.id).toBe(true);
      expect(m.defaultFrets).toBeGreaterThanOrEqual(MIN_FRETS);
      expect(m.defaultFrets).toBeLessThanOrEqual(MAX_FRETS);
    }
    expect(getGuitarModel('classical').defaultSound).toBe('classical');
    expect(getGuitarModel('classical').defaultFrets).toBe(19);
    expect(getGuitarModel('hollow-body').defaultSound).toBe('jazz');
  });

  it('describes six strings with thickness decreasing from the lowest to the highest', () => {
    for (const m of GUITAR_MODELS) {
      const { widths, isWound } = m.strings;
      expect(widths).toHaveLength(6);
      expect(isWound).toHaveLength(6);
      for (let i = 1; i < 6; i++) expect(widths[i]).toBeLessThan(widths[i - 1] as number);
      // The bass strings are wound and the trebles plain.
      expect(isWound).toEqual([true, true, true, false, false, false]);
    }
  });

  it('nylon: clear translucent trebles, smooth silk-wound basses', () => {
    const { strings } = getGuitarModel('classical');
    expect(strings.plainOpacity).toBeLessThan(1);
    expect(strings.windPattern).toBe(false);
    expect(getGuitarModel('steel-acoustic').strings.windPattern).toBe(true);
  });

  it('gives the five models visibly different looks', () => {
    const signature = (m: (typeof GUITAR_MODELS)[number]) =>
      JSON.stringify([m.wood, m.inlay, m.finish, m.headstock.shapes[0], m.strings.plain]);
    expect(new Set(GUITAR_MODELS.map(signature)).size).toBe(5);
    const headstocks = GUITAR_MODELS.map((m) => (m.headstock.shapes[0] as { d: string }).d);
    expect(new Set(headstocks).size).toBe(5);
    const bodies = GUITAR_MODELS.map((m) => JSON.stringify(m.body.shapes[0]));
    expect(new Set(bodies).size).toBe(5);
  });

  it('draws only well-formed shapes inside the visible frame', () => {
    for (const m of GUITAR_MODELS) {
      // The first headstock shape is the outline.
      expect(m.headstock.shapes[0]?.kind).toBe('path');
      for (const s of allShapes(m)) {
        if (s.kind === 'path') {
          expect(PATH_COMMANDS.test(s.d), `${m.id}: ${s.d}`).toBe(true);
          expect(s.d.trim().startsWith('M')).toBe(true);
        } else if (s.kind === 'circle') {
          expect(s.r).toBeGreaterThan(0);
        } else {
          expect(s.w).toBeGreaterThan(0);
          expect(s.h).toBeGreaterThan(0);
        }
        if (s.opacity !== undefined) {
          expect(s.opacity).toBeGreaterThan(0);
          expect(s.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('every colour token used by a model resolves', () => {
    for (const m of GUITAR_MODELS) {
      const skin = resolveSkin(m.id);
      const paints = [m.headstock.face, ...allShapes(m).flatMap((s) => [s.fill, s.stroke])];
      for (const p of paints) {
        if (p?.startsWith('@')) expect(skin.tokens[p], `${m.id} ${p}`).toBeDefined();
        expect(paint(skin, p)).not.toMatch(/^@/);
      }
    }
  });
});

describe('customising', () => {
  it('starts from the model’s own wood, inlays and finish', () => {
    const skin = resolveSkin('double-cut');
    expect(skin.woodId).toBe('maple');
    expect(skin.inlay).toBe('dots');
    expect(skin.finish).toBe('#1f7a8c');
    expect(skin.lightBoard).toBe(true);
  });

  it('applies wood, inlay and finish choices on top of any model', () => {
    for (const m of GUITAR_MODELS) {
      const skin = resolveSkin(m.id, { wood: 'ebony', inlay: 'blocks', finish: '#a63a2c' });
      expect(skin.woodId).toBe('ebony');
      expect(skin.inlay).toBe('blocks');
      expect(skin.finish).toBe('#a63a2c');
      expect(skin.tokens['@finish']).toBe('#a63a2c');
      expect(skin.lightBoard).toBe(false);
      expect(skin.wood).toBe(WOODS.ebony);
    }
  });

  it('a pale wood is flagged so note outlines stay readable', () => {
    expect(resolveSkin('steel-acoustic', { ...NO_CUSTOMISE, wood: 'maple' }).lightBoard).toBe(true);
    expect(resolveSkin('double-cut', { ...NO_CUSTOMISE, wood: 'rosewood' }).lightBoard).toBe(false);
  });

  it('derives darker and lighter shades from the finish', () => {
    const skin = resolveSkin('steel-acoustic', { ...NO_CUSTOMISE, finish: '#808080' });
    expect(skin.tokens['@finishDark']).toBe('#464646');
    expect(parseInt((skin.tokens['@finishLight'] as string).slice(1, 3), 16)).toBeGreaterThan(0x80);
  });

  it('offers wood, inlay and finish choices', () => {
    expect(Object.keys(WOODS)).toEqual(['rosewood', 'maple', 'ebony']);
    expect(INLAY_STYLES.map((i) => i.id)).toEqual(['dots', 'blocks', 'none']);
    expect(FINISHES.length).toBeGreaterThanOrEqual(5);
    expect(FINISHES.every((f) => /^#[0-9a-f]{6}$/.test(f.hex))).toBe(true);
  });

  it('sanitises stored customisations', () => {
    expect(sanitizeCustomise(null)).toEqual(NO_CUSTOMISE);
    expect(sanitizeCustomise({ wood: 'plastic', inlay: 7, finish: 'red' })).toEqual(NO_CUSTOMISE);
    expect(sanitizeCustomise({ wood: 'maple', inlay: 'none', finish: '#ABCDEF' })).toEqual({
      wood: 'maple',
      inlay: 'none',
      finish: '#ABCDEF',
    });
  });

  it('falls back to the first model for an unknown id', () => {
    expect(getGuitarModel('nope').id).toBe('steel-acoustic');
    expect(isGuitarModelId('classical')).toBe(true);
    expect(isGuitarModelId('nope')).toBe(false);
  });
});
