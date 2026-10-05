/**
 * The progression module's contract (§4). `apps/web/src/shell/modules.ts` assembles this (and
 * the guitar module) into `MODULES`; this file never imports from the shell or from the guitar
 * module — only `@sw/core`, `@sw/song-store`, `@sw/audio`, `@sw/ui`, and its own `src/`.
 */
import { createElement } from 'react';
import ProgressionModule from './App';
import { PROGRESSION_HELP } from './help';
import { prefetchSamples } from './audio/engine';
import { stop as stopPlayback, toNoteStrikes } from './state/playback';
import { useStore } from './state/store';
import { chordStrokes, patternBlocks, voicingStatus } from '@sw/core';

/** Music-note tab icon. */
const icon = createElement(
  'svg',
  { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true, fill: 'currentColor' },
  createElement('path', {
    d: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
    stroke: 'currentColor',
    fill: 'none',
    strokeWidth: 1.6,
    strokeLinejoin: 'round',
  }),
);

export const progressionModule = {
  id: 'progression',
  title: 'Progression',
  icon,
  scope: 'song' as const,
  Component: ProgressionModule,
  help: PROGRESSION_HELP,
  /** Stop the transport (and any preview) when the user switches to another module (§5). */
  onDeactivate: stopPlayback,
};

export default progressionModule;

/** Called once by the shell at startup (§7 Phase 2 / the guitar-sample fix): downloads the
 *  instrument samples into the HTTP cache before any audio context exists, so the first chord
 *  played on any instrument never falls back to the synthesized guitar. */
export { prefetchSamples };

// Test hook, exactly like the guitar module's own (@sw/module-guitar): lets browser checks build a
// progression directly through the same store the UI uses, rather than reproducing every click.
// Installed as a side effect of importing this module, so it exists as soon as the shell assembles
// `MODULES` — before any route renders.
if (
  typeof window !== 'undefined' &&
  (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))
) {
  // `strikes()` is exactly what playback would sound for the current song (Phase 5 check: the
  // guitar instrument plays each committed voicing's notes).
  (window as unknown as { __songwriting: unknown }).__songwriting = {
    store: useStore,
    strikes: () => toNoteStrikes(useStore.getState().song),
    // Whether a committed voicing still fits (Phase 7 check).
    voicingStatus,
    // The strum pattern lane's blocks, and a chord's strokes at their phase.
    patternBlocks,
    chordStrokes,
  };
}
