/**
 * The song library store (§7 Phase 1): a vanilla Zustand store (no React) holding every saved
 * song and which one is open, plus every pure song operation from `@sw/core` wrapped to apply to
 * "the current song". Debounced-autosaves to `localStorage` under `sw:songs`/`sw:currentId`. On
 * first run (no `sw:songs` yet) it imports PB's legacy songs from `chordbuilder:songs`/
 * `chordbuilder:currentId` through `migrateSong` — storage is untrusted either way (§8).
 *
 * React components use the `useSong` hook from `./react` instead of this module directly, so
 * this file itself stays framework-free.
 */
import { createStore } from 'zustand/vanilla';
import * as ops from '@sw/core';
import { migrateSong, type ChordAttachments, type GuitarVoicing, type Song, type VariantGeneratorId, type VariantOptions } from '@sw/core';
import type { ChordRef, Key } from '@sw/core';

const SONGS_KEY = 'sw:songs';
const CURRENT_KEY = 'sw:currentId';
const LEGACY_SONGS_KEY = 'chordbuilder:songs';
const LEGACY_CURRENT_KEY = 'chordbuilder:currentId';
const AUTOSAVE_MS = 800;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function safeGet(key: string): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode, quota exceeded, etc. — nothing to recover here
  }
}

function migrateLibrary(raw: unknown): Record<string, Song> {
  if (!raw || typeof raw !== 'object') return {};
  const library: Record<string, Song> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const song = migrateSong(value);
    if (song) library[id] = { ...song, id }; // key is the source of truth for id, as PB's was
  }
  return library;
}

function pickCurrentId(library: Record<string, Song>, storedId: string | null): string | null {
  if (storedId && library[storedId]) return storedId;
  const ids = Object.keys(library);
  if (ids.length === 0) return null;
  // Most recently updated first, matching PB's own song-list ordering.
  return ids.sort((a, b) => (library[b]?.updatedAt ?? 0) - (library[a]?.updatedAt ?? 0))[0] ?? null;
}

/** The library and current-song id to open with: `sw:songs` if present, else a one-time import
 *  of PB's legacy songs, else an empty library (the caller adds a fresh song). */
function loadInitial(): { library: Record<string, Song>; currentSongId: string | null } {
  const stored = safeGet(SONGS_KEY);
  if (stored !== null) {
    try {
      const library = migrateLibrary(JSON.parse(stored));
      return { library, currentSongId: pickCurrentId(library, safeGet(CURRENT_KEY)) };
    } catch {
      // fall through to legacy import / empty library
    }
  }
  const legacy = safeGet(LEGACY_SONGS_KEY);
  if (legacy !== null) {
    try {
      const library = migrateLibrary(JSON.parse(legacy));
      if (Object.keys(library).length > 0) {
        return { library, currentSongId: pickCurrentId(library, safeGet(LEGACY_CURRENT_KEY)) };
      }
    } catch {
      // fall through to empty library
    }
  }
  return { library: {}, currentSongId: null };
}

export interface SongLibraryEntry {
  id: string;
  title: string;
  updatedAt: number;
}

export interface SongStoreState {
  library: Record<string, Song>;
  currentSongId: string | null;
  /** The chord both modules treat as "the one in focus": what the Progression module's map is
   *  centred on and the guitar strip has selected. Not saved with the song. Whichever module changes
   *  the focus writes it here, and the other reads it when it opens. */
  focusedEventId: string | null;
  setFocusedEventId: (id: string | null) => void;

  /** The open song, or null if the library is somehow empty (shouldn't normally happen —
   *  `ensureCurrentSong` is called once at startup). */
  currentSong: () => Song | null;
  listSongs: () => SongLibraryEntry[];

  loadSong: (id: string) => void;
  newSong: (key?: Key) => string;
  deleteSong: (id: string) => void;
  /** Sanitises `raw` through `migrateSong` (JSON import — untrusted, §8) and opens it if valid. */
  importSong: (raw: unknown) => string | null;
  /** Upserts a song into the library (sanitised through `migrateSong`) without switching which
   *  one is open — for saving a background copy, or renaming one that isn't the current song. */
  saveSong: (song: Song) => void;

  // Pure song operations (`@sw/core`), applied to the current song. Each mirrors the core
  // function's signature minus the leading `song` argument.
  addChord: (sectionId: string, afterEventId: string | null, chord: ChordRef) => string;
  removeEvent: (eventId: string) => void;
  duplicateEvent: (eventId: string) => string;
  setEventChord: (eventId: string, chord: ChordRef) => void;
  setEventBeats: (eventId: string, beats: number) => void;
  adjustEventBeats: (eventId: string, delta: number) => void;
  reorderEvents: (sectionId: string, fromIndex: number, toIndex: number) => void;
  moveEvent: (eventId: string, toSectionId: string, toIndex: number) => void;
  clearSection: (sectionId: string) => void;

