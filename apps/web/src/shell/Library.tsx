import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { newId } from '@sw/core';
import { useSong } from '@sw/song-store/react';
import { APP_NAME } from './appInfo';
import { HeaderActions } from './HeaderActions';
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
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* A masthead over a double rule, like the title page of a songbook. */}
      <div className="border-b border-fg pb-3 shadow-[0_3px_0_-2px_var(--bg),0_4px_0_-2px_var(--fg)]">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-5xl font-medium italic leading-none tracking-tight max-[430px]:text-4xl">{APP_NAME}</h1>
          <div className="flex">
            <HeaderActions />
          </div>
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-medium italic">Your songs</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createSong}
              className="h-10 rounded-full bg-accent px-5 text-base font-medium italic text-accent-fg"
            >
              New song
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-10 rounded-full border border-fg px-5 text-base italic hover:bg-surface-2"
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
          <p className="mt-3 text-base italic text-muted">No songs yet — start one with "New song".</p>
        ) : (
          <ul className="mt-2">
            {songs.map((meta) => (
              <li key={meta.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-line py-3">
                <button
                  type="button"
                  onClick={() => openSong(meta.id)}
                  className="max-w-full truncate text-left text-2xl font-medium leading-tight hover:text-accent"
                >
                  {meta.title || 'Untitled song'}
                </button>
                {/* The dot leader that runs from the title to the date, as in a table of contents. */}
                <span
                  aria-hidden
                  className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-muted/50 max-[430px]:hidden"
                />
                <span className="font-mono text-xs text-muted max-[430px]:order-3 max-[430px]:w-full">
                  {formatDate(meta.updatedAt)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(meta.id, meta.title)}
                  className="ml-2 shrink-0 px-1 text-sm italic text-[var(--danger)] hover:underline"
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
          <h2 className="text-2xl font-medium italic">Tools</h2>
          <p className="mt-1 text-base italic text-muted">Explore without opening a song.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {TOOL_MODULES.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/tools/${m.id}`)}
                  className="flex h-11 items-center gap-2 rounded-full border border-fg px-5 text-base italic hover:bg-surface-2"
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
