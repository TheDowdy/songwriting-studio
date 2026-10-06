/**
 * The module contract (PLAN.md §4). Adding a module to the app is one folder under `modules/` plus
 * one line in `MODULES` below — see ARCHITECTURE.md, "How to add a module". The shell only ever
 * imports a module through its `index.ts` (its `ModuleDefinition`); it never reaches into a
 * module's internals, and a module never imports another module or the shell.
 */
import type { ComponentType, ReactNode } from 'react';
import type { HelpEntry } from '@sw/ui';
import type { PlaybackAdapter } from '@sw/timeline';
import guitarModule from '@sw/module-guitar';
import progressionModule from '@sw/module-progression';

export interface ModuleProps {
  /** null when the module is opened as a stand-alone tool (`#/tools/:moduleId`). */
  songId: string | null;
  /** Parsed from the URL query (`?event=`/`?section=`), for a module to focus on when it mounts. */
  focus: { eventId?: string; sectionId?: string };
  /** Switch to another module, optionally opening a different song and/or focusing a chord. */
  navigate: (to: { module: string; songId?: string | null; eventId?: string }) => void;
}

export interface ModuleDefinition {
  /** e.g. 'progression', 'guitar'. Used in routes and to remember the last module per song. */
  id: string;
  /** Tab label. */
  title: string;
  /** Small inline SVG shown next to the tab label. */
  icon: ReactNode;
  /** 'song': only opens inside a song. 'song-or-tool': also works stand-alone, with no song. */
  scope: 'song' | 'song-or-tool';
  Component: ComponentType<ModuleProps>;
  /** Called when the user leaves this module (switches tabs, or navigates away): stop audio,
   *  cancel gestures, so nothing keeps playing from a module that's no longer on screen. */
  onDeactivate?: () => void;
  /** How the shell's transport plays this module's workspace. Without it, the module has nothing
   *  to play and the transport is hidden. */
  playback?: PlaybackAdapter;
  /** Module-specific controls shown in the shell's transport row (e.g. instrument, re-voice). */
  TransportExtras?: ComponentType;
  /** True when the module already shows and edits the song's playing order, so the shell's own
   *  read-only Song order row would only repeat it. */
  hasOwnSongOrder?: boolean;
  /** What each control in this module does, for hover tips and help mode (see `HelpEntry`).
   *  Scope each entry to the module's root class so its names can't collide with another module's. */
  help?: HelpEntry[];
}

/** Every module in the app, in tab order. */
export const MODULES: ModuleDefinition[] = [progressionModule, guitarModule];

export function moduleById(id: string | undefined): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}

/** Modules that can be opened without a song, for the Library's "Tools" row and `#/tools/:id`. */
export const TOOL_MODULES: ModuleDefinition[] = MODULES.filter((m) => m.scope === 'song-or-tool');

/** Modules that can be opened inside a song (currently every module). */
export const SONG_MODULES: ModuleDefinition[] = MODULES;

export const DEFAULT_SONG_MODULE_ID = SONG_MODULES[0]?.id ?? 'progression';
