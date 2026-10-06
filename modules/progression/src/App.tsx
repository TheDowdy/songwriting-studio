import { useEffect, useMemo, useState } from 'react';
import './index.css';
import '@sw/timeline/timeline.css';
import SheetView from './sheet/SheetView';
import KeyPicker from './components/KeyPicker';
import CircleOfFifths from './components/CircleOfFifths';
import NodeMap from './components/NodeMap';
import SongPanel from './components/SongPanel';
import Timeline from './components/Timeline';
import { previewChordInSong, useLivePlaybackSync } from './state/playback';
import { selectCenter, useStore } from './state/store';
import { findEvent, keyOfSection, startChords, suggestNext } from '@sw/core';
import type { Key } from '@sw/core';
import { songStore } from '@sw/song-store';
import type { ChordRef } from '@sw/core';

/** The shell's `navigate` (§4 ModuleProps), narrowed to what this module actually calls: jumping
 *  to the guitar module with a chord selected (§7 Phase 3 item 1), and pointing the URL at a
 *  different song after switching which one is open (SongPanel's own File menu) so the shell's
 *  `SongView` doesn't load the old song straight back over it. Declared locally rather than
 *  imported from the shell — a module never imports the shell. */
export type Navigate = (to: { module: string; songId?: string; eventId?: string }) => void;

interface Props {
  navigate: Navigate;
  /** From the shell's URL query (`?event=`): a chord to open on. */
  focus?: { eventId?: string };
}

/**
 * The progression module's view (§4 ModuleDefinition.Component). The page-level header (song
 * title, module tabs, theme toggle, settings) is the shell's job now, not this module's — see
 * apps/web/src/shell.
 */
export default function ProgressionModule({ navigate, focus }: Props) {
  useLivePlaybackSync();

  const song = useStore((s) => s.song);
  const selectEvent = useStore((s) => s.selectEvent);
  // Open centred on the chord in focus: the one the URL names, else the one the other module last
  // focused or added (shared through the song store), so "add it in Guitar, then see what follows"
  // lands on suggestions from that chord.
  useEffect(() => {
    const wanted = focus?.eventId ?? songStore.getState().focusedEventId;
    const current = songStore.getState().currentSong();
    if (wanted && current && findEvent(current, wanted)) selectEvent(wanted);
  }, [focus?.eventId, selectEvent]);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const playingEventId = useStore((s) => s.playingEventId);
  const isPlaying = useStore((s) => s.isPlaying);
  const addChord = useStore((s) => s.addChord);
  const replaceTargetId = useStore((s) => s.replaceTargetId);

  const { chord: center, previous } = useMemo(
    () => selectCenter({ song, selectedEventId, playingEventId, isPlaying }),
    [song, selectedEventId, playingEventId, isPlaying],
  );
  // Everything on the map is judged in the key of the section being edited (a section can modulate).
  const activeSectionId = useStore((s) => s.activeSectionId);
  const key = useMemo(() => keyOfSection(song, activeSectionId), [song, activeSectionId]);
  const suggestions = useMemo(() => (center ? suggestNext(center, key, previous) : []), [center, previous, key]);
  const startRing = useMemo(() => startChords(key), [key]);
  const mapMode = useStore((s) => s.mapMode);
  const setMapMode = useStore((s) => s.setMapMode);
  const changeKey = useStore((s) => s.changeKey);
  const changeSectionKey = useStore((s) => s.changeSectionKey);
  // A key shift from the circle: the section's key, or the song's when there is only one section.
  const useAsKey = (next: Key) => (song.sections.length > 1 ? changeSectionKey(activeSectionId, next, 'relabel') : changeKey(next, 'relabel'));

  const [sheetOpen, setSheetOpen] = useState(false);
  const preview = (chord: ChordRef) => void previewChordInSong(chord);

  return (
    <div className="mod-progression min-h-dvh pb-10">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-5">
        <SongPanel onOpenSheet={() => setSheetOpen(true)} navigate={navigate} />
        <KeyPicker />
        <div role="group" aria-label="Chord map type" className="flex gap-4 border-b border-fg">
          {([['suggest', 'Suggestions'], ['circle', 'Circle of fifths']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setMapMode(mode)}
              aria-pressed={mapMode === mode}
              className="px-1 pb-1.5 text-lg italic text-muted aria-pressed:text-fg aria-pressed:shadow-[inset_0_-1.5px_0_var(--accent)]"
            >
              {label}
            </button>
          ))}
        </div>
        {mapMode === 'suggest' ? (
          <NodeMap
            musicKey={key}
            center={center}
            suggestions={suggestions}
            startRing={startRing}
            onPreview={preview}
            onAdd={addChord}
            guitar={song.guitar}
            replacing={!!replaceTargetId}
          />
        ) : (
          <CircleOfFifths musicKey={key} guitar={song.guitar} replacing={!!replaceTargetId} onPreview={preview} onAdd={addChord} onSetKey={useAsKey} />
        )}
        <Timeline navigate={navigate} />
      </div>
      {sheetOpen && <SheetView onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
