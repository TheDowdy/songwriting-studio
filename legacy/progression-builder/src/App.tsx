import { useEffect, useMemo, useState } from 'react';
import SheetView from './sheet/SheetView';
import KeyPicker from './components/KeyPicker';
import NodeMap from './components/NodeMap';
import SongPanel from './components/SongPanel';
import Timeline from './components/Timeline';
import TransportBar from './components/TransportBar';
import { useAutosave } from './state/persistence';
import { previewChordInSong, useLivePlaybackSync } from './state/playback';
import { selectCenter, useStore } from './state/store';
import { startChords, suggestNext } from './theory/suggestions';
import type { ChordRef } from './theory/types';

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('chordbuilder:theme', theme);
    } catch {
      // private mode: the choice just won't persist
    }
  }, [theme]);
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="h-9 rounded-lg border border-line px-3 text-sm font-medium text-muted hover:bg-surface-2"
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}

export default function App() {
  useLivePlaybackSync();
  useAutosave();

  const song = useStore((s) => s.song);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const playingEventId = useStore((s) => s.playingEventId);
  const isPlaying = useStore((s) => s.isPlaying);
  const addChord = useStore((s) => s.addChord);

  const { chord: center, previous } = useMemo(
    () => selectCenter({ song, selectedEventId, playingEventId, isPlaying }),
    [song, selectedEventId, playingEventId, isPlaying],
  );
  const suggestions = useMemo(() => (center ? suggestNext(center, song.key, previous) : []), [center, previous, song.key]);
  const startRing = useMemo(() => startChords(song.key), [song.key]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const preview = (chord: ChordRef) => void previewChordInSong(chord);

  return (
    <div className="app-shell min-h-dvh pb-44 lg:pb-10">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-5">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Progression Builder</h1>
          <ThemeToggle />
        </header>
        <SongPanel onOpenSheet={() => setSheetOpen(true)} />
        <KeyPicker />
        <TransportBar />
        <NodeMap
          musicKey={song.key}
          center={center}
          suggestions={suggestions}
          startRing={startRing}
          onPreview={preview}
          onAdd={addChord}
        />
        <Timeline />
      </div>
      {sheetOpen && <SheetView onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
