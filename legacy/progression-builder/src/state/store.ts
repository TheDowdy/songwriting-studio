import { Interval } from 'tonal';
import { create } from 'zustand';
import { relabel, transposeChord } from '../theory/chords';
import type { ChordRef, Key } from '../theory/types';
import type { InstrumentId, PatternId, Section, Song, TimeSig } from '../types';
import { loadInitialSong, setCurrentSongId } from './persistence';
import { findEvent, flattenSong, newEvent, newId, newSection, newSong as createSong, withSection } from './song';

export type KeyChangeMode = 'transpose' | 'relabel';

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const BEATS_MIN = 1;
export const BEATS_MAX = 32;

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

const touch = (song: Song): Song => ({ ...song, updatedAt: Date.now() });
const clampBeats = (n: number) => Math.max(BEATS_MIN, Math.min(BEATS_MAX, Math.round(n) || BEATS_MIN));

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (item === undefined) return arr;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

const initialSong = loadInitialSong();

export const useStore = create<AppState>((set) => ({
  song: initialSong,
  activeSectionId: initialSong.sections[0].id,
  selectedEventId: null,
  playingEventId: null,
  isPlaying: false,
  loop: true,
  loopScope: 'song',
  metronome: false,
  volume: 0.85,

  addChord: (chord) =>
    set((s) => {
      if (s.replaceTargetId) {
        const found = findEvent(s.song, s.replaceTargetId);
        if (found) {
          const { section, index } = found;
          const events = section.events.map((e, i) => (i === index ? { ...e, chord } : e));
          return { song: withSection(s.song, section.id, { ...section, events }), replaceTargetId: null };
        }
        return { replaceTargetId: null };
      }
      const active = s.song.sections.find((sec) => sec.id === s.activeSectionId) ?? s.song.sections[0];
      const event = newEvent(chord);
      // While playing, the map follows the audio, so new chords continue from what you hear.
      const base = s.isPlaying && s.playingEventId ? s.playingEventId : s.selectedEventId;
      const at = active.events.findIndex((e) => e.id === base);
      const events = [...active.events];
      events.splice(at < 0 ? events.length : at + 1, 0, event);
      const song = withSection(s.song, active.id, { ...active, events });
      return { song, selectedEventId: event.id, activeSectionId: active.id };
    }),

  duplicateEvent: (id) =>
    set((s) => {
      const found = findEvent(s.song, id);
      if (!found) return s;
      const { section, index } = found;
      const copy = { ...section.events[index], id: newId() };
      const events = [...section.events.slice(0, index + 1), copy, ...section.events.slice(index + 1)];
      return { song: withSection(s.song, section.id, { ...section, events }), selectedEventId: copy.id };
    }),

  removeEvent: (id) =>
    set((s) => {
      const found = findEvent(s.song, id);
      if (!found) return s;
      const { section, index } = found;
      const events = section.events.filter((e) => e.id !== id);
      const selected =
        s.selectedEventId === id ? (events[Math.min(index, events.length - 1)]?.id ?? null) : s.selectedEventId;
      const song = withSection(s.song, section.id, { ...section, events });
      return { song, selectedEventId: selected };
    }),

  setEventChord: (id, chord) =>
    set((s) => {
      const found = findEvent(s.song, id);
      if (!found) return s;
      const { section, index } = found;
      const events = section.events.map((e, i) => (i === index ? { ...e, chord } : e));
      return { song: withSection(s.song, section.id, { ...section, events }) };
    }),

  setEventBeats: (id, beats) =>
    set((s) => {
      const found = findEvent(s.song, id);
      if (!found) return s;
      const { section, index } = found;
      const events = section.events.map((e, i) => (i === index ? { ...e, beats: clampBeats(beats) } : e));
      return { song: withSection(s.song, section.id, { ...section, events }) };
    }),

  adjustEventBeats: (id, delta) =>
    set((s) => {
      const found = findEvent(s.song, id);
      if (!found) return s;
      const { section, index } = found;
      const events = section.events.map((e, i) =>
        i === index ? { ...e, beats: clampBeats(e.beats + delta) } : e,
      );
      return { song: withSection(s.song, section.id, { ...section, events }) };
    }),

  reorderEvents: (sectionId, fromIndex, toIndex) =>
    set((s) => {
      const section = s.song.sections.find((sec) => sec.id === sectionId);
      if (!section) return s;
      const events = move(section.events, fromIndex, toIndex);
      return { song: withSection(s.song, sectionId, { ...section, events }) };
    }),

  moveEvent: (eventId, toSectionId, toIndex) =>
    set((s) => {
      const found = findEvent(s.song, eventId);
      const to = s.song.sections.find((sec) => sec.id === toSectionId);
      if (!found || !to) return s;
      const event = found.section.events[found.index];
      const fromEvents = found.section.events.filter((e) => e.id !== eventId);
      let song = withSection(s.song, found.section.id, { ...found.section, events: fromEvents });
      const toSection = (found.section.id === toSectionId ? { ...found.section, events: fromEvents } : to);
      const toEvents = [...toSection.events];
      toEvents.splice(Math.max(0, Math.min(toIndex, toEvents.length)), 0, event);
      song = withSection(song, toSectionId, { ...toSection, events: toEvents });
      return { song, activeSectionId: toSectionId };
    }),

  clearSection: (sectionId) =>
    set((s) => {
      const section = s.song.sections.find((sec) => sec.id === sectionId);
      if (!section) return s;
      const song = withSection(s.song, sectionId, { ...section, events: [] });
      const selected = section.events.some((e) => e.id === s.selectedEventId) ? null : s.selectedEventId;
      return { song, selectedEventId: selected };
    }),

  selectEvent: (id) =>
    set((s) => {
      const found = id ? findEvent(s.song, id) : null;
      return { selectedEventId: id, activeSectionId: found ? found.section.id : s.activeSectionId };
    }),

  replaceTargetId: null,
  chordDetailOpen: false,
  setChordDetailOpen: (chordDetailOpen) => set({ chordDetailOpen }),
  startReplace: (id) => set({ replaceTargetId: id, selectedEventId: id }),
  cancelReplace: () => set({ replaceTargetId: null }),

  addSection: (name) =>
    set((s) => {
      const section = newSection(name ?? `Section ${s.song.sections.length + 1}`);
      const song = touch({ ...s.song, sections: [...s.song.sections, section], arrangement: [...s.song.arrangement, section.id] });
      return { song, activeSectionId: section.id };
    }),

  renameSection: (id, name) =>
    set((s) => {
      const section = s.song.sections.find((sec) => sec.id === id);
      if (!section) return s;
      return { song: withSection(s.song, id, { ...section, name: name.trim() || section.name }) };
    }),

  duplicateSection: (id) =>
    set((s) => {
      const at = s.song.sections.findIndex((sec) => sec.id === id);
      if (at < 0) return s;
      const source = s.song.sections[at];
      const clone: Section = {
        ...source,
        id: newId(),
        name: `${source.name} copy`,
        events: source.events.map((e) => ({ ...e, id: newId() })),
      };
      const sections = [...s.song.sections.slice(0, at + 1), clone, ...s.song.sections.slice(at + 1)];
      // The copy must be in the arrangement or it never plays: put it right after its source.
      const arrangement = [...s.song.arrangement];
      const inArr = arrangement.indexOf(id);
      arrangement.splice(inArr < 0 ? arrangement.length : inArr + 1, 0, clone.id);
      return { song: touch({ ...s.song, sections, arrangement }), activeSectionId: clone.id };
    }),

  removeSection: (id) =>
    set((s) => {
      if (s.song.sections.length <= 1) return s;
      const sections = s.song.sections.filter((sec) => sec.id !== id);
      const arrangement = s.song.arrangement.filter((sid) => sid !== id);
      const song = touch({ ...s.song, sections, arrangement: arrangement.length ? arrangement : [sections[0].id] });
      const activeSectionId = s.activeSectionId === id ? sections[0].id : s.activeSectionId;
      const removedIds = new Set(s.song.sections.find((sec) => sec.id === id)?.events.map((e) => e.id));
      const selectedEventId = s.selectedEventId && removedIds.has(s.selectedEventId) ? null : s.selectedEventId;
      return { song, activeSectionId, selectedEventId };
    }),

  setSectionRepeat: (id, repeat) =>
    set((s) => {
      const section = s.song.sections.find((sec) => sec.id === id);
      if (!section) return s;
      return { song: withSection(s.song, id, { ...section, repeat: Math.max(1, Math.min(16, Math.round(repeat) || 1)) }) };
    }),

  reorderSections: (fromIndex, toIndex) =>
    set((s) => ({ song: touch({ ...s.song, sections: move(s.song.sections, fromIndex, toIndex) }) })),

  setActiveSection: (id) => set({ activeSectionId: id }),

  setArrangement: (arrangement) => set((s) => ({ song: touch({ ...s.song, arrangement }) })),
  addArrangementSlot: (sectionId) => set((s) => ({ song: touch({ ...s.song, arrangement: [...s.song.arrangement, sectionId] }) })),
  removeArrangementSlot: (index) =>
    set((s) => {
      if (s.song.arrangement.length <= 1) return s;
      return { song: touch({ ...s.song, arrangement: s.song.arrangement.filter((_, i) => i !== index) }) };
    }),
  reorderArrangement: (fromIndex, toIndex) =>
    set((s) => ({ song: touch({ ...s.song, arrangement: move(s.song.arrangement, fromIndex, toIndex) }) })),

  changeKey: (key, how) =>
    set((s) => {
      const shift = how === 'transpose' ? Interval.distance(s.song.key.tonic, key.tonic) : null;
      const sections = s.song.sections.map((section) => ({
        ...section,
        events: section.events.map((e) => ({
          ...e,
          chord: shift ? transposeChord(e.chord, shift, key) : relabel(e.chord, key),
        })),
      }));
      return { song: touch({ ...s.song, key, sections }) };
    }),

  setBpm: (bpm) =>
    set((s) => ({ song: touch({ ...s.song, bpm: Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm) || s.song.bpm)) }) })),
  setTimeSig: (timeSig) => set((s) => ({ song: touch({ ...s.song, timeSig }) })),
  setInstrument: (instrument) => set((s) => ({ song: touch({ ...s.song, instrument }) })),
  setPattern: (pattern) => set((s) => ({ song: touch({ ...s.song, pattern }) })),
  setLoop: (loop) => set({ loop }),
  setLoopScope: (loopScope) => set({ loopScope }),
  setMetronome: (metronome) => set({ metronome }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  setPlaying: (isPlaying) => set(isPlaying ? { isPlaying } : { isPlaying, playingEventId: null }),
  setPlayingEvent: (id) => set({ playingEventId: id }),

  setTitle: (title) => set((s) => ({ song: touch({ ...s.song, title }) })),
  loadSong: (song) => {
    setCurrentSongId(song.id);
    set({
      song,
      activeSectionId: song.sections[0]?.id ?? newSection().id,
      selectedEventId: null,
      playingEventId: null,
      isPlaying: false,
      replaceTargetId: null,
    });
  },
  newSong: () => {
    const song = createSong();
    setCurrentSongId(song.id);
    set({
      song,
      activeSectionId: song.sections[0].id,
      selectedEventId: null,
      playingEventId: null,
      isPlaying: false,
      replaceTargetId: null,
    });
  },
}));

/**
 * The chord at the centre of the map (the sounding chord during playback, otherwise the selected
 * slot), with the chords before it. `chord` is null when nothing is selected: show the start ring.
 */
export function selectCenter(
  s: Pick<AppState, 'song' | 'selectedEventId' | 'playingEventId' | 'isPlaying'>,
): { chord: ChordRef | null; previous: ChordRef[] } {
  const events = flattenSong(s.song);
  const id = s.isPlaying && s.playingEventId ? s.playingEventId : s.selectedEventId;
  const at = events.findIndex((e) => e.id === id);
  if (at < 0) return { chord: null, previous: [] };
  return { chord: events[at].chord, previous: events.slice(0, at).map((e) => e.chord) };
}
