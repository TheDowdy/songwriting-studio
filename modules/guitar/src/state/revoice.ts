/**
 * The re-voicing assistant (Phase 7 item 2): every committed voicing that no longer fits (after a
 * tuning or capo change, or a chord edit), with the best replacements in the song's setup now, and
 * "Re-voice all" choosing the smoothest set through each section. Both record an undo step.
 */
import { toChordSpec, voicingStatus, type ChordEvent, type GuitarVoicing, type Song } from '@sw/core';
import type { AccidentalPref } from '@sw/core/fret/notes';
import {
  indexOfShape,
  revoiceCandidates,
  shapeDistance,
  shiftCapo,
  smoothestChoice,
  type Voicing,
  type VoicingRules,
} from '@sw/core/fret/voicings';
import { songStore } from '@sw/song-store';
import { defaultBassMode } from './bassMode';
import { chordContext, chordContextFor } from './chordActions';
import { useStore } from './store';
import { recordUndo } from './undoRecord';

/** How many candidates the panel shows per chord, and how many "Re-voice all" weighs. */
export const SHOWN_CANDIDATES = 3;
const SMOOTHING_CANDIDATES = 6;
/** How much moving between neighbouring shapes counts against a "Re-voice all" choice, against
 *  each shape's own fit to its old voicing. */
const TRANSITION_WEIGHT = 0.5;

export interface FlaggedChord {
  event: ChordEvent;
  voicing: GuitarVoicing;
  candidates: { voicing: Voicing; cost: number }[];
}

/** The Chords tab settings the search uses (the store's, unless a caller passes its own). */
export interface SearchSettings {
  accidentalPref: AccidentalPref;
  voicingRules: VoicingRules;
  fretCount: number;
}

/** The chord's voicings in the song's setup now, respecting its own inversion — exactly what the
 *  Chords tab would offer for it. */
function searchFor(event: ChordEvent, song: Song, s: SearchSettings): Voicing[] {
  return chordContextFor({
    chordSpec: toChordSpec(event.chord),
    accidentalPref: s.accidentalPref,
    tuningStrings: song.guitar.tuning,
    fretCount: s.fretCount,
    voicingRules: s.voicingRules,
    capo: song.guitar.capo,
    songId: song.id,
    progressionChord: event.chord,
    bassMode: defaultBassMode(event.chord),
  }).voicings;
}

function candidatesFor(event: ChordEvent, voicing: GuitarVoicing, song: Song, count: number, s: SearchSettings) {
  return revoiceCandidates(voicing.frets, voicing.capo, searchFor(event, song, s), song.guitar.capo, count);
}

/** Every committed voicing that no longer fits, in song order (each chord once). */
export function flaggedChords(
  song: Song,
  count = SHOWN_CANDIDATES,
  settings: SearchSettings = useStore.getState(),
): FlaggedChord[] {
  const out: FlaggedChord[] = [];
  for (const section of song.sections) {
    for (const event of section.events) {
      const voicing = event.attachments?.guitar;
      if (!voicing || voicingStatus(event, song) === 'ok') continue;
      out.push({ event, voicing, candidates: candidatesFor(event, voicing, song, count, settings) });
    }
  }
  return out;
}

function commitShape(song: Song, eventId: string, frets: readonly (number | null)[]): void {
  songStore.getState().commitVoicing(eventId, {
    frets: frets.slice(),
    tuning: song.guitar.tuning.slice(),
    capo: song.guitar.capo,
    source: 'picked',
  });
  // If that chord is on the neck, show its new shape.
  if (useStore.getState().progressionEventId === eventId) {
    const index = indexOfShape(chordContext().voicings, frets);
    useStore.getState().setChordShape(frets.slice(), index >= 0 ? index : null);
  }
}

/** Commits one candidate (a tap in the re-voice panel). */
export function revoiceWith(eventId: string, frets: readonly (number | null)[]): void {
  const song = songStore.getState().currentSong();
  if (!song) return;
  recordUndo('Re-voice');
  commitShape(song, eventId, frets);
}

/**
 * Re-voices every flagged chord at once, section by section, choosing the smoothest set: each
 * chord's candidates weighed by their fit to its old voicing plus how far the hand moves from the
 * chord before (committed chords that still fit count as fixed points; uncommitted ones are left
 * out). Returns how many chords it re-voiced.
 */
export function revoiceAll(): number {
  const song = songStore.getState().currentSong();
  if (!song) return 0;
  const flagged = new Map(flaggedChords(song, SMOOTHING_CANDIDATES).map((f) => [f.event.id, f]));
  if (flagged.size === 0) return 0;
  recordUndo('Re-voice all');
  const capo = song.guitar.capo;
  for (const section of song.sections) {
    const options = section.events.map((event) => {
      const f = flagged.get(event.id);
      if (f) return f.candidates.map((c) => ({ item: c.voicing.frets, cost: c.cost }));
      const v = event.attachments?.guitar;
      return v ? [{ item: shiftCapo(v.frets, v.capo, capo), cost: 0 }] : [];
    });
    const picks = smoothestChoice(options, (a, b) => TRANSITION_WEIGHT * shapeDistance(a, b));
    section.events.forEach((event, i) => {
      const pick = picks[i] as number;
      if (!flagged.has(event.id) || pick < 0) return;
      commitShape(song, event.id, (options[i] as { item: (number | null)[] }[])[pick]!.item);
    });
  }
  return flagged.size;
}
