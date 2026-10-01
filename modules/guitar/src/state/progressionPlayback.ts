/**
 * Playing the song (or one section) inside the guitar module (Phase 6 item 2): each chord strummed
 * through the guitar synth — its committed voicing, or the shape the neck would suggest for it —
 * at the song's tempo, optionally looping, with the neck following the chord you hear.
 */
import { findEvent, flattenSong, playbackRange, toChordSpec, type ChordEvent, type Song } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { shapeNotes } from '@sw/core/fret/voicings';
import { songStore } from '@sw/song-store';
import { ProgressionPlayer, type ProgressionStrike } from '../audio/progressionPlayer';
import { defaultBassMode } from './bassMode';
import { chordContextFor, stopChordPlayback } from './chordActions';
import { emitPluck } from './pluckEvents';
import { selectProgressionEvent } from './progressionChordActions';
import { useStore } from './store';

const player = new ProgressionPlayer();

/** The notes one chord plays, low string first: its committed voicing exactly as committed, or the
 *  best shape under the current rules — the same one the neck shows when that chord is focused. */
export function chordNotes(event: ChordEvent, song: Song): { string: number; fret: number; midi: number }[] {
  const committed = event.attachments?.guitar;
  if (committed) return shapeNotes(capoedTuning(committed.tuning, committed.capo), committed.frets);
  const s = useStore.getState();
  const { voicings, best } = chordContextFor({
    chordSpec: toChordSpec(event.chord),
    accidentalPref: s.accidentalPref,
    tuningStrings: song.guitar.tuning,
    fretCount: s.fretCount,
    voicingRules: s.voicingRules,
    capo: song.guitar.capo,
    songId: song.id,
    progressionChord: event.chord,
    bassMode: defaultBassMode(event.chord),
  });
  const shape = voicings[best];
  return shape ? shapeNotes(capoedTuning(song.guitar.tuning, song.guitar.capo), shape.frets) : [];
}

/** Every strum in the range: one at each chord's start, and again at each bar line it spans
 *  (a softer restrike), so a long chord keeps sounding. */
export function progressionStrikes(song: Song, sectionId: string | null): { strikes: ProgressionStrike[]; lengthSeconds: number } {
  const secondsPerBeat = 60 / song.bpm;
  const { events, lengthBeats } = playbackRange(song, sectionId);
  const strikes: ProgressionStrike[] = [];
  const barBeats = Math.max(1, song.timeSig.beats);
  for (const { event, startBeats } of events) {
    const notes = chordNotes(event, song);
    if (notes.length === 0) continue;
    for (let beat = 0; beat < event.beats; beat += barBeats) {
      strikes.push({
        atSeconds: (startBeats + beat) * secondsPerBeat,
        eventId: event.id,
        notes,
        velocity: beat === 0 ? 0.8 : 0.6,
      });
    }
  }
  return { strikes, lengthSeconds: lengthBeats * secondsPerBeat };
}

/** Plays the whole song, or the section of the focused chord (the first section if none is). */
export function playProgression(scope: 'song' | 'section'): void {
  const song = songStore.getState().currentSong();
  if (!song) return;
  const state = useStore.getState();
  let sectionId: string | null = null;
  if (scope === 'section') {
    const focused = state.progressionEventId ? findEvent(song, state.progressionEventId) : null;
    sectionId = focused?.section.id ?? song.arrangement[0] ?? null;
  }
  const { strikes, lengthSeconds } = progressionStrikes(song, sectionId);
  stopChordPlayback();
  state.setProgressionPlaying(true);
  player.start(strikes, lengthSeconds, state.chordPlay.speedMs / 1000, state.progressionLoop, {
    onChord: (eventId) => selectProgressionEvent(eventId),
    onNote: (n) => emitPluck(n),
    onEnd: () => useStore.getState().setProgressionPlaying(false),
  });
}

export function stopProgression(): void {
  player.stop();
  useStore.getState().setProgressionPlaying(false);
}

/** Starts the whole progression, or stops it if it is playing (the space bar). Nothing without a song with chords. */
export function toggleProgressionPlayback(): void {
  if (useStore.getState().progressionPlaying) {
    stopProgression();
    return;
  }
  const song = songStore.getState().currentSong();
  if (song && flattenSong(song).length > 0) playProgression('song');
}
