import { useEffect } from 'react';
import { renderPattern } from '../audio/patterns';
import { previewStrikes, startPlayback, stopPlayback, updatePlayback, type NoteStrike, type PlaybackOptions } from '../audio/engine';
import { eventVoicing, flattenDetailed, sectionLoopBounds } from '@sw/core';
import type { ChordEvent, ChordRef, Song } from '@sw/core';
import { useStore } from './store';

/** The full note-strike list for the song: each chord voice-led from the one before it — or, on
 *  the guitar instrument, its committed voicing's actual notes (Phase 5 item 3) — then expanded
 *  into its pattern's strikes (block/pulse/strum/arpeggio/bass+chord). */
export function toNoteStrikes(song: Song): NoteStrike[] {
  const strikes: NoteStrike[] = [];
  let prevVoicing: number[] | null = null;
  for (const { event, offsetBeats } of flattenDetailed(song)) {
    const voicing = eventVoicing(event, song.instrument, prevVoicing);
    prevVoicing = voicing;
    const upperCount = voicing.length - 1;
    const strikesForChord = renderPattern(song.pattern, upperCount, event.beats, song.timeSig);
    strikesForChord.forEach((s, i) => {
      strikes.push({
        eventId: event.id,
        isChordStart: i === 0,
        offsetBeats: offsetBeats + s.offset,
        durationBeats: s.duration,
        midi: s.noteIndices.map((idx) => voicing[idx]).filter((n): n is number => n !== undefined),
        strumSeconds: s.strumSeconds,
        velocity: s.velocity,
      });
    });
  }
  return strikes;
}

/** Sound one chord the way the song will: the selected pattern, instrument and tempo, one bar
 *  long unless `beats` is given (e.g. a timeline chord's own length). A placed chord passes its
 *  `attachments` too, so on guitar it previews its committed voicing, as playback will. */
export function previewChordInSong(chord: ChordRef, beats?: number, attachments?: ChordEvent['attachments']): Promise<void> {
  const { song } = useStore.getState();
  const voicing = eventVoicing({ chord, attachments }, song.instrument, null);
  const strikes = renderPattern(song.pattern, voicing.length - 1, beats ?? song.timeSig.beats, song.timeSig).map((s) => ({
    eventId: '',
    isChordStart: false,
    offsetBeats: s.offset,
    durationBeats: s.duration,
    midi: s.noteIndices.map((idx) => voicing[idx]).filter((n): n is number => n !== undefined),
    strumSeconds: s.strumSeconds,
    velocity: s.velocity,
  }));
  return previewStrikes(strikes, song.instrument, song.bpm);
}

function playbackOptions(): Omit<PlaybackOptions, 'onEvent'> {
  const s = useStore.getState();
  const bounds =
    s.loopScope === 'section' ? sectionLoopBounds(s.song, s.activeSectionId) : null;
  return {
    bpm: s.song.bpm,
    loop: s.loop,
    loopStartBeats: bounds?.start,
    loopEndBeats: bounds?.end,
    instrument: s.song.instrument,
    metronome: s.metronome,
    barBeats: s.song.timeSig.beats,
    volume: s.volume,
  };
}

/** Start playing the song. Call from a click/tap handler so the browser allows audio. */
export async function play(): Promise<void> {
  const { song, setPlaying, setPlayingEvent } = useStore.getState();
  const strikes = toNoteStrikes(song);
  if (strikes.length === 0) return;
  setPlaying(true);
  await startPlayback(strikes, {
    ...playbackOptions(),
    onEvent: (id) => (id === null ? setPlaying(false) : setPlayingEvent(id)),
  });
}

export function stop(): void {
  stopPlayback();
  useStore.getState().setPlaying(false);
}

export function togglePlay(): void {
  if (useStore.getState().isPlaying) stop();
  else void play();
}

/** While playing, push edits, tempo, loop, instrument and pattern changes into the running transport. */
export function useLivePlaybackSync(): void {
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (!s.isPlaying) return;
        const relevant =
          s.song.sections !== prev.song.sections ||
          s.song.arrangement !== prev.song.arrangement ||
          s.song.bpm !== prev.song.bpm ||
          s.song.timeSig !== prev.song.timeSig ||
          s.song.instrument !== prev.song.instrument ||
          s.song.pattern !== prev.song.pattern ||
          s.loop !== prev.loop ||
          s.loopScope !== prev.loopScope ||
          s.metronome !== prev.metronome ||
          s.volume !== prev.volume;
        if (!relevant) return;
        updatePlayback(toNoteStrikes(s.song), { ...playbackOptions(), onEvent: () => {} });
      }),
    [],
  );
}
