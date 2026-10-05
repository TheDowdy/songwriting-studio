import { describe, expect, it } from 'vitest';
import { defaultGuitarShape, eventVoicing, guitarVoicingNotes } from './eventVoicing';
import type { ChordRef, GuitarVoicing } from './index';
import { voiceLeadChord } from './theory/voicings';

const C: ChordRef = { root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'I' };
const STANDARD = [40, 45, 50, 55, 59, 64];
const openC: GuitarVoicing = { frets: [null, 3, 2, 0, 1, 0], tuning: STANDARD, capo: 0, source: 'recommended' };

describe('guitarVoicingNotes', () => {
  it('the open C shape sounds C3 E3 G3 C4 E4', () => {
    expect(guitarVoicingNotes(openC)).toEqual([48, 52, 55, 60, 64]);
  });

  it('adds the capo it was committed with', () => {
    expect(guitarVoicingNotes({ ...openC, capo: 2 })).toEqual([50, 54, 57, 62, 66]);
  });

  it('uses its own tuning, not whatever the song is in now', () => {
    const dropD = [38, 45, 50, 55, 59, 64];
    expect(guitarVoicingNotes({ frets: [0, null, 0, 2, 3, 2], tuning: dropD, capo: 0, source: 'picked' })).toEqual([38, 50, 57, 62, 66]);
  });
});

describe('eventVoicing', () => {
  it('plays the committed shape on guitar', () => {
    expect(eventVoicing({ chord: C, attachments: { guitar: openC } }, 'guitar', null)).toEqual([48, 52, 55, 60, 64]);
  });

  it('ignores it on every other instrument', () => {
    expect(eventVoicing({ chord: C, attachments: { guitar: openC } }, 'piano', null)).toEqual(voiceLeadChord(C, null));
  });

  it('an uncommitted chord on guitar plays the default guitar shape when the setup is given', () => {
    const guitar = { tuning: [40, 45, 50, 55, 59, 64], capo: 0 };
    const frets = defaultGuitarShape(C, guitar)!;
    const expected = guitarVoicingNotes({ frets, tuning: guitar.tuning, capo: 0, source: 'recommended' });
    expect(expected.length).toBeGreaterThan(3);
    expect(eventVoicing({ chord: C }, 'guitar', null, guitar)).toEqual(expected);
    expect(eventVoicing({ chord: C }, 'piano', null, guitar)).toEqual(voiceLeadChord(C, null));
  });

  it('an uncommitted chord voice-leads as before', () => {
    const prev = [48, 52, 55, 60, 64];
    expect(eventVoicing({ chord: C }, 'guitar', prev)).toEqual(voiceLeadChord(C, prev));
  });

  it('a committed shape with every string muted falls back rather than going silent', () => {
    const silent: GuitarVoicing = { ...openC, frets: [null, null, null, null, null, null] };
    expect(eventVoicing({ chord: C, attachments: { guitar: silent } }, 'guitar', null)).toEqual(voiceLeadChord(C, null));
  });
});

describe('defaultGuitarShape', () => {
  const guitar = { tuning: STANDARD, capo: 0 };
  it('matches the guitar module’s default (the owner-approved B♭ barre)', () => {
    const Bb: ChordRef = { ...C, root: 'Bb', numeral: '♭VII' };
    expect(defaultGuitarShape(Bb, guitar)).toEqual([null, 1, 3, 3, 3, 1]);
  });

  it('is relative to the capo', () => {
    // D with a capo on 2 is the open C shape two frets up — shown as the C shape.
    const D: ChordRef = { ...C, root: 'D', numeral: 'II' };
    expect(defaultGuitarShape(D, { tuning: STANDARD, capo: 2 })).toEqual([null, 3, 2, 0, 1, 0]);
  });
});
