import { useEffect, useRef } from 'react';
import type { Song } from '../types';
import { newSong } from './song';
import { useStore } from './store';

const SONGS_KEY = 'chordbuilder:songs';
const CURRENT_KEY = 'chordbuilder:currentId';
const AUTOSAVE_MS = 800;

export interface SongMeta {
  id: string;
  title: string;
  updatedAt: number;
}

/** All saved songs, keyed by id. Guarded: private mode, quota, or corrupt data all fall back to
 *  an empty library rather than crashing the app. */
export function loadAllSongs(): Record<string, Song> {
  try {
    const raw = localStorage.getItem(SONGS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Song>) : {};
  } catch {
    return {};
  }
}

export function listSongs(): SongMeta[] {
  return Object.values(loadAllSongs())
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSongToStorage(song: Song): void {
  try {
    const all = loadAllSongs();
    all[song.id] = song;
    localStorage.setItem(SONGS_KEY, JSON.stringify(all));
  } catch {
    // private mode, quota exceeded, etc. — silently skip, nothing to recover here
  }
}

export function deleteSongFromStorage(id: string): void {
  try {
    const all = loadAllSongs();
    delete all[id];
    localStorage.setItem(SONGS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function getSongFromStorage(id: string): Song | null {
  return loadAllSongs()[id] ?? null;
}

function getCurrentSongId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentSongId(id: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    // ignore
  }
}

/** The song to open on load: whichever one autosave last pointed at, or a fresh song if there
 *  is none (first run, private browsing, or the pointed-at song was deleted elsewhere). */
export function loadInitialSong(): Song {
  const currentId = getCurrentSongId();
  const song = currentId ? getSongFromStorage(currentId) : null;
  return song ?? newSong();
}

/** Minimal structural check for an imported JSON file — enough to catch "not a song" without
 *  re-validating every field (the theory/state layers already guard against bad ChordRefs). */
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

/** Autosaves the current song (debounced) and keeps `currentId` pointing at it, so a reload
 *  reopens where you left off. Call once near the app root. */
export function useAutosave(): void {
  const song = useStore((s) => s.song);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveSongToStorage(song);
      setCurrentSongId(song.id);
    }, AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [song]);
}
