/**
 * The notes a chord event sounds (Phase 5 item 3): with the guitar instrument and a committed
 * voicing, exactly that shape as the player committed it (its own tuning + capo + frets); with
 * anything else, `voiceLeadChord`'s smooth piano-style voicing. Playback, MIDI export and the
 * sheet music all go through this so they agree on what you hear.
 */
import { capoedTuning } from './fret/capo';
import { shapeNotes } from './fret/voicings';
import type { ChordEvent, GuitarVoicing, InstrumentId } from './schema';
import { voiceLeadChord } from './theory/voicings';

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
