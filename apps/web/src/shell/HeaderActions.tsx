import { useState } from 'react';
import { GuideDialog } from './GuideDialog';
import { HelpButton } from './help/HelpButton';
import { SettingsDialog } from './SettingsDialog';

/** The header's right-hand cluster — Help and Preferences — shared by the song/tool header and
 *  the Library, so both screens reach help, settings and the user guide the same way. */
export function HeaderActions() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <>
      <HelpButton />
      <button
        type="button"
        aria-label="Preferences"
        onClick={() => setSettingsOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </button>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenGuide={() => {
          setSettingsOpen(false);
          setGuideOpen(true);
        }}
      />
      <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
