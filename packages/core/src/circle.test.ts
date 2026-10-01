import { describe, expect, it } from 'vitest';
import { circleOfFifths } from './circle';
import type { Key } from './theory/types';

const C: Key = { tonic: 'C', mode: 'major' };
const at = (segs: ReturnType<typeof circleOfFifths>, ring: string, root: string) => segs.find((s) => s.ring === ring && s.root === root);

describe('circleOfFifths', () => {
  const segs = circleOfFifths(C);

  it('has a major, a minor and a diminished chord at each of 12 positions', () => {
    expect(segs).toHaveLength(36);
    for (const ring of ['major', 'minor', 'dim']) {
      expect(segs.filter((s) => s.ring === ring).map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    }
  });

  it('goes round by fifths, and the minor and diminished chords share their major key position', () => {
    expect(segs.filter((s) => s.ring === 'major').map((s) => s.root)).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']);
    expect(at(segs, 'minor', 'A')!.position).toBe(0); // A minor is C major's relative minor
    expect(at(segs, 'minor', 'E')!.position).toBe(1);
    expect(at(segs, 'dim', 'B')!.position).toBe(0); // the leading-tone chord of C
    expect(at(segs, 'dim', 'F#')!.position).toBe(1);
  });

  it('marks the tonic and the other chords of the key, including the diminished chord', () => {
    expect(at(segs, 'major', 'C')!.role).toBe('tonic');
    for (const [ring, root] of [['major', 'G'], ['major', 'F'], ['minor', 'A'], ['minor', 'D'], ['minor', 'E'], ['dim', 'B']] as const) {
      expect(at(segs, ring, root)!.role, `${ring} ${root}`).toBe('diatonic');
    }
  });

  it('marks chords of the parallel minor as borrowed, and the rest as other', () => {
    for (const [ring, root] of [['minor', 'C'], ['minor', 'F'], ['major', 'Bb'], ['major', 'Ab'], ['major', 'Eb']] as const) {
      expect(at(segs, ring, root)!.role, `${ring} ${root}`).toBe('borrowed');
    }
    expect(at(segs, 'major', 'F#')!.role).toBe('other');
    expect(at(segs, 'minor', 'Bb')!.role).toBe('other');
    expect(at(segs, 'dim', 'C')!.role).toBe('other');
  });

  it('builds the chord for each segment, labelled for the key', () => {
    expect(at(segs, 'major', 'G')!.chord).toMatchObject({ root: 'G', quality: 'maj', numeral: 'V', origin: 'diatonic' });
    expect(at(segs, 'dim', 'B')!.chord).toMatchObject({ root: 'B', quality: 'dim', origin: 'diatonic' });
    expect(at(segs, 'minor', 'F')!.chord).toMatchObject({ root: 'F', quality: 'min', numeral: 'iv', origin: 'borrowed' });
  });

  it('follows a minor key: its tonic is the minor chord, and roots are spelled for the key', () => {
    const am = circleOfFifths({ tonic: 'A', mode: 'minor' });
    expect(am.find((s) => s.ring === 'minor' && s.root === 'A')!.role).toBe('tonic');
    expect(am.find((s) => s.ring === 'major' && s.root === 'C')!.role).toBe('diatonic'); // III
    const flats = circleOfFifths({ tonic: 'F', mode: 'major' });
    expect(flats.filter((s) => s.ring === 'major').map((s) => s.root)).toContain('Bb');
    expect(flats.find((s) => s.ring === 'major' && s.position === 6)!.root).toBe('Gb');
    expect(circleOfFifths(C).find((s) => s.ring === 'major' && s.position === 6)!.root).toBe('F#');
    expect(flats.filter((s) => s.ring === 'major').map((s) => s.root)).not.toContain('A#');
  });
});
