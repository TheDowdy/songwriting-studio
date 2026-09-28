import { useMemo, useState } from 'react';
import './index.css';
import SheetView from './sheet/SheetView';
import KeyPicker from './components/KeyPicker';
import NodeMap from './components/NodeMap';
import SongPanel from './components/SongPanel';
import Timeline from './components/Timeline';
import TransportBar from './components/TransportBar';
import { previewChordInSong, useLivePlaybackSync } from './state/playback';
import { selectCenter, useStore } from './state/store';
import { startChords, suggestNext } from '@sw/core';
import type { ChordRef } from '@sw/core';

/** The shell's `navigate` (§4 ModuleProps), narrowed to what this module actually calls: jumping
 *  to the guitar module with a chord selected (§7 Phase 3 item 1), and pointing the URL at a
 *  different song after switching which one is open (SongPanel's own File menu) so the shell's
 *  `SongView` doesn't load the old song straight back over it. Declared locally rather than
 *  imported from the shell — a module never imports the shell. */
export type Navigate = (to: { module: string; songId?: string; eventId?: string }) => void;

interface Props {
  navigate: Navigate;
}

/**
 * The progression module's view (§4 ModuleDefinition.Component). The page-level header (song
 * title, module tabs, theme toggle, settings) is the shell's job now, not this module's — see
 * apps/web/src/shell.
 */
export default function ProgressionModule({ navigate }: Props) {
  useLivePlaybackSync();

  const song = useStore((s) => s.song);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const playingEventId = useStore((s) => s.playingEventId);
  const isPlaying = useStore((s) => s.isPlaying);
  const addChord = useStore((s) => s.addChord);
  const replaceTargetId = useStore((s) => s.replaceTargetId);

  const { chord: center, previous } = useMemo(
    () => selectCenter({ song, selectedEventId, playingEventId, isPlaying }),
    [song, selectedEventId, playingEventId, isPlaying],
  );
  const suggestions = useMemo(() => (center ? suggestNext(center, song.key, previous) : []), [center, previous, song.key]);
  const startRing = useMemo(() => startChords(song.key), [song.key]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const preview = (chord: ChordRef) => void previewChordInSong(chord);

  return (
    <div className="mod-progression min-h-dvh pb-44 lg:pb-10">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-5">
        <SongPanel onOpenSheet={() => setSheetOpen(true)} navigate={navigate} />
        <KeyPicker />
        <TransportBar />
        <NodeMap
          musicKey={song.key}
          center={center}
          suggestions={suggestions}
          startRing={startRing}
          onPreview={preview}
          onAdd={addChord}
          guitar={song.guitar}
          replacing={!!replaceTargetId}
        />
        <Timeline navigate={navigate} />
      </div>
      {sheetOpen && <SheetView onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
