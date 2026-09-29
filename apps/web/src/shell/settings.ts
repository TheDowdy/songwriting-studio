/**
 * Shell-level settings (PLAN.md §4/§5/§6): the app-wide theme and the master volume/mute. Each
 * module keeps its own instrument-level volume on top of this (§5). Persisted under
 * `sw:shell-settings` — `apps/web/public/theme-init.js` reads the same key to set the theme before
 * first paint, so there's no flash.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { setMasterMuted, setMasterVolume } from '@sw/audio';

export const SETTINGS_KEY = 'sw:shell-settings';

export type ThemeSetting = 'system' | 'light' | 'dark';

/** Where a theme choice could have been saved before it became a shell-wide setting (Phase 2
 *  §6): the guitar module's own settings, at each name it has had, and PB's old plain-string
 *  theme key. Checked only when `sw:shell-settings` itself doesn't exist yet — the same one-time
 *  import shape used elsewhere (song-store, the guitar module's own settings). */
const LEGACY_GUITAR_KEYS = ['sw:guitar-settings', 'fluid-frets-settings', 'fretscape-settings'];
const LEGACY_PB_THEME_KEY = 'chordbuilder:theme';

function legacyTheme(): ThemeSetting | null {
  if (typeof localStorage === 'undefined') return null;
  for (const key of LEGACY_GUITAR_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const theme = (JSON.parse(raw) as { state?: { theme?: unknown } }).state?.theme;
      if (theme === 'light' || theme === 'dark') return theme;
    } catch {
      // not JSON, or not shaped like we expect: keep looking
    }
  }
  const plain = localStorage.getItem(LEGACY_PB_THEME_KEY);
  return plain === 'light' || plain === 'dark' ? plain : null;
}

/** localStorage, falling back to a legacy theme (see above) only while `sw:shell-settings` has
 *  never been written. */
const shellStorage: StateStorage = {
  getItem: (name) => {
    if (typeof localStorage === 'undefined') return null;
    const own = localStorage.getItem(name);
    if (own !== null) return own;
    const theme = legacyTheme();
    return theme ? JSON.stringify({ state: { theme }, version: 1 }) : null;
  },
  setItem: (name, value) => localStorage?.setItem(name, value),
  removeItem: (name) => localStorage?.removeItem(name),
};

export interface ShellSettingsState {
  theme: ThemeSetting;
  /** 0–1, the app-wide master volume (on top of each module's own instrument volume). */
  volume: number;
  muted: boolean;
  setTheme: (theme: ThemeSetting) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

type Persisted = Pick<ShellSettingsState, 'theme' | 'volume' | 'muted'>;

export const useShellSettings = create<ShellSettingsState>()(
  persist(
    (set) => ({
      // First-time visitors get the light theme; "Match system" is still one tap away in Settings.
      theme: 'light',
      volume: 0.8,
      muted: false,
      setTheme: (theme) => set({ theme }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setMuted: (muted) => set({ muted }),
    }),
    {
      name: SETTINGS_KEY,
      version: 1,
      storage: createJSONStorage(() => shellStorage),
      partialize: (s): Persisted => ({ theme: s.theme, volume: s.volume, muted: s.muted }),
      // Storage is untrusted (PLAN.md §8): never let a corrupt value crash the app.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Persisted>;
        return {
          ...current,
          theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : 'light',
          volume:
            typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1
              ? p.volume
              : current.volume,
          muted: p.muted === true,
        };
      },
    },
  ),
);

/** Applies `theme` to `<html data-theme>` (matching `theme-init.js`'s pre-paint choice), and keeps
 *  the browser chrome (a phone's address bar) in step with the page. */
function applyTheme(theme: ThemeSetting): void {
  if (typeof document === 'undefined') return;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}

/** Wires the store to the DOM and to `@sw/audio`'s master gain. No-ops under Node (tests, SSR). */
export function initShellSettings(): void {
  if (typeof window === 'undefined') return;
  const apply = (s: ShellSettingsState) => {
    applyTheme(s.theme);
    setMasterVolume(s.volume);
    setMasterMuted(s.muted);
  };
  apply(useShellSettings.getState());
  useShellSettings.subscribe(apply);
}
