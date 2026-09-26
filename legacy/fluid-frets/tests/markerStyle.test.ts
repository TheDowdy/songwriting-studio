import { describe, expect, it } from 'vitest';
import {
  markerStyle,
  PLAIN_MARKER,
  type ScaleStyleOptions,
} from '../src/components/Fretboard/markerStyle';
import { skin } from '../src/components/Fretboard/skin';
import { parseNoteName } from '../src/theory/notes';
import { contrastRatio, DEGREE_PALETTES } from '../src/theory/scaleColors';
import { getScale } from '../src/theory/scales';
import { buildPitchViews } from '../src/theory/scaleView';

const opts = (over: Partial<ScaleStyleOptions> = {}): ScaleStyleOptions => ({
  colourMode: false,
  palette: 'rainbow',
  hideOutOfScale: false,
  chromatic: false,
  ...over,
});
const views = (root: string, scaleId: string, overlay: number[] | null = null) =>
  buildPitchViews(parseNoteName(root), getScale(scaleId), overlay && new Set(overlay));

describe('markerStyle', () => {
  it('explore mode draws every note the same', () => {
    expect(markerStyle(undefined, null)).toBe(PLAIN_MARKER);
  });

  it('highlights the tonic: distinct colour, larger, white outline', () => {
    const v = views('E', 'minor-pentatonic');
    const tonic = markerStyle(v[4], opts());
    const inScale = markerStyle(v[7], opts());
    expect(tonic.fill).toBe(skin.tonicFill);
    expect(inScale.fill).toBe(skin.markerFill);
    expect(tonic.scale).toBeGreaterThan(inScale.scale);
    expect(tonic.stroke).toBe(skin.tonicStroke);
  });

  it('greys out out-of-scale notes: ~30 % opacity, outline only, still tappable', () => {
    const out = markerStyle(views('E', 'minor-pentatonic')[1], opts());
    expect(out.visible).toBe(true);
    expect(out.opacity).toBeCloseTo(0.3, 1);
    expect(out.fill).toBe('transparent');
  });

  it('removes out-of-scale notes when hidden, but not ones that carry an overlay ring', () => {
    const plain = views('A', 'natural-minor');
    expect(markerStyle(plain[1], opts({ hideOutOfScale: true })).visible).toBe(false);
    expect(markerStyle(plain[0], opts({ hideOutOfScale: true })).visible).toBe(true);
    const blues = views('A', 'natural-minor', [0, 3]); // E♭ is the blue note, outside natural minor
    const blueNote = markerStyle(blues[3], opts({ hideOutOfScale: true }));
    expect(blueNote.visible).toBe(true);
    expect(blueNote.ring).toBe(true);
    expect(blueNote.opacity).toBeGreaterThan(0.5);
  });

  it('shrinks ringed markers to leave room for the ring', () => {
    const v = views('C', 'major', [0, 4, 7]);
    expect(markerStyle(v[4], opts()).scale).toBeLessThan(
      markerStyle(views('C', 'major')[4], opts()).scale,
    );
    expect(markerStyle(v[4], opts()).ring).toBe(true);
    expect(markerStyle(v[2], opts()).ring).toBe(false);
  });

  it('colour mode fills by degree with legible text', () => {
    const v = views('E', 'minor-pentatonic');
    const c = DEGREE_PALETTES.rainbow;
    // 1 red, ♭3 yellow, 4 green, 5 blue, ♭7 violet.
    const fills = [4, 7, 9, 11, 2].map((pc) => markerStyle(v[pc], opts({ colourMode: true })));
    expect(fills.map((f) => f.fill)).toEqual([c[0], c[2], c[3], c[4], c[6]]);
    for (const f of fills) expect(contrastRatio(f.fill, f.text)).toBeGreaterThanOrEqual(4.5);
  });

  it('marks only the altered twin of a shared degree with a dashed ring, and only in colour mode', () => {
    const v = views('A', 'blues');
    const on = opts({ colourMode: true });
    const flat5 = markerStyle(v[3], on);
    const five = markerStyle(v[4], on);
    expect(flat5.dashed).toBe(true);
    expect(five.dashed).toBe(false);
    expect(flat5.fill).toBe(five.fill);
    expect(markerStyle(v[3], opts()).dashed).toBe(false);
  });

  it('colour-blind palette changes the fills', () => {
    const v = views('E', 'minor-pentatonic');
    const a = markerStyle(v[7], opts({ colourMode: true }));
    const b = markerStyle(v[7], opts({ colourMode: true, palette: 'colourblind' }));
    expect(a.fill).not.toBe(b.fill);
  });

  it('chromatic scale uses the 12-hue wheel', () => {
    const v = views('C', 'chromatic');
    const fills = v.map((p) => markerStyle(p, opts({ colourMode: true, chromatic: true })).fill);
    expect(new Set(fills).size).toBe(12);
  });
});