  addSection: (name?: string) => string;
  renameSection: (id: string, name: string) => void;
  duplicateSection: (id: string) => string;
  makeVariant: (id: string, label?: string) => string;
  /** Phase 8: a section copy voiced by one of the guitar generators, labelled from it. */
  makeVariantWithGenerator: (id: string, generator: VariantGeneratorId, options?: VariantOptions) => string;
  removeSection: (id: string) => void;
  setSectionRepeat: (id: string, repeat: number) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;

  setArrangement: (arrangement: string[]) => void;
  addArrangementSlot: (sectionId: string) => void;
  removeArrangementSlot: (index: number) => void;
  reorderArrangement: (fromIndex: number, toIndex: number) => void;

  changeKey: (key: Key, how: ops.KeyChangeMode) => void;
  setBpm: (bpm: number) => void;
  setTimeSig: (timeSig: Song['timeSig']) => void;
  setInstrument: (instrument: Song['instrument']) => void;
  setPattern: (pattern: Song['pattern']) => void;
  setTitle: (title: string) => void;

  commitVoicing: (eventId: string, voicing: GuitarVoicing) => void;
  clearVoicing: (eventId: string) => void;

  /** Sets the song's tuning (§7 Phase 3 item 4) — the guitar module's pegs and presets edit this
   *  in song context, never the tool's own persisted tuning. */
  setGuitarTuning: (tuning: readonly number[], tuningName?: string) => void;
  setGuitarCapo: (capo: number) => void;
}

const { library: initialLibrary, currentSongId: initialCurrentId } = loadInitial();
if (Object.keys(initialLibrary).length === 0) {
  const fresh = ops.newSong();
  initialLibrary[fresh.id] = fresh;
}
const startingId = initialCurrentId && initialLibrary[initialCurrentId] ? initialCurrentId : (Object.keys(initialLibrary)[0] as string);

/** Applies `fn` to the current song and writes the result back; `fn` may return just the new
 *  `Song`, or `{ song, ... }` (from operations that also hand back a fresh id), in which case the
 *  extra fields are returned from the wrapper action. */
function withCurrent<R = void>(
  set: (partial: Partial<SongStoreState>) => void,
  get: () => SongStoreState,
  fn: (song: Song) => Song | { song: Song },
  extract?: (result: { song: Song } & Record<string, unknown>) => R,
): R {
  const state = get();
  const song = state.currentSongId ? state.library[state.currentSongId] : undefined;
  // Unreachable in normal operation: the store always keeps `currentSongId` pointing at a real
  // song (see `loadInitial`/`newSong`). Do nothing rather than fabricate one here.
  if (!song) return undefined as R;
  const result = fn(song);
  const nextSong = 'schemaVersion' in result ? result : result.song;
  set({ library: { ...state.library, [nextSong.id]: nextSong } });
  return extract ? extract(result as { song: Song } & Record<string, unknown>) : (undefined as R);
}

