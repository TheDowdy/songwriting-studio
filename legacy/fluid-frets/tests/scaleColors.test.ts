import { describe, expect, it } from 'vitest';
import {
  chromaticColour,
  contrastRatio,
  DEGREE_PALETTES,
  degreeColour,
  TEXT_DARK,
  textOn,
} from '../src/theory/scaleColors';
import { getScale, parseDegree } from '../src/theory/scales';

const HEX = /^#[0-9a-f]{6}$/;

describe('degree colours', () => {
  it('colours degrees 1–7 red, orange, yellow, green, blue, indigo, violet', () => {
    const c = DEGREE_PALETTES.rainbow;
    expect(c).toHaveLength(7);
    // Hue order: red (≈0°) → orange → yellow → green → blue → indigo → violet.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const hues = c.map(hue);
    // Red sits on the 0° line, so allow a hair to either side of it.
    expect(((hues[0] as number) + 15) % 360).toBeLessThan(30);
    expect(hues[1]).toBeGreaterThan(15);
    expect(hues[1]).toBeLessThan(40);
    expect(hues[2]).toBeGreaterThan(45);
    expect(hues[2]).toBeLessThan(65);
    expect(hues[3]).toBeGreaterThan(100);
    expect(hues[3]).toBeLessThan(140);
    expect(hues[4]).toBeGreaterThan(200);
    expect(hues[4]).toBeLessThan(230);
    expect(hues[5]).toBeGreaterThan(235);
    expect(hues[5]).toBeLessThan(260);
    expect(hues[6]).toBeGreaterThan(270);
    expect(hues[6]).toBeLessThan(300);
  });

  it('keeps the colour of the degree number for altered degrees (minor pentatonic)', () => {
    const rainbow = DEGREE_PALETTES.rainbow;
    const colours = getScale('minor-pentatonic').degrees.map((d) => degreeColour(d));
    // 1 red, ♭3 yellow (the colour of 3), 4 green, 5 blue, ♭7 violet (the colour of 7).
    expect(colours).toEqual([rainbow[0], rainbow[2], rainbow[3], rainbow[4], rainbow[6]]);
  });

  it('gives a flattened degree the hue of its natural degree', () => {
    for (const palette of ['rainbow', 'colourblind'] as const) {
      expect(degreeColour(parseDegree('b3'), palette)).toBe(
        degreeColour(parseDegree('3'), palette),
      );
      expect(degreeColour(parseDegree('#4'), palette)).toBe(
        degreeColour(parseDegree('4'), palette),
      );
    }
  });

  it('has valid, distinct colours in both palettes', () => {
    for (const palette of Object.values(DEGREE_PALETTES)) {
      expect(palette.every((c) => HEX.test(c))).toBe(true);
      expect(new Set(palette).size).toBe(7);
    }
  });
});

describe('chromatic colours', () => {
  it('is a 12-hue wheel starting at red', () => {
    const wheel = Array.from({ length: 12 }, (_, i) => chromaticColour(i));
    expect(new Set(wheel).size).toBe(12);
    // Red: strong red channel, weak green and blue.
    expect(parseInt((wheel[0] as string).slice(1, 3), 16)).toBeGreaterThan(200);
    expect(parseInt((wheel[0] as string).slice(3, 5), 16)).toBeLessThan(70);
    expect(chromaticColour(12)).toBe(wheel[0]);
  });

  it('colour-blind version varies steadily in lightness', () => {
    const lum = (i: number) => {
      const hex = chromaticColour(i, 'colourblind');
      return contrastRatio(hex, '#000000');
    };
    for (let i = 1; i < 12; i++) expect(lum(i)).toBeGreaterThan(lum(i - 1));
  });
});

describe('text on colours', () => {
  it('picks a legible text colour on every marker colour (WCAG AA, 4.5:1)', () => {
    const all = [
      ...DEGREE_PALETTES.rainbow,
      ...DEGREE_PALETTES.colourblind,
      ...Array.from({ length: 12 }, (_, i) => chromaticColour(i)),
      ...Array.from({ length: 12 }, (_, i) => chromaticColour(i, 'colourblind')),
    ];
    const weak = all.filter((bg) => contrastRatio(bg, textOn(bg)) < 4.5);
    expect(weak).toEqual([]);
  });

  it('uses dark text on yellow and light text on indigo', () => {
    expect(textOn(DEGREE_PALETTES.rainbow[2] as string)).toBe(TEXT_DARK);
    expect(textOn(DEGREE_PALETTES.rainbow[5] as string)).toBe('#ffffff');
  });
});
