/**
 * The notes a chord event sounds (Phase 5 item 3): with the guitar instrument and a committed
 * voicing, exactly that shape as the player committed it (its own tuning + capo + frets); with
 * anything else, `voiceLeadChord`'s smooth piano-style voicing. Playback, MIDI export and the
 * sheet music all go through this so they agree on what you hear.
 */
import { toChordSpec } from './convert';
import { capoedFretCount, capoedTuning } from './fret/capo';
import { describeChord } from './fret/chords';
import { bestVoicingIndex, findVoicings, shapeNotes, targetFromChord } from './fret/voicings';
import type { ChordEvent, GuitarSetup, GuitarVoicing, InstrumentId } from './schema';
import type { ChordRef } from './theory/types';
import { voiceLeadChord } from './theory/voicings';

/** Frets on the default neck (the guitar module's own default). */
const DEFAULT_FRET_COUNT = 22;

/**
 * The shape the guitar module would show first for `chord` on the song's guitar (Phase 5 item 2:
 * the progression module's Guitar view, for a chord with no committed voicing) — the same search
 * and scorer, default rules, on the song's tuning and capo, so both modules agree. Frets are
 * relative to the capo, like every committed voicing. Null when nothing is playable.
 */
export function defaultGuitarShape(chord: ChordRef, guitar: GuitarSetup): (number | null)[] | null {
  const info = describeChord(toChordSpec(chord), 'sharp');
  const voicings = findVoicings(
    capoedTuning(guitar.tuning, guitar.capo),
    capoedFretCount(DEFAULT_FRET_COUNT, guitar.capo),
    targetFromChord(info),
  );
  return voicings[bestVoicingIndex(voicings)]?.frets.slice() ?? null;
}

/** A committed voicing's sounding MIDI notes, lowest string first (`[bass, ...upper]`, the shape
 *  every pattern expects). Empty for a shape with every string muted. */
export function guitarVoicingNotes(voicing: GuitarVoicing): number[] {
  return shapeNotes(capoedTuning(voicing.tuning, voicing.capo), voicing.frets).map((n) => n.midi);
}

/**
 * `prev` is the previous event's return value (null for the first chord), so an uncommitted chord
 * following a committed one still voice-leads from what was actually heard.
 */
export function eventVoicing(
  event: Pick<ChordEvent, 'chord' | 'attachments'>,
  instrument: InstrumentId,
  prev: number[] | null,
): number[] {
  const committed = event.attachments?.guitar;
  if (instrument === 'guitar' && committed) {
    const notes = guitarVoicingNotes(committed);
    if (notes.length > 0) return notes;
  }
  return voiceLeadChord(event.chord, prev);
}