export const songStore = createStore<SongStoreState>((set, get) => ({
  library: initialLibrary,
  currentSongId: startingId,
  focusedEventId: null,
  setFocusedEventId: (focusedEventId) => set({ focusedEventId }),

  currentSong: () => {
    const s = get();
    return s.currentSongId ? s.library[s.currentSongId] ?? null : null;
  },
  listSongs: () =>
    Object.values(get().library)
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt),

  loadSong: (id) => {
    if (get().library[id]) set({ currentSongId: id, focusedEventId: get().currentSongId === id ? get().focusedEventId : null });
  },
  newSong: (key) => {
    const song = ops.newSong(key);
    set((s) => ({ library: { ...s.library, [song.id]: song }, currentSongId: song.id, focusedEventId: null }));
    return song.id;
  },
  deleteSong: (id) => {
    set((s) => {
      const { [id]: _removed, ...rest } = s.library;
      void _removed;
      const currentSongId = s.currentSongId === id ? Object.keys(rest)[0] ?? null : s.currentSongId;
      return { library: rest, currentSongId };
    });
  },
  importSong: (raw) => {
    const song = migrateSong(raw);
    if (!song) return null;
    set((s) => ({ library: { ...s.library, [song.id]: song }, currentSongId: song.id }));
    return song.id;
  },
  saveSong: (song) => {
    const sanitized = migrateSong(song) ?? song;
    set((s) => ({ library: { ...s.library, [sanitized.id]: sanitized } }));
  },

  addChord: (sectionId, afterEventId, chord) =>
    withCurrent(set, get, (song) => ops.addChord(song, sectionId, afterEventId, chord), (r) => r.eventId as string),
  removeEvent: (eventId) => withCurrent(set, get, (song) => ops.removeEvent(song, eventId)),
  duplicateEvent: (eventId) =>
    withCurrent(set, get, (song) => ops.duplicateEvent(song, eventId), (r) => r.eventId as string),
  setEventChord: (eventId, chord) => withCurrent(set, get, (song) => ops.setEventChord(song, eventId, chord)),
  setEventBeats: (eventId, beats) => withCurrent(set, get, (song) => ops.setEventBeats(song, eventId, beats)),
  adjustEventBeats: (eventId, delta) => withCurrent(set, get, (song) => ops.adjustEventBeats(song, eventId, delta)),
  reorderEvents: (sectionId, fromIndex, toIndex) =>
    withCurrent(set, get, (song) => ops.reorderEvents(song, sectionId, fromIndex, toIndex)),
  moveEvent: (eventId, toSectionId, toIndex) =>
    withCurrent(set, get, (song) => ops.moveEvent(song, eventId, toSectionId, toIndex)),
  clearSection: (sectionId) => withCurrent(set, get, (song) => ops.clearSection(song, sectionId)),

  addSection: (name) => withCurrent(set, get, (song) => ops.addSection(song, name), (r) => r.sectionId as string),
  renameSection: (id, name) => withCurrent(set, get, (song) => ops.renameSection(song, id, name)),
  duplicateSection: (id) =>
    withCurrent(set, get, (song) => ops.duplicateSection(song, id), (r) => r.sectionId as string),
  makeVariant: (id, label) =>
    withCurrent(set, get, (song) => ops.makeVariant(song, id, label), (r) => r.sectionId as string),
  makeVariantWithGenerator: (id, generator, options) =>
    withCurrent(set, get, (song) => ops.makeVariantWithGenerator(song, id, generator, options), (r) => r.sectionId as string),
  removeSection: (id) => withCurrent(set, get, (song) => ops.removeSection(song, id)),
  setSectionRepeat: (id, repeat) => withCurrent(set, get, (song) => ops.setSectionRepeat(song, id, repeat)),
  reorderSections: (fromIndex, toIndex) => withCurrent(set, get, (song) => ops.reorderSections(song, fromIndex, toIndex)),

  setArrangement: (arrangement) => withCurrent(set, get, (song) => ops.setArrangement(song, arrangement)),
  addArrangementSlot: (sectionId) => withCurrent(set, get, (song) => ops.addArrangementSlot(song, sectionId)),
  removeArrangementSlot: (index) => withCurrent(set, get, (song) => ops.removeArrangementSlot(song, index)),
  reorderArrangement: (fromIndex, toIndex) => withCurrent(set, get, (song) => ops.reorderArrangement(song, fromIndex, toIndex)),

  changeKey: (key, how) => withCurrent(set, get, (song) => ops.changeKey(song, key, how)),
  setBpm: (bpm) => withCurrent(set, get, (song) => ops.setBpm(song, bpm)),
  setTimeSig: (timeSig) => withCurrent(set, get, (song) => ops.setTimeSig(song, timeSig)),
  setInstrument: (instrument) => withCurrent(set, get, (song) => ops.setInstrument(song, instrument)),
  setPattern: (pattern) => withCurrent(set, get, (song) => ops.setPattern(song, pattern)),
  setTitle: (title) => withCurrent(set, get, (song) => ops.setTitle(song, title)),

  commitVoicing: (eventId, voicing) => withCurrent(set, get, (song) => ops.commitVoicing(song, eventId, voicing)),
  clearVoicing: (eventId) => withCurrent(set, get, (song) => ops.clearVoicing(song, eventId)),

  setGuitarTuning: (tuning, tuningName) => withCurrent(set, get, (song) => ops.setGuitarTuning(song, tuning, tuningName)),
  setGuitarCapo: (capo) => withCurrent(set, get, (song) => ops.setGuitarCapo(song, capo)),
}));

// ------------------------------------------------------------------ autosave

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function persist(state: SongStoreState): void {
  safeSet(SONGS_KEY, JSON.stringify(state.library));
  if (state.currentSongId) safeSet(CURRENT_KEY, state.currentSongId);
}

if (hasLocalStorage()) {
  // `subscribe` only fires on *later* changes, but the very first state (a fresh legacy import,
  // or a brand-new song when the library was empty) is just as real — persist it immediately so
  // e.g. a legacy song survives a reload even before the user makes any edit.
  persist(songStore.getState());
  songStore.subscribe((state) => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => persist(state), AUTOSAVE_MS);
  });
}

// Re-export the attachment types callers commonly need alongside the store.
export type { ChordAttachments };
