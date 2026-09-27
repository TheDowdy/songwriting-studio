import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** Where settings and saved tunings are kept in localStorage, now that this module lives inside
 *  Songwriting Studio rather than being the whole app. */
export const SETTINGS_KEY = 'sw:guitar-settings';
/**
 * Keys used before this module moved into Songwriting Studio (it was the standalone Fluid Frets
 * app, itself renamed from Fretscape). Settings found under either are carried over on first
 * load, so nobody loses their tunings or preferences to the move (§7 Phase 2 / §8).
 */
export const LEGACY_SETTINGS_KEY = 'fluid-frets-settings';
export const LEGACY_FRETSCAPE_SETTINGS_KEY = 'fretscape-settings';

/** localStorage, or null where there is none (unit tests in Node): settings just aren't saved. */
const local = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

/** localStorage that reads the old key(s) when the new one is empty, and retires them on write. */
export const migratingStorage: StateStorage = {
  getItem: (name) => {
    const ls = local();
    return ls ? (ls.getItem(name) ?? ls.getItem(LEGACY_SETTINGS_KEY) ?? ls.getItem(LEGACY_FRETSCAPE_SETTINGS_KEY)) : null;
  },
  setItem: (name, value) => {
    const ls = local();
    if (!ls) return;
    ls.setItem(name, value);
    ls.removeItem(LEGACY_SETTINGS_KEY);
    ls.removeItem(LEGACY_FRETSCAPE_SETTINGS_KEY);
  },
  removeItem: (name) => {
    const ls = local();
    if (!ls) return;
    ls.removeItem(name);
    ls.removeItem(LEGACY_SETTINGS_KEY);
    ls.removeItem(LEGACY_FRETSCAPE_SETTINGS_KEY);
  },
};

export const settingsStorage = createJSONStorage(() => migratingStorage);

/** Forgets every saved setting (current key and both legacy ones). */
export function clearSettings(): void {
  migratingStorage.removeItem(SETTINGS_KEY);
}
