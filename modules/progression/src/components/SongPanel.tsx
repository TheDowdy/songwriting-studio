import { useRef, useState } from 'react';
import { downloadMidi } from '../export/midi';
import { downloadSongJson, parseSongJson } from '../export/json';
import {
  deleteSongFromStorage,
  getSongFromStorage,
  listSongs,
  saveSongToStorage,
  type SongMeta,
} from '../state/persistence';
import { flattenSong, newId } from '@sw/core';
import type { Navigate } from '../App';
import { useStore } from '../state/store';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function SavedRow({
  meta,
  currentId,
  onChanged,
  navigate,
}: {
  meta: SongMeta;
  currentId: string;
  onChanged: () => void;
  navigate: Navigate;
}) {
  const loadSong = useStore((s) => s.loadSong);
  const setTitle = useStore((s) => s.setTitle);
  const newSongAction = useStore((s) => s.newSong);
  const isCurrent = meta.id === currentId;
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(meta.title);

  const open = () => {
    const song = getSongFromStorage(meta.id);
    if (!song) return;
    loadSong(song);
    // The store's current song just changed under the shell's feet — move the URL to match so it
    // doesn't load the old song straight back over this one (see `SongView`'s own comment).
    navigate({ module: 'progression', songId: meta.id });
  };

  const commitRename = () => {
    const title = draftTitle.trim() || meta.title;
    if (isCurrent) {
      setTitle(title); // the open song autosaves from the store, so rename it there
    } else {
      const song = getSongFromStorage(meta.id);
      if (song) saveSongToStorage({ ...song, title, updatedAt: Date.now() });
    }
    setRenaming(false);
    onChanged();
  };

  const duplicate = () => {
    const song = getSongFromStorage(meta.id);
    if (song) saveSongToStorage({ ...song, id: newId(), title: `${song.title} copy`, updatedAt: Date.now() });
    onChanged();
  };

  const remove = () => {
    if (!confirm(`Delete "${meta.title}"? This can't be undone.`)) return;
    deleteSongFromStorage(meta.id);
    if (isCurrent) {
      // Otherwise autosave would just write it straight back.
      const id = newSongAction();
      navigate({ module: 'progression', songId: id });
    }
    onChanged();
  };

  return (
    <li className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${isCurrent ? 'border-accent' : 'border-line'}`}>
      {renaming ? (
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Song title"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2"
        />
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{meta.title || 'Untitled song'}</p>
          <p className="text-xs text-muted">
            {isCurrent && <span className="mr-1.5 rounded-lg bg-accent px-2 py-0.5 font-semibold text-accent-fg">Open now · autosaves</span>}
            {formatDate(meta.updatedAt)}
          </p>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1 text-xs">
        {!isCurrent && (
          <button onClick={open} className="rounded-lg px-2 py-1 hover:bg-surface-2">
            Open
          </button>
        )}
        <button onClick={() => setRenaming((v) => !v)} className="rounded-lg px-2 py-1 hover:bg-surface-2">
          Rename
        </button>
        <button onClick={duplicate} className="rounded-lg px-2 py-1 hover:bg-surface-2">
          Duplicate
        </button>
        <button onClick={remove} className="rounded-lg px-2 py-1 text-[var(--danger)] hover:bg-surface-2">
          Delete
        </button>
      </div>
    </li>
  );
}

/** Section 10: save/load (autosave already runs in the background via useAutosave), JSON
 *  import/export as a backup, and MIDI export. */
export default function SongPanel({ onOpenSheet, navigate }: { onOpenSheet: () => void; navigate: Navigate }) {
  const [expanded, setExpanded] = useState(false);
  const [, setVersion] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const song = useStore((s) => s.song);
  const setTitle = useStore((s) => s.setTitle);
  const loadSong = useStore((s) => s.loadSong);
  const newSongAction = useStore((s) => s.newSong);
  const hasChords = useStore((s) => flattenSong(s.song).length > 0);

  const titleInput = useRef<HTMLInputElement>(null);

  const refresh = () => setVersion((v) => v + 1);
  // The saved library plus the open song as it is right now (its autosave lags edits by a moment),
  // so the list never shows a stale copy of the song being edited, or the same song twice.
  const songs: SongMeta[] = expanded
    ? [...listSongs().filter((m) => m.id !== song.id), { id: song.id, title: song.title, updatedAt: song.updatedAt }].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      )
    : [];

  const toggle = () => setExpanded((v) => !v);

  const saveCopy = () => {
    // A copy is a separate song; the one you're editing stays open and keeps autosaving.
    saveSongToStorage({ ...song, id: newId(), title: `${song.title} copy`, updatedAt: Date.now() });
    refresh();
  };

  // Nothing is lost by starting a new song: the current one has already autosaved. The new one
  // opens with its title selected, so typing names it and Enter/Tab finishes.
  const startNewSong = () => {
    saveSongToStorage(song);
    const id = newSongAction();
    navigate({ module: 'progression', songId: id });
    setTimeout(() => titleInput.current?.select(), 0);
  };

  const importFile = async (file: File) => {
    setImportError(null);
    const text = await file.text();
    const imported = parseSongJson(text);
    if (!imported) {
      setImportError("That file doesn't look like a song export.");
      return;
    }
    loadSong(imported);
    saveSongToStorage(imported);
    navigate({ module: 'progression', songId: imported.id });
    refresh();
  };

  return (
    <div className={expanded ? 'rounded-xl border border-line bg-surface p-3' : ''}>
      <div className="flex items-center gap-2">
        <input
          ref={titleInput}
          value={song.title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Song title"
          aria-label="Song title"
          className="h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-xl font-semibold tracking-tight hover:border-line focus:border-line"
        />
        <button
          onClick={toggle}
          aria-pressed={expanded}
          aria-label="Save, load and export"
          className={`h-10 shrink-0 rounded-lg border px-3 text-sm font-medium ${expanded ? 'border-accent text-accent' : 'border-line text-muted hover:bg-surface-2'}`}
        >
          {expanded ? 'File ▴' : 'File ▾'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap gap-1.5 text-sm">
            <button onClick={onOpenSheet} disabled={!hasChords} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-40">
              Sheet music
            </button>
            <button onClick={startNewSong} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-surface-2">
              New song
            </button>
            <button onClick={saveCopy} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-surface-2">
              Save a copy
            </button>
            <button onClick={() => downloadSongJson(song)} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-surface-2">
              Export JSON
            </button>
            <button onClick={() => fileInput.current?.click()} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-surface-2">
              Import JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => downloadMidi(song)}
              disabled={!hasChords}
              className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-40"
            >
              Export MIDI
            </button>
          </div>
          <p className="text-xs text-muted">
            Everything you change is saved automatically to this browser. "New song" starts a blank one; "Save a copy" duplicates the open song.
          </p>
          {importError && <p className="text-sm text-[var(--danger)]">{importError}</p>}

          {songs.length > 0 ? (
            <ul className="space-y-1.5">
              {songs.map((meta) => (
                <SavedRow key={meta.id} meta={meta} currentId={song.id} onChanged={refresh} navigate={navigate} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Your song autosaves as you edit it.</p>
          )}
        </div>
      )}
    </div>
  );
}
