import { findEvent, flattenSong, type StrumPattern } from '@sw/core';
import { songStore } from '@sw/song-store';
import { useSong } from '@sw/song-store/react';
import { EmptySectionDrop, SongStrip, StripHostProvider, type StripHost } from '@sw/timeline';
import {
  addSection,
  duplicateSection,
  focusAndPlay,
  makeSectionVariant,
  removeSection,
  renameSection,
  reorderChord,
  clearSection,
  setSectionRepeat,
  moveChord,
  setChordBeats,
} from '../state/progressionEdits';
import { useStore } from '../state/store';

/**
 * The song strip in the guitar workspace: the same sections-and-chords lane as the chords workspace
 * (`@sw/timeline`), drawn compactly in one scrolling lane. Pressing a chord focuses it and strums
 * its committed voicing, or the best shape, so the neck shows exactly what you hear; the section
 * being played is highlighted in the shell's Song order row, and the sounding beat turns red.
 */
export function ProgressionStrip() {
  const song = useSong((s) => s.currentSong());
  const progressionEventId = useStore((s) => s.progressionEventId);
  const playing = useStore((s) => s.progressionPlaying);
  const playingBeat = useStore((s) => s.progressionBeat);
  const addSectionId = useStore((s) => s.stripAddSectionId);
  if (!song) return null;

  const selected = progressionEventId ? findEvent(song, progressionEventId) : null;
  const hasChords = flattenSong(song).length > 0;

  const host: StripHost = {
    song,
    density: 'compact',
    layout: 'inline',
    showLane: false,
    showVoicingState: true,
    selectedEventId: progressionEventId,
    laneEventId: null,
    activeSectionId: selected?.section.id ?? null,
    replaceTargetId: null,
    playing,
    playingEventId: progressionEventId,
    playingBeat,
    patternEditorOpen: false,
    noVoicingText: ', no voicing committed (plays the suggested shape)',
    selectEvent: (event) => focusAndPlay(event.id),
    setActiveSection: () => {},
    setLaneEvent: () => {},
    setPatternEditorOpen: () => {},
    previewPattern: (_pattern: StrumPattern) => {},
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
    setBlockPattern: (id, pattern) => songStore.getState().setBlockPattern(id, pattern),
    setBlockLength: (id, chords) => songStore.getState().setBlockLength(id, chords),
    patternForChordOnly: (id) => songStore.getState().patternForChordOnly(id),
    patternForSection: (sectionId, pattern) => songStore.getState().patternForSection(sectionId, pattern),
    patternForSong: (pattern) => songStore.getState().patternForSong(pattern),
    setSongPattern: (pattern) => songStore.getState().setPattern(pattern),
    saveStrumPattern: (pattern) => songStore.getState().saveStrumPattern(pattern),
    deleteStrumPattern: (id) => songStore.getState().deleteStrumPattern(id),
    // An empty section offers "+ Add chord" (the toolbar below then offers the chords), and still
    // takes a chord dragged into it.
    renderEmpty: (section) => (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="strip-add-chord"
          aria-pressed={addSectionId === section.id}
          onClick={() => useStore.getState().setStripAddSectionId(section.id)}
        >
          + Add chord
        </button>
        <EmptySectionDrop sectionId={section.id} />
      </div>
    ),
  };

  return (
    <section className="progression-strip" aria-label="Progression">
      {!hasChords && <p className="muted">This song has no chords yet — pick one below to start.</p>}
      <StripHostProvider host={host}>
        <SongStrip />
      </StripHostProvider>
    </section>
  );
}
