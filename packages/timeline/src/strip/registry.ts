import { useEffect } from 'react';
import { createStore } from 'zustand/vanilla';
import type { Density } from '../layout';
import type { StripHost } from './host';

/**
 * What a workspace supplies to the shell's song strip: how its edits behave (it keeps its own undo,
 * selection and previews), which defaults it prefers, and what to show in an empty section. The
 * strip itself, and the state it draws (selection, playing), are the shell's. A workspace
 * registers once when it mounts; the strip stays mounted as the workspaces switch.
 */
export type StripBehavior = Pick<
  StripHost,
  | 'selectEvent'
  | 'setActiveSection'
  | 'setLaneEvent'
  | 'setPatternEditorOpen'
  | 'previewPattern'
  | 'setBeats'
  | 'reorderEvents'
  | 'moveEvent'
  | 'addSection'
  | 'renameSection'
  | 'duplicateSection'
  | 'removeSection'
  | 'setSectionRepeat'
  | 'clearSection'
  | 'makeVariant'
  | 'setBlockPattern'
  | 'setBlockLength'
  | 'patternForChordOnly'
  | 'patternForSection'
  | 'patternForSong'
  | 'setSongPattern'
  | 'saveStrumPattern'
  | 'deleteStrumPattern'
  | 'renderEmpty'
  | 'noVoicingText'
  | 'onJumpToSource'
> & {
  /** How this workspace likes the strip drawn, until the viewer picks otherwise. */
  defaults: { density: Density; showLane: boolean; /** Start folded on a short screen (the workspace needs the height more). */ foldOnShortScreen: boolean };
  /** Offer Verse, Chorus, Bridge and Custom buttons for new sections, rather than a single "+ Section". */
  quickAddSections: boolean;
  /** Mark chords with no committed guitar voicing (a dashed underline). */
  showVoicingState: boolean;
  /** Whether the Song order row can be edited here (reorder, remove, add), or only read. */
  songOrderEditable: boolean;
};

export const stripRegistry = createStore<{ behavior: StripBehavior | null }>(() => ({ behavior: null }));

/** Register a workspace's behaviour. It stays registered after the workspace unmounts, so the
 *  strip does not unmount and remount as the viewer switches workspaces. */
export function registerStrip(behavior: StripBehavior): void {
  stripRegistry.setState({ behavior });
}

export function useRegisterStrip(behavior: StripBehavior): void {
  useEffect(() => {
    registerStrip(behavior);
  }, [behavior]);
}

/**
 * The selection the strip draws, mirrored from whichever workspace is showing (each keeps its own
 * state for its own purposes, such as the chord map's centre). The strip reads it here, and acts
 * through the workspace's `StripBehavior`.
 */
export interface StripUiState {
  selectedEventId: string | null;
  laneEventId: string | null;
  activeSectionId: string | null;
  replaceTargetId: string | null;
  patternEditorOpen: boolean;
}

export const stripUi = createStore<StripUiState>(() => ({
  selectedEventId: null,
  laneEventId: null,
  activeSectionId: null,
  replaceTargetId: null,
  patternEditorOpen: false,
}));

export const mirrorStripUi = (patch: Partial<StripUiState>) => {
  const cur = stripUi.getState();
  for (const k of Object.keys(patch) as (keyof StripUiState)[]) {
    if (patch[k] !== cur[k]) {
      stripUi.setState(patch);
      return;
    }
  }
};

/** The viewer's choices for how the strip is drawn, remembered between visits (null = the workspace's default). */
export interface StripPrefs {
  density: Density | null;
  showLane: boolean | null;
  collapsed: boolean | null;
}

const PREFS_KEY = 'sw:strip-prefs';

function loadPrefs(): StripPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<StripPrefs>;
    return {
      density: raw.density === 'compact' || raw.density === 'comfortable' ? raw.density : null,
      showLane: typeof raw.showLane === 'boolean' ? raw.showLane : null,
      collapsed: typeof raw.collapsed === 'boolean' ? raw.collapsed : null,
    };
  } catch {
    return { density: null, showLane: null, collapsed: null };
  }
}

export const stripPrefs = createStore<StripPrefs>(() => loadPrefs());

export function setStripPrefs(patch: Partial<StripPrefs>): void {
  stripPrefs.setState(patch);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(stripPrefs.getState()));
  } catch {
    /* storage unavailable: the choice just lasts for this visit */
  }
}

/** Whether the screen is short enough that the workspace below needs the height more than the strip. */
export const isShortScreen = () => typeof matchMedia === 'function' && matchMedia('(max-height: 800px)').matches;
