import { useState } from 'react';
import { useStore } from 'zustand';
import { chordName, findEvent, type Song } from '@sw/core';
import { SongOrderRow } from '../SongOrderRow';
import { playhead } from '../playhead';
import { StripHostProvider, type StripHost } from './host';
import { PatternBlockToolbar } from './PatternLane';
import { isShortScreen, setStripPrefs, stripPrefs, stripRegistry, stripUi } from './registry';
import { SongStrip } from './SongStrip';

const scrollToSection = (sectionId: string) =>
  document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

/**
 * The song's strip, drawn once by the shell above whichever workspace is showing: the Song order
 * row, a few view controls (compact or comfortable, the strum lane, fold it away) and every
 * section as one scrolling lane of chords. The workspace supplies how edits behave through its
 * registered `StripBehavior`; the selection and what is playing come from `stripUi` and `playhead`.
 */
export function SongStripPanel({ song }: { song: Song }) {
  const behavior = useStore(stripRegistry, (s) => s.behavior);
  const ui = useStore(stripUi);
  const prefs = useStore(stripPrefs);
  const play = useStore(playhead);
  // Decided once, when the strip first shows: resizing the window later does not fold it.
  const [shortAtStart] = useState(isShortScreen);
  if (!behavior) return null;

  const density = prefs.density ?? behavior.defaults.density;
  const showLane = prefs.showLane ?? behavior.defaults.showLane;
  const collapsed = prefs.collapsed ?? (behavior.defaults.foldOnShortScreen && shortAtStart);
  const selected = ui.selectedEventId ? findEvent(song, ui.selectedEventId) : null;

  const host: StripHost = {
    ...behavior,
    song,
    density,
    quickAddSections: behavior.quickAddSections,
    showLane,
    selectedEventId: ui.selectedEventId,
    laneEventId: ui.laneEventId,
    activeSectionId: ui.activeSectionId,
    replaceTargetId: ui.replaceTargetId,
    playing: play.eventId !== null,
    playingEventId: play.eventId,
    playingBeat: play.beat,
    patternEditorOpen: ui.patternEditorOpen,
  };
  const laneSection = ui.laneEventId ? findEvent(song, ui.laneEventId)?.section : undefined;

  return (
    <section className="sw-strip" aria-label="Song strip">
      <div className="sw-strip-head">
        <SongOrderRow
          song={song}
          onSelect={scrollToSection}
          editable={behavior.songOrderEditable ? { onAdded: (id) => behavior.setActiveSection(id) } : undefined}
        />
        <div className="sw-strip-tools" role="group" aria-label="Strip view">
          <button
            type="button"
            className="sw-strip-tool"
            aria-pressed={density === 'compact'}
            onClick={() => setStripPrefs({ density: density === 'compact' ? 'comfortable' : 'compact' })}
          >
            Compact
          </button>
          <button type="button" className="sw-strip-tool" aria-pressed={showLane} onClick={() => setStripPrefs({ showLane: !showLane })}>
            Strum lane
          </button>
          <button
            type="button"
            className="sw-strip-tool"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show the song strip' : 'Hide the song strip'}
            onClick={() => setStripPrefs({ collapsed: !collapsed })}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>
      {collapsed ? (
        selected && (
          <p className="sw-strip-folded">
            {chordName(selected.section.events[selected.index]!.chord)} in {selected.section.name}
          </p>
        )
      ) : (
        <StripHostProvider host={host}>
          <SongStrip />
          {laneSection && ui.laneEventId && showLane && <PatternBlockToolbar section={laneSection} eventId={ui.laneEventId} />}
        </StripHostProvider>
      )}
    </section>
  );
}
