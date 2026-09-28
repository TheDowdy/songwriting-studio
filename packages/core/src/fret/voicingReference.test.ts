import { describe, expect, it } from 'vitest';
import { describeChord } from './chords';
import { REFERENCE_VOICINGS, STANDARD_TUNING_MIDI } from './voicingReference';
import { bestVoicingIndex, findVoicings, shapeText, targetFromChord } from './voicings';

/** The scorer's default pick for each reference chord (24 frets, default rules — as the app). */
function pick(ref: (typeof REFERENCE_VOICINGS)[number]): string {
  const list = findVoicings(ref.tuning ?? STANDARD_TUNING_MIDI, 22, targetFromChord(describeChord(ref.spec)));
  const best = list[bestVoicingIndex(list)];
  return best ? shapeText(best.frets) : '(none)';
}

describe('default voicing matches what a guitarist would expect (voicingReference.ts)', () => {
  it('every reference chord', () => {
    const misses = REFERENCE_VOICINGS.map((ref) => ({ ref, got: pick(ref) }))
      .filter(({ ref, got }) => !ref.accept.includes(got))
      .map(({ ref, got }) => `${ref.name}: got ${got}, want ${ref.accept.join(' or ')}`);
    expect(misses).toEqual([]);
  });

  for (const ref of REFERENCE_VOICINGS) {
    it(ref.name, () => {
      expect(ref.accept).toContain(pick(ref));
    });
  }
});
