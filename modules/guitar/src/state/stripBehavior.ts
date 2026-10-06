import { createElement, useMemo } from 'react';
import './stripMirror';
import { EmptySectionDrop, useRegisterStrip, type StripBehavior } from '@sw/timeline';
import { songStore } from '@sw/song-store';
import {
  addSection,
  clearSection,
  duplicateSection,
  focusAndPlay,
  makeSectionVariant,
  moveChord,
  removeSection,
  renameSection,
  reorderChord,
  setChordBeats,
  setSectionRepeat,
} from './progressionEdits';
import { useStore } from './store';

/**
 * How the shell's song strip behaves in the guitar workspace: pressing a chord focuses it and
 * strums its committed voicing (or the best shape), so the neck shows what you hear; edits are
 * recorded for Undo. Registered once; the handlers read the stores when they run.
 */
export function useGuitarStrip(): void {
  const behavior = useMemo<StripBehavior>(() => {
    const songs = () => songStore.getState();
    return {
      defaults: { density: 'compact', showLane: false, foldOnShortScreen: true },
      quickAddSections: false,
      showVoicingState: true,
      songOrderEditable: false,
      noVoicingText: ', no voicing committed (plays the suggested shape)',
      selectEvent: (event) => focusAndPlay(event.id),
      setActiveSection: () => {},
      setLaneEvent: () => {},
      setPatternEditorOpen: () => {},
      previewPattern: () => {},
      setBeats: setChordBeats,
      reorderEvents: reorderChord,
      moveEvent: moveChord,
      addSection,
      renameSection,
      duplicateSection,
      removeSection,
      setSectionRepeat,
      clearSection,
      makeVariant: makeSectionVariant,
      setBlockPattern: (id, pattern) => songs().setBlockPattern(id, pattern),
      setBlockLength: (id, chords) => songs().setBlockLength(id, chords),
      patternForChordOnly: (id) => songs().patternForChordOnly(id),
      patternForSection: (id, pattern) => songs().patternForSection(id, pattern),
      patternForSong: (pattern) => songs().patternForSong(pattern),
      setSongPattern: (pattern) => songs().setPattern(pattern),
      saveStrumPattern: (pattern) => songs().saveStrumPattern(pattern),
      deleteStrumPattern: (id) => songs().deleteStrumPattern(id),
      // An empty section offers "+ Add chord" (the toolbar below then offers the chords), and
      // still takes a chord dragged into it.
      renderEmpty: (section) =>
        createElement(
          'div',
          { className: 'flex items-center gap-2' },
          createElement(
            'button',
            {
              type: 'button',
              className: 'strip-add-chord',
              'aria-pressed': useStore.getState().stripAddSectionId === section.id,
              onClick: () => useStore.getState().setStripAddSectionId(section.id),
            },
            '+ Add chord',
          ),
          createElement(EmptySectionDrop, { sectionId: section.id }),
        ),
    };
  }, []);
  useRegisterStrip(behavior);
}
