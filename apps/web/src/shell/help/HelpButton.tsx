import { useHelpMode } from './store';

/** The "?" button that turns help mode on (see `HelpLayer`). */
export function HelpButton() {
  const setOn = useHelpMode((s) => s.setOn);
  return (
    <button
      type="button"
      aria-label="Help"
      onClick={() => setOn(true)}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg hover:bg-surface-2"
    >
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M9.2 9.2a2.9 2.9 0 1 1 4.4 2.5c-.9.6-1.6 1.1-1.6 2.3" strokeLinecap="round" />
        <circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
