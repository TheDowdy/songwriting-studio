import { describe, expect, it } from 'vitest';
import { migrateSong, STANDARD_GUITAR_TUNING, voicingStatus, type ChordEvent, type Song } from './schema';
import type { ChordRef } from './theory/types';

const cMajor: ChordRef = { root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'I' };
const dMajor: ChordRef = { root: 'D', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'I' };

/** A v1 song fixture, shaped exactly like PB's original (no schemaVersion, guitar or attachments). */
function v1Fixture(): unknown {
  return {
    id: 'song-1',
    title: 'My Song',
    key: { tonic: 'C', mode: 'major' },
    timeSig: { beats: 4, unit: 4 },
    bpm: 120,
    instrument: 'guitar',
    pattern: 'block',
    sections: [
      {
        id: 's1',
        name: 'Verse',
        events: [{ id: 'e1', chord: cMajor, beats: 4 }],
        repeat: 1,
      },
    ],
    arrangement: ['s1'],
    updatedAt: 12345,
  };
}

describe('migrateSong: v1 → v2', () => {
  it('upgrades a real-shaped v1 song', () => {
    const song = migrateSong(v1Fixture());
    expect(song).not.toBeNull();
    expect(song!.schemaVersion).toBe(3);
    expect(song!.id).toBe('song-1');
    expect(song!.title).toBe('My Song');
    expect(song!.sections[0]!.events[0]!.chord.root).toBe('C');
    expect(song!.guitar).toEqual({ tuning: STANDARD_GUITAR_TUNING, capo: 0 });
    expect(song!.moduleData).toBeUndefined();
  });

  it('preserves a v2 song unchanged in substance (attachments, guitar setup, moduleData)', () => {
    const v2 = migrateSong(v1Fixture())!;
    const withExtras: Song = {
      ...v2,
      guitar: { tuning: [38, 43, 47, 52, 56, 61], capo: 2, tuningName: 'Drop D' },
      moduleData: { guitar: { foo: 'bar' } },
      sections: [
        {
          ...v2.sections[0]!,
          events: [{ id: 'e1', chord: cMajor, beats: 4, attachments: { guitar: { frets: [null, 3, 2, 0, 1, 0], tuning: STANDARD_GUITAR_TUNING, capo: 0, source: 'picked' } } }],
        },
      ],
    };
    const again = migrateSong(withExtras);
    expect(again!.guitar).toEqual(withExtras.guitar);
    expect(again!.moduleData).toEqual({ guitar: { foo: 'bar' } });
    expect(again!.sections[0]!.events[0]!.attachments?.guitar?.source).toBe('picked');
  });

  it('returns null for anything not shaped like a song', () => {
    expect(migrateSong(null)).toBeNull();
    expect(migrateSong('hello')).toBeNull();
    expect(migrateSong({})).toBeNull();
    expect(migrateSong({ id: 'x' })).toBeNull(); // no sections/arrangement
  });

  it('sanitises untrusted/malformed fields instead of crashing (storage/import is untrusted, §8)', () => {
    const song = migrateSong({
      id: 's',
      sections: [{ id: 'a', name: 'V', events: 'not-an-array', repeat: -5 }, 'garbage', { id: 'b' }],
      arrangement: ['a', 'ghost', 42],
      key: { tonic: 42, mode: 'bogus' },
      bpm: 'loud',
      instrument: 'kazoo',
      timeSig: { beats: 999, unit: 3 },
    });
    expect(song).not.toBeNull();
    expect(song!.key).toEqual({ tonic: 'C', mode: 'major' });
    expect(song!.bpm).toBe(100);
    expect(song!.instrument).toBe('piano');
    expect(song!.timeSig).toEqual({ beats: 32, unit: 4 });
    expect(song!.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(song!.sections[0]!.events).toEqual([]);
    expect(song!.sections[0]!.repeat).toBe(1);
    expect(song!.arrangement).toEqual(['a']); // drops ids that don't resolve to a section
  });

  it('drops an event whose chord is not shaped like a ChordRef', () => {
    const song = migrateSong({
      id: 's',
      sections: [{ id: 'a', events: [{ id: 'e1', chord: cMajor, beats: 4 }, { id: 'e2', chord: { bogus: true }, beats: 4 }] }],
      arrangement: ['a'],
    });
    expect(song!.sections[0]!.events.map((e) => e.id)).toEqual(['e1']);
  });

  it('falls back to one empty section when every section is unusable', () => {
    const song = migrateSong({ id: 's', sections: ['garbage'], arrangement: [] });
    expect(song!.sections).toHaveLength(1);
    expect(song!.arrangement).toEqual([song!.sections[0]!.id]);
  });
});

describe('voicingStatus', () => {
  const song: Pick<Song, 'guitar'> = { guitar: { tuning: STANDARD_GUITAR_TUNING, capo: 0 } };
  // Open-position C major: x-3-2-0-1-0 (low→high: E A D G B E).
  const cShape = { frets: [null, 3, 2, 0, 1, 0], tuning: STANDARD_GUITAR_TUNING, capo: 0, source: 'picked' as const };

  it("'none' when nothing is committed", () => {
    const event: Pick<ChordEvent, 'chord' | 'attachments'> = { chord: cMajor };
    expect(voicingStatus(event, song)).toBe('none');
  });

  it("'ok' for a voicing that fits the chord and the song's tuning/capo", () => {
    const event: Pick<ChordEvent, 'chord' | 'attachments'> = { chord: cMajor, attachments: { guitar: cShape } };
    expect(voicingStatus(event, song)).toBe('ok');
  });

  it("'chord-changed' when the chord changed under a committed voicing", () => {
    const event: Pick<ChordEvent, 'chord' | 'attachments'> = { chord: dMajor, attachments: { guitar: cShape } };
    expect(voicingStatus(event, song)).toBe('chord-changed');
  });

  it("'chord-changed' when the lowest sounding note isn't the chord's bass", () => {
    // A/C#/E shape whose lowest string is the 3rd, not the root — wrong bass for a root-position chord.
    const wrongBass = { ...cShape, frets: [null, null, 2, 0, 1, 0] }; // drops the low C, E is now lowest
    const event: Pick<ChordEvent, 'chord' | 'attachments'> = { chord: cMajor, attachments: { guitar: wrongBass } };
    expect(voicingStatus(event, song)).toBe('chord-changed');
  });

  it("'tuning-changed' when the song's capo/tuning no longer matches the committed voicing", () => {
    const event: Pick<ChordEvent, 'chord' | 'attachments'> = { chord: cMajor, attachments: { guitar: cShape } };
    expect(voicingStatus(event, { guitar: { tuning: STANDARD_GUITAR_TUNING, capo: 2 } })).toBe('tuning-changed');
    expect(voicingStatus(event, { guitar: { tuning: [38, 43, 47, 52, 56, 61], capo: 0 } })).toBe('tuning-changed');
  });
});

describe('migrateSong: v2 → v3 (section patterns fold onto chords)', () => {
  const strum = { id: 'x', name: 'X', beats: 4, stepsPerBeat: 2, steps: Array.from({ length: 8 }, () => null) };
  const v2 = (sectionPattern: unknown, songPattern: unknown = 'block') => ({
    ...(v1Fixture() as object),
    schemaVersion: 2,
    pattern: songPattern,
    patterns: [strum],
    sections: [
      {
        id: 's1',
        name: 'Verse',
        repeat: 1,
        pattern: sectionPattern,
        events: [
          { id: 'e1', chord: { root: 'C', quality: 'maj' }, beats: 4, pattern: 'strum-down' },
          { id: 'e2', chord: { root: 'F', quality: 'maj' }, beats: 4 },
        ],
      },
    ],
    arrangement: ['s1'],
  });

  it("gives a v2 section's pattern to the chords without their own, keeps the own, and drops the section field", () => {
    const song = migrateSong(v2('custom:x'))!;
    expect(song.schemaVersion).toBe(3);
    expect(song.sections[0]!.events.map((e) => e.pattern)).toEqual(['strum-down', 'custom:x']);
    expect('pattern' in song.sections[0]!).toBe(false);
  });
  it('does not fold a section pattern equal to the song default', () => {
    const song = migrateSong(v2('pulse', 'pulse'))!;
    expect(song.sections[0]!.events.map((e) => e.pattern)).toEqual(['strum-down', undefined]);
  });
  it('drops an unknown or deleted section pattern', () => {
    expect(migrateSong(v2('custom:gone'))!.sections[0]!.events[1]!.pattern).toBeUndefined();
    expect(migrateSong(v2('nonsense'))!.sections[0]!.events[1]!.pattern).toBeUndefined();
  });
  it('ignores a stray section pattern on a v3 song', () => {
    const song = migrateSong({ ...(v2('custom:x') as object), schemaVersion: 3 })!;
    expect(song.sections[0]!.events[1]!.pattern).toBeUndefined();
    expect('pattern' in song.sections[0]!).toBe(false);
  });
});
