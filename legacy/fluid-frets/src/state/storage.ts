import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** Where settings and saved tunings are kept in localStorage. */
export const SETTINGS_KEY = 'fluid-frets-settings';
/**
 * The key used before the app was renamed (it was called Fretscape). Settings found there are
 * carried over on first load, so nobody loses their tunings or preferences to the rename.
 */
export const LEGACY_SETTINGS_KEY = 'fretscape-settings';

/** localStorage, or null where there is none (unit tests in Node): settings just aren't saved. */
const local = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

/** localStorage that reads the old key when the new one is empty, and retires the old key on write. */
export const migratingStorage: StateStorage = {
  getItem: (name) => {
    const ls = local();
    return ls ? (ls.getItem(name) ?? ls.getItem(LEGACY_SETTINGS_KEY)) : null;
  },
  setItem: (name, value) => {
    const ls = local();
    if (!ls) return;
    ls.setItem(name, value);
    ls.removeItem(LEGACY_SETTINGS_KEY);
  },
  removeItem: (name) => {
    const ls = local();
    if (!ls) return;
    ls.removeItem(name);
    ls.removeItem(LEGACY_SETTINGS_KEY);
  },
};

export const settingsStorage = createJSONStorage(() => migratingStorage);

/** Forgets every saved setting (both keys). */
export function clearSettings(): void {
  migratingStorage.removeItem(SETTINGS_KEY);
}
