/**
 * PB's UI-only store (§7 Phase 1): selection, playback, replace target, the piano/guitar panel's
 * open state. Every song *data* mutation now lives in `@sw/song-store`, wrapped here so every
 * action keeps its original name and signature — no component needs to change. `song` mirrors
 * the song-store's current song (subscribed once below), so `useStore((s) => s.song)` still works
 * exactly as before.
 */
import { create } from 'zustand';
import * as core from '@sw/core';
import type { ChordRef, InstrumentId, Key, PatternId, Song, TimeSig } from '@sw/core';
import { songStore } from '@sw/song-store';

export type KeyChangeMode = core.KeyChangeMode;

export const BPM_MIN = core.BPM_MIN;
export const BPM_MAX = core.BPM_MAX;
export const BEATS_MIN = core.BEATS_MIN;
export const BEATS_MAX = core.BEATS_MAX;

interface AppState {
  song: Song;
  /** Which section new chords are added to. */
  activeSectionId: string;
  /** The chord slot whose chord is the map's centre; new chords insert after it. */
  selectedEventId: string | null;
  /** The chord slot currently sounding during playback. */
  playingEventId: string | null;
  isPlaying: boolean;
  loop: boolean;
  /** Loop the whole song, or just the section the selected/playing chord is in. */
  loopScope: 'song' | 'section';
  metronome: boolean;
  /** 0–1. */
  volume: number;

  addChord: (chord: ChordRef) => void;
  removeEvent: (id: string) => void;
  /** Insert a copy of a chord block right after it and select the copy. */
  duplicateEvent: (id: string) => void;
  /** Replace a placed event's chord in place (flavor, inversion, or an entirely different chord). */
  setEventChord: (id: string, chord: ChordRef) => void;
  setEventBeats: (id: string, beats: number) => void;
  /** Like setEventBeats, but relative to the event's current beats at update time — safe to call
   *  from rapid repeated clicks, unlike `setEventBeats(id, event.beats + delta)` from a stale prop. */
  adjustEventBeats: (id: string, delta: number) => void;
  reorderEvents: (sectionId: string, fromIndex: number, toIndex: number) => void;
  moveEvent: (eventId: string, toSectionId: string, toIndex: number) => void;
  clearSection: (sectionId: string) => void;
  selectEvent: (id: string | null) => void;
  /** Armed by the timeline's "replace" control: the next chord added from the map replaces this
   *  event instead of inserting after it. */
  replaceTargetId: string | null;
  /** The piano/guitar panel under the timeline stays open as different chords are selected. */
  chordDetailOpen: boolean;
  setChordDetailOpen: (open: boolean) => void;
  startReplace: (id: string) => void;
  cancelReplace: () => void;

  addSection: (name?: string) => void;
  renameSection: (id: string, name: string) => void;
  duplicateSection: (id: string) => void;
  removeSection: (id: string) => void;
  setSectionRepeat: (id: string, repeat: number) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;
  setActiveSection: (id: string) => void;

  setArrangement: (arrangement: string[]) => void;
  addArrangementSlot: (sectionId: string) => void;
  removeArrangementSlot: (index: number) => void;
  reorderArrangement: (fromIndex: number, toIndex: number) => void;

