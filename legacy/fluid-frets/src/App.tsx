import { AudioBanner } from './components/Toolbar/AudioBanner';
import { Fretboard } from './components/Fretboard/Fretboard';
import { BottomPanel } from './components/Panels/BottomPanel';
import { Legend } from './components/Panels/Legend';
import { Toolbar } from './components/Toolbar/Toolbar';
import { useAudioSync } from './hooks/useAudioSync';
import { useChordSelection } from './hooks/useChordSelection';
import { useIdentifySync } from './hooks/useIdentifySync';
import { useTheme } from './hooks/useTheme';
import { useAudioUnlock } from './hooks/useAudioUnlock';

export default function App() {
  useAudioSync();
  useChordSelection();
  useIdentifySync();
  useTheme();
  useAudioUnlock();
  return (
    <div className="app">
      <Toolbar />
      <AudioBanner />
      <main className="stage">
        <Fretboard />
        <Legend />
      </main>
      <BottomPanel />
    </div>
  );
}
