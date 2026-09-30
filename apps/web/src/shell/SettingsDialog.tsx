import { useEffect, useRef } from 'react';
import { useShellSettings, type ThemeSetting } from './settings';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Closes this dialog and opens the user guide. */
  onOpenGuide: () => void;
}

const THEMES: { id: ThemeSetting; label: string }[] = [
  { id: 'system', label: 'Match system' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** App-wide settings: theme and master volume/mute (PLAN.md §4/§5). Each module has its own
 *  settings for everything else (instrument sound, tunings…), reached from within that module. */
export function SettingsDialog({ open, onClose, onOpenGuide }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const theme = useShellSettings((s) => s.theme);
  const volume = useShellSettings((s) => s.volume);
  const muted = useShellSettings((s) => s.muted);
  const setTheme = useShellSettings((s) => s.setTheme);
  const setVolume = useShellSettings((s) => s.setVolume);
  const setMuted = useShellSettings((s) => s.setMuted);

  // Only in the DOM while open: a closed-but-present <dialog> would still hold form controls
  // (a volume slider, theme buttons…) that a page-wide query — this app's own browser checks
  // included — could collide with.
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-fg bg-surface p-0 text-fg backdrop:bg-black/50"
    >
      <div className="p-5">
        <h2 className="m-0 mb-3 text-2xl font-medium italic">Settings</h2>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-base font-medium italic">Theme</legend>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={theme === t.id}
                onClick={() => setTheme(t.id)}
                className="h-10 rounded-full border border-fg px-4 text-base italic aria-pressed:border-accent aria-pressed:text-accent"
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <label className="flex items-center gap-2 text-base font-medium italic" htmlFor="shell-volume">
            Master volume
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="shell-volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="h-10 flex-1"
            />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
              Mute
            </label>
          </div>
          <p className="mt-1 text-xs text-muted">
            Applies on top of each module&apos;s own sound settings.
          </p>
        </div>

        <div className="mt-4">
          <h3 className="mb-1 text-base font-medium italic">Help</h3>
          <button
            type="button"
            onClick={onOpenGuide}
            className="h-10 rounded-full border border-fg px-4 text-base italic hover:bg-surface-2"
          >
            Open the user guide
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full bg-accent px-5 text-base font-medium italic text-accent-fg"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
