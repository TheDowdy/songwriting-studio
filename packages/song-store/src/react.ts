/** React binding for the song store (§7 Phase 1). Kept in its own entry so `./index.ts` — the
 *  store itself — stays framework-free; only components importing `@sw/song-store/react` pull
 *  in React. */
import { useStore } from 'zustand/react';
import { songStore, type SongStoreState } from './index';

export function useSong<T>(selector: (state: SongStoreState) => T): T {
  return useStore(songStore, selector);
}

export { songStore } from './index';
export type { SongStoreState, SongLibraryEntry } from './index';
