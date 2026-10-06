import './styles/global.css';
import '@sw/timeline/timeline.css';
import { AudioBanner } from './components/Toolbar/AudioBanner';
import { ChordHeader } from './components/ChordHeader';
import { Fretboard } from './components/Fretboard/Fretboard';
import { useState } from 'react';
import { BottomPanel, ModeTabs, startsCollapsed } from './components/Panels/BottomPanel';
import { Legend } from './components/Panels/Legend';
import { StripToolbar } from './components/StripToolbar';
import { ConfirmGuitarChange } from './components/ConfirmGuitarChange';
import { RevoicePanel } from './components/RevoicePanel';
import { Toolbar } from './components/Toolbar/Toolbar';
import { useAudioSync } from './hooks/useAudioSync';
import { useChordSelection } from './hooks/useChordSelection';
import { useIdentifySync } from './hooks/useIdentifySync';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useSongContext } from './hooks/useSongContext';
import { useGuitarStrip } from './state/stripBehavior';
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
 * Chords tab follow the open song, and the progression strip and its toolbar sit above the neck.
 */
export default function GuitarModule({ songId = null, focus = {} }: Props) {
  useAudioSync();
  useChordSelection();
  useIdentifySync();
  useAudioUnlock();
  useSongContext(songId, focus.eventId);
  useGuitarStrip();
  const [panelCollapsed, setPanelCollapsed] = useState(startsCollapsed);
  const revoiceOpen = useStore((s) => s.revoiceOpen);
  return (
    <div className="mod-guitar">
      <Toolbar inSong={songId !== null} />
      <AudioBanner />
      {/* Not a landmark: the shell already wraps the active module in one `<main>` per page
          (PLAN.md §7 Phase 9) — a nested one is a duplicate/non-top-level landmark. */}
      {songId && revoiceOpen && <RevoicePanel />}
      {songId && <StripToolbar />}
      <ModeTabs collapsed={panelCollapsed} setCollapsed={setPanelCollapsed} />
      <div className="stage">
        <ChordHeader />
        <Fretboard />
        <Legend />
      </div>
      <ConfirmGuitarChange />
      <BottomPanel collapsed={panelCollapsed} />
    </div>
  );
}
