/** Remembers the last module opened for each song (PLAN.md §4: "the last module used per song is
 *  remembered"). Purely a shell/UI convenience — not song data, so it doesn't travel with
 *  JSON export/import and isn't kept in `song.moduleData`. */
const KEY = 'sw:last-module';

function readAll(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [songId, moduleId] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof moduleId === 'string') out[songId] = moduleId;
    }
    return out;
  } catch {
    return {};
  }
}

export function getLastModule(songId: string): string | null {
  return readAll()[songId] ?? null;
}

export function setLastModule(songId: string, moduleId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const all = readAll();
    all[songId] = moduleId;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // private mode, quota exceeded: not remembering is harmless
  }
}
