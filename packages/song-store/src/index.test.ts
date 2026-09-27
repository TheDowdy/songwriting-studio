import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diatonicChords } from '@sw/core';

/** A minimal in-memory `localStorage` (the test env has no DOM/jsdom — see PLAN.md §7 Phase 0
 *  notes on why this repo avoids a jsdom dependency). */
function makeLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
  } as Storage;
}

const c = { tonic: 'C', mode: 'major' } as const;
const [I] = diatonicChords(c);

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'localStorage', { value: makeLocalStorage(), configurable: true });
});

describe('song-store: first run', () => {
  it('starts with a fresh, valid song when nothing is stored', async () => {
    const { songStore } = await import('./index');
    const song = songStore.getState().currentSong();
    expect(song).not.toBeNull();
    expect(song!.schemaVersion).toBe(2);
    expect(song!.sections).toHaveLength(1);
  });

  it("imports PB's legacy songs (chordbuilder:songs/currentId) through migrateSong", async () => {
    const legacySong = {
      id: 'legacy-1',
      title: 'Old Song',
      key: { tonic: 'G', mode: 'major' },
      timeSig: { beats: 4, unit: 4 },
      bpm: 90,
      instrument: 'piano',
      pattern: 'block',
      sections: [{ id: 's1', name: 'Verse', events: [{ id: 'e1', chord: I, beats: 4 }], repeat: 1 }],
      arrangement: ['s1'],
      updatedAt: 111,
    };
    localStorage.setItem('chordbuilder:songs', JSON.stringify({ 'legacy-1': legacySong }));
    localStorage.setItem('chordbuilder:currentId', 'legacy-1');

    const { songStore } = await import('./index');
    const state = songStore.getState();
    expect(state.currentSongId).toBe('legacy-1');
    expect(state.library['legacy-1']?.schemaVersion).toBe(2);
    expect(state.library['legacy-1']?.title).toBe('Old Song');
    expect(state.library['legacy-1']?.guitar).toBeDefined(); // v1 → v2 upgrade filled this in
  });

  it('prefers sw:songs over the legacy keys once it exists', async () => {
    const current = {
      schemaVersion: 2,
      id: 'current-1',
      title: 'Current',
      key: c,
      timeSig: { beats: 4, unit: 4 },
      bpm: 100,
      instrument: 'piano',
      pattern: 'block',
      sections: [{ id: 's1', name: 'Verse', events: [], repeat: 1 }],
      arrangement: ['s1'],
      updatedAt: 999,
      guitar: { tuning: [40, 45, 50, 55, 59, 64], capo: 0 },
    };
    localStorage.setItem('sw:songs', JSON.stringify({ 'current-1': current }));
    localStorage.setItem('sw:currentId', 'current-1');
    localStorage.setItem('chordbuilder:songs', JSON.stringify({ 'legacy-1': { id: 'legacy-1' } }));

    const { songStore } = await import('./index');
    const state = songStore.getState();
    expect(state.currentSongId).toBe('current-1');
    expect(Object.keys(state.library)).toEqual(['current-1']);
  });
});

describe('song-store: actions wrap @sw/core operations', () => {
  it('addChord / setEventChord / commitVoicing update the current song', async () => {
    const { songStore } = await import('./index');
    const s = songStore.getState();
    const sectionId = s.currentSong()!.sections[0]!.id;
    const eventId = s.addChord(sectionId, null, I);
    expect(songStore.getState().currentSong()!.sections[0]!.events).toHaveLength(1);

    const voicing = { frets: [null, 3, 2, 0, 1, 0], tuning: [40, 45, 50, 55, 59, 64], capo: 0, source: 'picked' as const };
    songStore.getState().commitVoicing(eventId, voicing);
    expect(songStore.getState().currentSong()!.sections[0]!.events[0]!.attachments?.guitar).toEqual(voicing);

    songStore.getState().clearVoicing(eventId);
    expect(songStore.getState().currentSong()!.sections[0]!.events[0]!.attachments?.guitar).toBeUndefined();
  });

  it('newSong / loadSong / deleteSong manage the library', async () => {
    const { songStore } = await import('./index');
    const firstId = songStore.getState().currentSongId as string;
    const secondId = songStore.getState().newSong();
    expect(songStore.getState().currentSongId).toBe(secondId);
    expect(Object.keys(songStore.getState().library).sort()).toEqual([firstId, secondId].sort());

    songStore.getState().loadSong(firstId);
    expect(songStore.getState().currentSongId).toBe(firstId);

    songStore.getState().deleteSong(secondId);
    expect(songStore.getState().library[secondId]).toBeUndefined();
  });

  it('importSong sanitises untrusted JSON through migrateSong', async () => {
    const { songStore } = await import('./index');
    const id = songStore.getState().importSong({ id: 'imported-1', sections: [{ id: 'a', events: [], repeat: 1 }], arrangement: ['a'] });
    expect(id).toBe('imported-1');
    expect(songStore.getState().currentSongId).toBe('imported-1');
    expect(songStore.getState().importSong('not a song')).toBeNull();
  });

  it('setGuitarTuning / setGuitarCapo update the current song, not a copy (§7 Phase 3 item 4)', async () => {
    const { songStore } = await import('./index');
    songStore.getState().setGuitarTuning([38, 43, 50, 55, 59, 62], 'Open G');
    songStore.getState().setGuitarCapo(2);
    const song = songStore.getState().currentSong()!;
    expect(song.guitar.tuning).toEqual([38, 43, 50, 55, 59, 62]);
    expect(song.guitar.tuningName).toBe('Open G');
    expect(song.guitar.capo).toBe(2);
  });
});

describe('song-store: autosave', () => {
  it('persists the very first (freshly-created/imported) song immediately, before any edit', async () => {
    const { songStore } = await import('./index');
    const song = songStore.getState().currentSong()!;
    const saved = JSON.parse(localStorage.getItem('sw:songs') as string);
    expect(saved[song.id]?.id).toBe(song.id);
    expect(localStorage.getItem('sw:currentId')).toBe(song.id);
  });

  it('debounces writes for later edits', async () => {
    vi.useFakeTimers();
    const { songStore } = await import('./index');
    const song = songStore.getState().currentSong()!;
    songStore.getState().setTitle('Renamed');

    // Still the pre-rename title — the edit is debounced, not yet flushed.
    const beforeFlush = JSON.parse(localStorage.getItem('sw:songs') as string);
    expect(beforeFlush[song.id].title).not.toBe('Renamed');

    vi.advanceTimersByTime(900);
    const saved = JSON.parse(localStorage.getItem('sw:songs') as string);
    expect(saved[song.id].title).toBe('Renamed');
    expect(localStorage.getItem('sw:currentId')).toBe(song.id);
    vi.useRealTimers();
  });
});
