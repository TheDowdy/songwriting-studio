/**
 * Colours for scale degrees (PLAN.md §10). Pure data + maths, no DOM, so it is unit tested for
 * the degree rules and for text legibility.
 */
import type { Degree } from './scales';

export type PaletteId = 'rainbow' | 'colourblind';

/** Degrees 1–7: red, orange, yellow, green, blue, indigo, violet. */
const RAINBOW = ['#dc2f3e', '#f4802a', '#f7d716', '#3fae49', '#2f80ed', '#4b3fb8', '#9b4dca'];

/** Okabe–Ito colours in rainbow-ish order: distinguishable under the common colour-vision types. */
const COLOURBLIND = ['#d55e00', '#e69f00', '#f0e442', '#009e73', '#56b4e9', '#0072b2', '#cc79a7'];

export const DEGREE_PALETTES: Record<PaletteId, readonly string[]> = {
  rainbow: RAINBOW,
  colourblind: COLOURBLIND,
};

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Piecewise-linear blend through `stops`, t in 0–1. */
function ramp(stops: readonly string[], t: number): string {
  const pos = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const a = parseHex(stops[i] as string);
  const b = parseHex(stops[i + 1] as string);
  const f = pos - i;
  return `#${a
    .map((v, k) =>
      Math.round(v + ((b[k] as number) - v) * f)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Viridis anchors: steps differ in lightness as well as hue, so the order survives colour blindness. */
const VIRIDIS = ['#440154', '#3b528b', '#25a28b', '#5ec962', '#fde725'];

/** Colour of a chromatic-scale note: a 12-hue wheel starting at red (or a lightness ramp). */
export function chromaticColour(interval: number, palette: PaletteId = 'rainbow'): string {
  const step = ((interval % 12) + 12) % 12;
  return palette === 'colourblind' ? ramp(VIRIDIS, step / 11) : hslToHex(step * 30, 0.72, 0.5);
}

/**
 * Colour by degree *number*, so an altered degree keeps its natural degree's hue and related
 * scales stay consistent (minor pentatonic: 1 red, ♭3 yellow, 4 green, 5 blue, ♭7 violet).
 */
export function degreeColour(degree: Degree, palette: PaletteId = 'rainbow'): string {
  return DEGREE_PALETTES[palette][degree.number - 1] as string;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const TEXT_DARK = '#161310';
export const TEXT_LIGHT = '#ffffff';

/** Black or white, whichever reads better on `background`. */
export function textOn(background: string): string {
  return contrastRatio(background, TEXT_DARK) >= contrastRatio(background, TEXT_LIGHT)
    ? TEXT_DARK
    : TEXT_LIGHT;
}
