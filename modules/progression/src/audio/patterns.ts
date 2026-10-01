import { isCustomPatternId, strumEvents, strumNotes, strumVelocity } from '@sw/core';
import type { PatternId, StrumPattern, TimeSig } from '@sw/core';

/**
 * One strike within a chord's own beat window. `noteIndices` refer to positions in the chord's
 * voicing array (`[bass, ...upperNotes]`, as built by voicings.ts), so a pattern doesn't need to
 * know the actual pitches. `strumSeconds` staggers the notes within the strike (positive = low
 * to high, negative = high to low); omitted or 0 means struck together.
 */
export interface Strike {
  /** Beats from the start of the chord's own window. */
  offset: number;
  /** How long the strike rings, in beats, before the next one (or the chord's end) cuts it. */
  duration: number;
  noteIndices: number[];
  strumSeconds?: number;
  /** 0–1 loudness; omitted means full. Up-strokes are lighter than down-strokes. */
  velocity?: number;
}

const STRUM_SECONDS = 0.03;
/** An up-stroke is lighter and catches only the higher strings (no bass note). */
const UP_VELOCITY = 0.6;
/** Held length as a fraction of the beat, short of the full beat so arpeggio notes stay separate. */
const ARP_GAP = 0.9;

/** [bass index 0, upper indices 1..upperCount]. */
const allIndices = (upperCount: number) => Array.from({ length: upperCount + 1 }, (_, i) => i);

/**
 * The note events for one chord, `beats` long. `timeSig` is reserved for meter-aware variants
 * (e.g. compound-time arpeggios); today's patterns only need the beat count.
 */
export function renderPattern(pattern: PatternId, upperCount: number, beats: number, _timeSig: TimeSig): Strike[] {
  const all = allIndices(upperCount);
  const upper = all.slice(1);
  // A custom pattern is rendered by `renderStrumPattern`; if its definition is gone, play the chord whole.
  if (isCustomPatternId(pattern)) return [{ offset: 0, duration: beats, noteIndices: all }];

  switch (pattern) {
    case 'block':
      return [{ offset: 0, duration: beats, noteIndices: all }];

    case 'pulse':
      return Array.from({ length: beats }, (_, b) => ({ offset: b, duration: 1, noteIndices: all }));

    case 'strum-down':
      return Array.from({ length: beats }, (_, b) => ({ offset: b, duration: 1, noteIndices: all, strumSeconds: STRUM_SECONDS }));

    case 'strum-updown':
      return Array.from({ length: beats }, (_, b) => {
        const down = b % 2 === 0;
        if (down) return { offset: b, duration: 1, noteIndices: all, strumSeconds: STRUM_SECONDS };
        const high = upper.length >= 2 ? upper : all;
        return { offset: b, duration: 1, noteIndices: [...high].reverse(), strumSeconds: -STRUM_SECONDS, velocity: UP_VELOCITY };
      });

    case 'arp-up': {
      const n = Math.max(1, upper.length);
      const steps = beats * 2; // eighth-note subdivisions
      return Array.from({ length: steps }, (_, i) => ({ offset: i * 0.5, duration: 0.5 * ARP_GAP, noteIndices: [upper[i % n]] }));
    }

    case 'arp-updown': {
      const n = upper.length;
      const seq = n > 2 ? [...upper, ...[...upper].reverse().slice(1, -1)] : upper;
      const len = Math.max(1, seq.length);
      const steps = beats * 2;
      return Array.from({ length: steps }, (_, i) => ({ offset: i * 0.5, duration: 0.5 * ARP_GAP, noteIndices: [seq[i % len]] }));
    }

    case 'arp-broken': {
      const n = upper.length;
      if (n === 0) return [];
      // A rolling "1-3-2-3"-style broken figure (falls back to alternating for triads/2-note shapes).
      const order = n >= 3 ? [0, 2, 1, 2] : [0, 1];
      const steps = beats * 2;
      return Array.from({ length: steps }, (_, i) => ({
        offset: i * 0.5,
        duration: 0.5 * ARP_GAP,
        noteIndices: [upper[order[i % order.length] % n]],
      }));
    }

    case 'bass-chord': {
      if (beats <= 1) return [{ offset: 0, duration: beats, noteIndices: all }];
      return [
        { offset: 0, duration: 1, noteIndices: [0] },
        { offset: 1, duration: beats - 1, noteIndices: upper },
      ];
    }
  }
}

/**
 * The strikes of one of the song's own strum patterns over a chord `beats` long. A down stroke
 * staggers its notes low to high; an up stroke high to low and lighter; a partial strum sounds only
 * the lower or upper half of the chord's notes (see `strumNotes`).
 */
export function renderStrumPattern(pattern: StrumPattern, upperCount: number, beats: number): Strike[] {
  const all = allIndices(upperCount);
  return strumEvents(pattern, beats).map(({ offsetBeats, durationBeats, step }) => ({
    offset: offsetBeats,
    duration: durationBeats,
    noteIndices: strumNotes(all, step),
    strumSeconds: step.stroke === 'down' ? STRUM_SECONDS : -STRUM_SECONDS,
    velocity: strumVelocity(step),
  }));
}
