import { describe, expect, it } from 'vitest';
import type { PatternId, TimeSig } from '../types';
import { renderPattern } from './patterns';

const timeSig: TimeSig = { beats: 4, unit: 4 };
const PATTERNS: PatternId[] = ['block', 'pulse', 'strum-down', 'strum-updown', 'arp-up', 'arp-updown', 'arp-broken', 'bass-chord'];

describe('renderPattern', () => {
  it('every pattern stays within the chord window and uses valid note indices', () => {
    for (const pattern of PATTERNS)
      for (const upperCount of [2, 3]) // triad or 7th chord
        for (const beats of [1, 2, 4]) {
          const strikes = renderPattern(pattern, upperCount, beats, timeSig);
          const label = `${pattern} upperCount=${upperCount} beats=${beats}`;
          expect(strikes.length, label).toBeGreaterThan(0);
          for (const s of strikes) {
            expect(s.offset, label).toBeGreaterThanOrEqual(0);
            expect(s.offset + s.duration, label).toBeLessThanOrEqual(beats + 1e-9);
            expect(s.duration, label).toBeGreaterThan(0);
            expect(s.noteIndices.length, label).toBeGreaterThan(0);
            for (const idx of s.noteIndices) {
              expect(idx, label).toBeGreaterThanOrEqual(0);
              expect(idx, label).toBeLessThanOrEqual(upperCount);
            }
          }
        }
  });

  it('block holds the whole chord for the full duration', () => {
    const strikes = renderPattern('block', 2, 4, timeSig);
    expect(strikes).toEqual([{ offset: 0, duration: 4, noteIndices: [0, 1, 2] }]);
  });

  it('pulse re-strikes every beat', () => {
    const strikes = renderPattern('pulse', 2, 3, timeSig);
    expect(strikes.map((s) => s.offset)).toEqual([0, 1, 2]);
    expect(strikes.every((s) => s.noteIndices.length === 3)).toBe(true);
  });

  it('strum-down staggers notes low to high on every beat', () => {
    const strikes = renderPattern('strum-down', 2, 2, timeSig);
    expect(strikes.every((s) => (s.strumSeconds ?? 0) > 0)).toBe(true);
    expect(strikes[0].noteIndices).toEqual([0, 1, 2]);
  });

  it('strum-updown alternates stagger direction', () => {
    const strikes = renderPattern('strum-updown', 2, 2, timeSig);
    expect(strikes[0].strumSeconds).toBeGreaterThan(0);
    expect(strikes[1].strumSeconds).toBeLessThan(0);
  });

  it('strum-updown up-strokes are high-to-low, skip the bass and are lighter', () => {
    const [down, up] = renderPattern('strum-updown', 3, 2, timeSig);
    expect(down.noteIndices).toEqual([0, 1, 2, 3]);
    expect(up.noteIndices).toEqual([3, 2, 1]);
    expect(up.velocity ?? 1).toBeLessThan(down.velocity ?? 1);
  });

  it('arp-up cycles through the upper notes only, two per beat', () => {
    const strikes = renderPattern('arp-up', 2, 2, timeSig); // upper indices [1, 2]
    expect(strikes).toHaveLength(4);
    expect(strikes.map((s) => s.noteIndices[0])).toEqual([1, 2, 1, 2]);
    expect(strikes.map((s) => s.offset)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('bass-chord plays the root alone on beat 1, then the chord for the rest', () => {
    const strikes = renderPattern('bass-chord', 2, 4, timeSig);
    expect(strikes).toEqual([
      { offset: 0, duration: 1, noteIndices: [0] },
      { offset: 1, duration: 3, noteIndices: [1, 2] },
    ]);
  });

  it('bass-chord with a single beat just plays the whole chord (no room for a separate bass hit)', () => {
    const strikes = renderPattern('bass-chord', 2, 1, timeSig);
    expect(strikes).toEqual([{ offset: 0, duration: 1, noteIndices: [0, 1, 2] }]);
  });

  it('is deterministic', () => {
    expect(renderPattern('arp-broken', 3, 4, timeSig)).toEqual(renderPattern('arp-broken', 3, 4, timeSig));
  });
});
