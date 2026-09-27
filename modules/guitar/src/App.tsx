import './styles/global.css';
import { AudioBanner } from './components/Toolbar/AudioBanner';
import { Fretboard } from './components/Fretboard/Fretboard';
import { BottomPanel } from './components/Panels/BottomPanel';
import { Legend } from './components/Panels/Legend';
import { Toolbar } from './components/Toolbar/Toolbar';
import { useAudioSync } from './hooks/useAudioSync';
import { useChordSelection } from './hooks/useChordSelection';
import { useIdentifySync } from './hooks/useIdentifySync';
import { useAudioUnlock } from './hooks/useAudioUnlock';

/**
 * The guitar module's view (§4 ModuleDefinition.Component), also used stand-alone as a tool
 * (`#/tools/guitar`). Theme is a shell-level concern now (`data-theme` on `<html>`) — this module
 * no longer sets it itself (§6).
 */
export default function GuitarModule() {
  useAudioSync();
  useChordSelection();
  useIdentifySync();
  useAudioUnlock();
  return (
    <div className="mod-guitar">
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
