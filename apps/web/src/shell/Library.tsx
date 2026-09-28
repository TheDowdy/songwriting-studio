import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { newId } from '@sw/core';
import { useSong } from '@sw/song-store/react';
import { APP_NAME } from './appInfo';
import { DEFAULT_SONG_MODULE_ID, TOOL_MODULES } from './modules';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * `#/` (PLAN.md §4): the song list, New song, Import JSON, and a Tools row for modules that work
 * without a song open (currently just the guitar fretboard explorer).
 */
export default function Library() {
  const [, navigate] = useLocation();
  // Selecting `library` itself (a stable reference until something actually changes) and sorting
  // in a memo, rather than selecting `listSongs()` directly — that returns a new array on every
  // call, which `useSyncExternalStore` (under `useSong`) would then see as "changed" every render.
  const library = useSong((s) => s.library);
  const songs = useMemo(
    () =>
      Object.values(library)
        .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [library],
  );
  const newSong = useSong((s) => s.newSong);
  const deleteSong = useSong((s) => s.deleteSong);
  const importSong = useSong((s) => s.importSong);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openSong = (id: string) => navigate(`/song/${id}/${DEFAULT_SONG_MODULE_ID}`);

  const createSong = () => {
    const id = newSong();
    openSong(id);
  };

  const remove = (id: string, title: string) => {
    if (!confirm(`Delete "${title || 'Untitled song'}"? This can't be undone.`)) return;
    deleteSong(id);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const raw: unknown = JSON.parse(await file.text());
      // A fresh id, as the progression's own import does: re-importing a backup of a song that's
      // still in the library adds a copy instead of silently overwriting the one there.
      const id = raw && typeof raw === 'object' ? importSong({ ...raw, id: newId() }) : null;
      if (!id) {
        setError("That file doesn't look like a song export.");
        return;
      }
      openSong(id);
    } catch {
      setError("That file doesn't look like a song export.");
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your songs</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createSong}
              className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg"
            >
              New song
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-10 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
            >
              Import JSON…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label="Import a song file"
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}

        {songs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No songs yet — start one with "New song".</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {songs.map((meta) => (
              <li
                key={meta.id}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  onClick={() => openSong(meta.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-medium">{meta.title || 'Untitled song'}</p>
                  <p className="text-xs text-muted">{formatDate(meta.updatedAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(meta.id, meta.title)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-[var(--danger)] hover:bg-surface-2"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {TOOL_MODULES.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Tools</h2>
          <p className="mt-1 text-sm text-muted">Explore without opening a song.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {TOOL_MODULES.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/tools/${m.id}`)}
                  className="flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
                >
                  {m.icon}
                  {m.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
