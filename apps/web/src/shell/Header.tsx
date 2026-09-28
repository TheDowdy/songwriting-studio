import { useState } from 'react';
import { Link } from 'wouter';
import type { ModuleDefinition } from './modules';
import { SettingsDialog } from './SettingsDialog';

interface Props {
  /** Omitted for a stand-alone tool (no song open). */
  title?: string;
  onRenameTitle?: (title: string) => void;
  modules: ModuleDefinition[];
  activeModuleId: string;
  /** href for each module tab, e.g. `/song/abc/guitar` or `/tools/guitar`. */
  hrefFor: (moduleId: string) => string;
  backHref?: string;
}

/**
 * The compact shell header (PLAN.md §4): song title, module tabs, and settings (theme + master
 * volume live in the dialog). Kept short so the guitar neck below it has vertical room, especially
 * on a phone in landscape.
 */
export function Header({ title, onRenameTitle, modules, activeModuleId, hrefFor, backHref }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
      {backHref && (
        <Link
          href={backHref}
          aria-label="Back to library"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg hover:bg-surface-2"
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}

      {title !== undefined && (
        // A real <h1> (PLAN.md §7 Phase 9: page-has-heading-one) — `contents` keeps it out of the
        // flex layout entirely, so this changes nothing visually.
        <h1 className="contents">
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={title}
              aria-label="Song title"
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-base font-semibold"
              onBlur={(e) => {
                setEditingTitle(false);
                onRenameTitle?.(e.target.value.trim() || title);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="h-10 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-base font-semibold hover:bg-surface-2"
              title="Rename song"
            >
              {title}
            </button>
          )}
        </h1>
      )}

      <nav aria-label="Modules" role="tablist" className="flex gap-1">
        {modules.map((m) => (
          <Link
            key={m.id}
            href={hrefFor(m.id)}
            role="tab"
            aria-selected={m.id === activeModuleId}
            className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-fg aria-selected:bg-accent aria-selected:text-accent-fg"
          >
            {m.icon}
            {m.title}
          </Link>
        ))}
      </nav>

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
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
