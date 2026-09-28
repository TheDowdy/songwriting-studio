import './styles/global.css';
import { AudioBanner } from './components/Toolbar/AudioBanner';
import { ChordHeader } from './components/ChordHeader';
import { Fretboard } from './components/Fretboard/Fretboard';
import { BottomPanel } from './components/Panels/BottomPanel';
import { Legend } from './components/Panels/Legend';
import { ProgressionStrip } from './components/ProgressionStrip';
import { StripToolbar } from './components/StripToolbar';
import { ConfirmGuitarChange } from './components/ConfirmGuitarChange';
import { RevoicePanel } from './components/RevoicePanel';
import { Toolbar } from './components/Toolbar/Toolbar';
import { useAudioSync } from './hooks/useAudioSync';
import { useChordSelection } from './hooks/useChordSelection';
import { useIdentifySync } from './hooks/useIdentifySync';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useSongContext } from './hooks/useSongContext';
import { useStore } from './state/store';

interface Props {
  /** null when opened as a stand-alone tool (`#/tools/guitar`); a song id in song context. */
  songId?: string | null;
  /** From the shell's URL query — `eventId` is the progression chord to focus (§7 Phase 3 item 1). */
  focus?: { eventId?: string; sectionId?: string };
}

/**
 * The guitar module's view (§4 ModuleDefinition.Component), also used stand-alone as a tool
 * (`#/tools/guitar`). Theme is a shell-level concern now (`data-theme` on `<html>`) — this module
 * no longer sets it itself (§6). In song context (§7 Phase 3) the neck's tuning/capo and the
 * Chords tab follow the open song, and a progression strip sits above the bottom panel.
 */
export default function GuitarModule({ songId = null, focus = {} }: Props) {
  useAudioSync();
  useChordSelection();
  useIdentifySync();
  useAudioUnlock();
  useSongContext(songId, focus.eventId);
  const revoiceOpen = useStore((s) => s.revoiceOpen);
  return (
    <div className="mod-guitar">
      <Toolbar />
      <AudioBanner />
      <main className="stage">
        <ChordHeader />
        <Fretboard />
        <Legend />
      </main>
      {songId && <ProgressionStrip />}
      {songId && revoiceOpen && <RevoicePanel />}
      {songId && <StripToolbar />}
      <ConfirmGuitarChange />
      <BottomPanel />
    </div>
  );
}
