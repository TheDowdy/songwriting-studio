/**
 * The guitar module's contract (§4). Works both inside a song and as a stand-alone tool
 * (`#/tools/guitar`) — `scope: 'song-or-tool'`. Never imports the progression module or the
 * shell; only `@sw/core`, `@sw/song-store` (later phases), `@sw/audio`, `@sw/ui`, and its own
 * `src/`.
 */
import { createElement } from 'react';
import GuitarModule from './App';
import { audioEngine } from './audio/engine';
import { applyCapo } from './state/capoActions';
import { stopChordPlayback } from './state/chordActions';
import { progressionStrikes, stopProgression } from './state/progressionPlayback';
import { stopScale } from './state/scalePlayback';
import { useStore } from './state/store';
import { applyTuning } from './state/tuningActions';

/** Fretboard tab icon: three strings over frets. */
const icon = createElement(
  'svg',
  { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
  createElement('path', { d: 'M4 4v16M20 4v16M4 9h16M4 15h16', strokeLinecap: 'round' }),
);

export const guitarModule = {
  id: 'guitar',
  title: 'Guitar',
  icon,
  scope: 'song-or-tool' as const,
  Component: GuitarModule,
  /** Stops any scale playback or strummed chord loop when the user switches to another module
   *  (§5) — plucked/strummed strings themselves decay naturally, like releasing them by hand. */
  onDeactivate: () => {
    stopScale();
    stopChordPlayback();
    stopProgression();
  },
};

export default guitarModule;

// Test hook: lets browser checks inspect the audio engine and store (dev builds, or ?debug),
// exactly as the stand-alone Fluid Frets app did. Installed as a side effect of importing this
// module, so it exists as soon as the shell assembles `MODULES` — before any route renders.
if (
  typeof window !== 'undefined' &&
  (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))
) {
  // `applyTuning`/`applyCapo` are the context-aware wrappers real UI paths (pegs, presets, the
  // capo control) go through (§7 Phase 3 item 4) — browser checks that simulate "the user changed
  // the tuning/capo" should call these, not the store's own dumb `setTuning`/`jumpToTuning`/
  // `setCapo`, which only ever change what's drawn, not what's persisted or which song owns it.
  (window as unknown as { __fluidfrets: unknown }).__fluidfrets = {
    audioEngine,
    store: useStore,
    applyTuning,
    applyCapo,
    // What "Play song/section" would strum for a song (Phase 6 check: plays exactly these notes).
    progressionStrikes,
  };
}
