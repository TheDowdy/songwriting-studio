import { describe, expect, it } from 'vitest';
import {
  fretCentreXs,
  fretSpaceWidths,
  fretWireXs,
  inlayFrets,
  LAYOUT,
  markerRadius,
  mirrorX,
  nutX,
  shouldUseRealisticSpacing,
  stringY,
  totalWidth,
} from '../src/components/Fretboard/geometry';

describe('fretWireXs', () => {
  it.each([18, 22, 24])('%i frets: nut at nutX, last fret at nutX + neckLength', (n) => {
    for (const realistic of [true, false]) {
      const wires = fretWireXs(n, realistic);
      expect(wires).toHaveLength(n + 1);
      expect(wires[0]).toBe(nutX);
      expect(wires[n]).toBeCloseTo(nutX + LAYOUT.neckLength, 8);
    }
  });

  it('even spacing has equal gaps', () => {
    const spaces = fretSpaceWidths(fretWireXs(20, false)).slice(1);
    for (const s of spaces) expect(s).toBeCloseTo(spaces[0] as number, 8);
  });

  it('realistic spacing shrinks monotonically and follows L·(1 − 2^(−n/12))', () => {
    const n = 24;
    const wires = fretWireXs(n, true);
    const spaces = fretSpaceWidths(wires).slice(1);
    for (let i = 1; i < spaces.length; i++) {
      expect(spaces[i]).toBeLessThan(spaces[i - 1] as number);
    }
    const L = LAYOUT.neckLength / (1 - 2 ** -2);
    expect(wires[12]).toBeCloseTo(nutX + L * 0.5, 8);
    // Octave fret is half the scale length: for a 24-fret neck, wire 12 is at 2/3 of the neck.
    expect((wires[12]! - nutX) / LAYOUT.neckLength).toBeCloseTo(2 / 3, 8);
  });
});

describe('positions', () => {
  const wires = fretWireXs(22, true);
  const centres = fretCentreXs(wires);
  const spaces = fretSpaceWidths(wires);

  it('centres frets between wires and puts the open note behind the nut', () => {
    expect(centres[0]).toBe(nutX - LAYOUT.openSlotWidth / 2);
    expect(centres[0]).toBeLessThan(nutX);
    for (let n = 1; n < wires.length; n++) {
      expect(centres[n]).toBeGreaterThan(wires[n - 1] as number);
      expect(centres[n]).toBeLessThan(wires[n] as number);
    }
  });

  it('places string 6 (index 0) at the bottom and string 1 at the top', () => {
    expect(stringY(0)).toBeGreaterThan(stringY(5));
    expect(stringY(5)).toBe(LAYOUT.edgeMargin);
    expect(stringY(0) - stringY(1)).toBe(LAYOUT.stringGap);
  });

  it('markers never overlap neighbours (diameter < fret space and < string gap)', () => {
    for (const [dense, realistic] of [
      [24, true],
      [24, false],
      [18, true],
    ] as const) {
      const s = fretSpaceWidths(fretWireXs(dense, realistic));
      for (const w of s) {
        const r = markerRadius(w);
        expect(2 * r).toBeLessThan(w);
        expect(2 * r).toBeLessThan(LAYOUT.stringGap);
      }
    }
    expect(spaces.length).toBe(23);
  });
});

describe('inlays', () => {
  it('has single dots and double dots at 12 and 24', () => {
    const inlays = inlayFrets(24);
    expect(inlays.filter((i) => i.double).map((i) => i.fret)).toEqual([12, 24]);
    expect(inlays.filter((i) => !i.double).map((i) => i.fret)).toEqual([
      3, 5, 7, 9, 15, 17, 19, 21,
    ]);
  });

  it('drops inlays beyond the last fret', () => {
    expect(inlayFrets(18).map((i) => i.fret)).toEqual([3, 5, 7, 9, 12, 15, 17]);
  });
});

describe('spacing choice and mirroring', () => {
  it('auto = realistic at ≥ 900 px, even below; explicit settings win', () => {
    expect(shouldUseRealisticSpacing('auto', 900)).toBe(true);
    expect(shouldUseRealisticSpacing('auto', 899)).toBe(false);
    expect(shouldUseRealisticSpacing('even', 2000)).toBe(false);
    expect(shouldUseRealisticSpacing('realistic', 300)).toBe(true);
  });

  it('mirrors x across the full width', () => {
    expect(mirrorX(10, false)).toBe(10);
    expect(mirrorX(10, true)).toBe(totalWidth - 10);
    expect(mirrorX(mirrorX(123, true), true)).toBe(123);
  });
});
