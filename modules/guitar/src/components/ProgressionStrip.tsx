import { useState } from 'react';
import { chordName, findEvent, flattenSong, type StrumPattern } from '@sw/core';
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

const COLLAPSED_KEY = 'sw:guitar-strip-collapsed';

/** Whether the strip starts folded away: the viewer's last choice if they made one (storage can
 *  throw), else folded on a short screen, where the neck needs the height more than the strip. */
function startsCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    /* storage unavailable: fall through to the screen's height */
  }
  return typeof matchMedia === 'function' && matchMedia('(max-height: 800px)').matches;
}

/**
 * The song strip in the guitar workspace: the same sections-and-chords lane as the chords workspace
 * (`@sw/timeline`), drawn compactly in one scrolling lane. Pressing a chord focuses it and strums
 * its committed voicing, or the best shape, so the neck shows exactly what you hear; the section
 * being played is highlighted in the shell's Song order row, and the sounding beat turns red.
 * It can be folded to a single line, to give the neck the height on a short screen.
 */
export function ProgressionStrip() {
  const song = useSong((s) => s.currentSong());
  const progressionEventId = useStore((s) => s.progressionEventId);
  const playing = useStore((s) => s.progressionPlaying);
  const playingBeat = useStore((s) => s.progressionBeat);
  const addSectionId = useStore((s) => s.stripAddSectionId);
  const [collapsed, setCollapsed] = useState(startsCollapsed);
  if (!song) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable: the choice just lasts for this visit */
    }
  };

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

  if (collapsed) {
    return (
      <section className="progression-strip collapsed" aria-label="Progression">
        <button type="button" className="strip-fold" aria-expanded={false} onClick={toggle}>
          <span aria-hidden="true">▸ </span>Show the song strip
          {selected && (
            <span className="muted">
              {' '}
              · {chordName(selected.section.events[selected.index]!.chord)} in {selected.section.name}
            </span>
          )}
        </button>
      </section>
    );
  }

  return (
    <section className="progression-strip" aria-label="Progression">
      <button type="button" className="strip-fold corner" aria-expanded={true} aria-label="Hide the song strip" onClick={toggle}>
        ▾
      </button>
      {!hasChords && <p className="muted">This song has no chords yet — pick one below to start.</p>}
      <StripHostProvider host={host}>
        <SongStrip />
      </StripHostProvider>
    </section>
  );
}
