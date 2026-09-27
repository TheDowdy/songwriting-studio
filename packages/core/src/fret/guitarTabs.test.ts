import { describe, expect, it } from 'vitest';
import { defaultGuitarTab, sanitizeGuitarTab } from './guitarTabs';

describe('defaultGuitarTab', () => {
  it('is Chords when a song is open', () => {
    expect(defaultGuitarTab(true)).toBe('chord');
  });
  it('is Scales as a stand-alone tool', () => {
    expect(defaultGuitarTab(false)).toBe('scale');
  });
});

describe('sanitizeGuitarTab (untrusted storage input, §8)', () => {
  it('passes through every still-valid tab', () => {
    expect(sanitizeGuitarTab('scale')).toBe('scale');
    expect(sanitizeGuitarTab('chord')).toBe('chord');
    expect(sanitizeGuitarTab('identify')).toBe('identify');
  });
  it("the removed 'explore' tab sanitises to null (use the context's default)", () => {
    expect(sanitizeGuitarTab('explore')).toBeNull();
  });
  it('any other unknown value sanitises to null too', () => {
    expect(sanitizeGuitarTab('bogus')).toBeNull();
    expect(sanitizeGuitarTab(undefined)).toBeNull();
    expect(sanitizeGuitarTab(null)).toBeNull();
    expect(sanitizeGuitarTab(42)).toBeNull();
    expect(sanitizeGuitarTab({})).toBeNull();
  });
});
