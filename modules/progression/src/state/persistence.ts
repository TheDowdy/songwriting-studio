/**
 * PB's original save/load API (§7 Phase 1), now backed by `@sw/song-store` instead of hand-rolled
 * `localStorage` access. Kept as a thin wrapper so `SongPanel.tsx`/`export/json.ts` (and any other
 * consumer) don't need to change: same function names, same signatures, same behaviour.
 *
 * The song-store handles its own debounced autosave (to `sw:songs`/`sw:currentId`) and imports
 * PB's legacy songs (`chordbuilder:songs`/`chordbuilder:currentId`) on first run, so `useAutosave`
 * below is now a no-op kept only so `App.tsx` doesn't need touching.
 */
import { songStore } from '@sw/song-store';
import type { Song } from '@sw/core';

export interface SongMeta {
  id: string;
  title: string;
  updatedAt: number;
}

/** All saved songs, keyed by id. */
export function loadAllSongs(): Record<string, Song> {
  return songStore.getState().library;
}

export function listSongs(): SongMeta[] {
  return songStore.getState().listSongs();
}

/** Upserts `song` into the library without switching which song is open. */
export function saveSongToStorage(song: Song): void {
  songStore.getState().saveSong(song);
}

export function deleteSongFromStorage(id: string): void {
  songStore.getState().deleteSong(id);
}

export function getSongFromStorage(id: string): Song | null {
  return songStore.getState().library[id] ?? null;
}

export function setCurrentSongId(id: string): void {
  songStore.getState().loadSong(id);
}

/** The song to open on load: whichever one the store already opened (its own storage/legacy
 *  import logic ran at module load), or a fresh song if that somehow came back empty. */
export function loadInitialSong(): Song {
  return songStore.getState().currentSong() ?? songStore.getState().library[songStore.getState().newSong()]!;
}

/** Minimal structural check for an imported JSON file — enough to catch "not a song" without
 *  re-validating every field (`migrateSong`, run when it's actually opened, sanitises the rest). */
export function isSongLike(value: unknown): value is Song {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.title === 'string' &&
    typeof s.key === 'object' &&
    Array.isArray(s.sections) &&
    Array.isArray(s.arrangement)
  );
}

/** No-op: the song-store autosaves itself. Kept so `App.tsx` doesn't need to change. */
export function useAutosave(): void {
  // intentionally empty
}
