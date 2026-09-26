import { isSongLike } from '../state/persistence';
import { newId } from '../state/song';
import type { Song } from '../types';

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'song';
}

/** Export a song as a JSON backup (section 10), cheap to re-import later. */
export function downloadSongJson(song: Song): void {
  const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(song.title)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Parse an imported JSON file's text into a Song, assigning a fresh id so it never collides
 *  with (or silently overwrites) an existing saved song. Null if the file isn't song-shaped. */
export function parseSongJson(text: string): Song | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isSongLike(parsed)) return null;
  return { ...parsed, id: newId(), updatedAt: Date.now() };
}