  changeKey: (key: Key, how: KeyChangeMode) => void;
  setBpm: (bpm: number) => void;
  setTimeSig: (timeSig: TimeSig) => void;
  setInstrument: (instrument: InstrumentId) => void;
  setPattern: (pattern: PatternId) => void;
  setLoop: (loop: boolean) => void;
  setLoopScope: (scope: 'song' | 'section') => void;
  setMetronome: (on: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setPlayingEvent: (id: string | null) => void;

  setTitle: (title: string) => void;
  /** Replace the whole song (open a saved song, import JSON, or start a new one) and reset the
   *  editor selection, which otherwise could point at an event id from the old song. */
  loadSong: (song: Song) => void;
  newSong: () => void;
}

const clampVolume = (n: number) => Math.max(0, Math.min(1, n));

const resetSelection = {
  selectedEventId: null as string | null,
  playingEventId: null as string | null,
  isPlaying: false,
  replaceTargetId: null as string | null,
};

const initialSong = songStore.getState().currentSong() ?? core.newSong();

export const useStore = create<AppState>((set, get) => {
  // Keeps `song` mirroring the song-store's current song, so every existing
  // `useStore((s) => s.song)` call site keeps working unchanged.
  songStore.subscribe((s) => {
    const song = s.currentSong();
    if (song && song !== get().song) set({ song });
  });

  return {
    song: initialSong,
    activeSectionId: initialSong.sections[0]!.id,
    selectedEventId: null,
    playingEventId: null,
    isPlaying: false,
    loop: true,
    loopScope: 'song',
    metronome: false,
    volume: 0.85,

    addChord: (chord) => {
      const s = get();
      if (s.replaceTargetId) {
        songStore.getState().setEventChord(s.replaceTargetId, chord);
        set({ replaceTargetId: null });
        return;
      }
      const active = s.song.sections.find((sec) => sec.id === s.activeSectionId) ?? s.song.sections[0]!;
      // While playing, the map follows the audio, so new chords continue from what you hear.
      const base = s.isPlaying && s.playingEventId ? s.playingEventId : s.selectedEventId;
      const eventId = songStore.getState().addChord(active.id, base, chord);
      set({ selectedEventId: eventId, activeSectionId: active.id });
    },

    duplicateEvent: (id) => {
      const eventId = songStore.getState().duplicateEvent(id);
      if (eventId) set({ selectedEventId: eventId });
    },

    removeEvent: (id) => {
      const s = get();
      const found = core.findEvent(s.song, id);
      if (!found) return;
      const { section, index } = found;
      songStore.getState().removeEvent(id);
      const events = section.events.filter((e) => e.id !== id);
      const selected = s.selectedEventId === id ? (events[Math.min(index, events.length - 1)]?.id ?? null) : s.selectedEventId;
      set({ selectedEventId: selected });
    },

    setEventChord: (id, chord) => songStore.getState().setEventChord(id, chord),
    setEventBeats: (id, beats) => songStore.getState().setEventBeats(id, beats),
    adjustEventBeats: (id, delta) => songStore.getState().adjustEventBeats(id, delta),
    reorderEvents: (sectionId, fromIndex, toIndex) => songStore.getState().reorderEvents(sectionId, fromIndex, toIndex),
    moveEvent: (eventId, toSectionId, toIndex) => {
      songStore.getState().moveEvent(eventId, toSectionId, toIndex);
      set({ activeSectionId: toSectionId });
    },
    clearSection: (sectionId) => {
      const s = get();
      const section = s.song.sections.find((sec) => sec.id === sectionId);
      songStore.getState().clearSection(sectionId);
      const selected = section?.events.some((e) => e.id === s.selectedEventId) ? null : s.selectedEventId;
      set({ selectedEventId: selected });
    },

    selectEvent: (id) =>
      set((s) => {
        const found = id ? core.findEvent(s.song, id) : null;
        return { selectedEventId: id, activeSectionId: found ? found.section.id : s.activeSectionId };
      }),

    replaceTargetId: null,
    chordDetailOpen: false,
    setChordDetailOpen: (chordDetailOpen) => set({ chordDetailOpen }),
    startReplace: (id) => set({ replaceTargetId: id, selectedEventId: id }),
    cancelReplace: () => set({ replaceTargetId: null }),

    addSection: (name) => {
      const sectionId = songStore.getState().addSection(name);
      set({ activeSectionId: sectionId });
    },
    renameSection: (id, name) => songStore.getState().renameSection(id, name),
    duplicateSection: (id) => {
      const sectionId = songStore.getState().duplicateSection(id);
      if (sectionId) set({ activeSectionId: sectionId });
    },
    removeSection: (id) => {
      const s = get();
      const removedIds = new Set(s.song.sections.find((sec) => sec.id === id)?.events.map((e) => e.id));
      songStore.getState().removeSection(id);
      const song = songStore.getState().currentSong() ?? s.song;
      const activeSectionId = s.activeSectionId === id ? song.sections[0]!.id : s.activeSectionId;
      const selectedEventId = s.selectedEventId && removedIds.has(s.selectedEventId) ? null : s.selectedEventId;
      set({ activeSectionId, selectedEventId });
    },
    setSectionRepeat: (id, repeat) => songStore.getState().setSectionRepeat(id, repeat),
    reorderSections: (fromIndex, toIndex) => songStore.getState().reorderSections(fromIndex, toIndex),
    setActiveSection: (id) => set({ activeSectionId: id }),

    setArrangement: (arrangement) => songStore.getState().setArrangement(arrangement),
    addArrangementSlot: (sectionId) => songStore.getState().addArrangementSlot(sectionId),
    removeArrangementSlot: (index) => songStore.getState().removeArrangementSlot(index),
    reorderArrangement: (fromIndex, toIndex) => songStore.getState().reorderArrangement(fromIndex, toIndex),

    changeKey: (key, how) => songStore.getState().changeKey(key, how),
    setBpm: (bpm) => songStore.getState().setBpm(bpm),
    setTimeSig: (timeSig) => songStore.getState().setTimeSig(timeSig),
    setInstrument: (instrument) => songStore.getState().setInstrument(instrument),
    setPattern: (pattern) => songStore.getState().setPattern(pattern),
    setLoop: (loop) => set({ loop }),
    setLoopScope: (loopScope) => set({ loopScope }),
    setMetronome: (metronome) => set({ metronome }),
    setVolume: (volume) => set({ volume: clampVolume(volume) }),
    setPlaying: (isPlaying) => set(isPlaying ? { isPlaying } : { isPlaying, playingEventId: null }),
    setPlayingEvent: (id) => set({ playingEventId: id }),

    setTitle: (title) => songStore.getState().setTitle(title),
    loadSong: (song) => {
      songStore.getState().importSong(song);
      set({ ...resetSelection, activeSectionId: song.sections[0]!.id });
    },
    newSong: () => {
      songStore.getState().newSong();
      const song = songStore.getState().currentSong()!;
      set({ ...resetSelection, activeSectionId: song.sections[0]!.id });
    },
  };
});

/**
 * The chord at the centre of the map (the sounding chord during playback, otherwise the selected
 * slot), with the chords before it. `chord` is null when nothing is selected: show the start ring.
 */
export function selectCenter(
  s: Pick<AppState, 'song' | 'selectedEventId' | 'playingEventId' | 'isPlaying'>,
): { chord: ChordRef | null; previous: ChordRef[] } {
  const events = core.flattenSong(s.song);
  const id = s.isPlaying && s.playingEventId ? s.playingEventId : s.selectedEventId;
  const at = events.findIndex((e) => e.id === id);
  if (at < 0) return { chord: null, previous: [] };
  return { chord: events[at]!.chord, previous: events.slice(0, at).map((e) => e.chord) };
}
