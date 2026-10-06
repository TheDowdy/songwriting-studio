import { useMemo, useState } from 'react';
import { canToggleMajorMinor, chordName, findEvent, keyOfSection, toggleMajorMinor } from '@sw/core';
import type { ChordEvent, Key } from '@sw/core';
import { ActionBar, ActionButton, BeatsStepper, ChordTitle } from '@sw/timeline';
import type { Navigate } from '../App';
import { previewChordInSong } from '../state/playback';
import { useStore } from '../state/store';
import ChordDetail from './ChordDetail';
import FlavorPicker from './FlavorPicker';

/** Actions for the selected chord, shown once below the row so blocks can stay narrow. */
function ChordToolbar({
  event,
  flavorOpen,
  detailOpen,
  replacing,
  musicKey,
  onFlavor,
  onDetail,
  onExplore,
}: {
  event: ChordEvent;
  flavorOpen: boolean;
  detailOpen: boolean;
  replacing: boolean;
  /** The key of this chord's section, for switching it between major and minor. */
  musicKey: Key;
  onFlavor: () => void;
  onDetail: () => void;
  /** Opens the guitar module with this chord selected (§7 Phase 3 item 1). */
  onExplore: () => void;
}) {
  const removeEvent = useStore((s) => s.removeEvent);
  const duplicateEvent = useStore((s) => s.duplicateEvent);
  const setEventBeats = useStore((s) => s.setEventBeats);
  const startReplace = useStore((s) => s.startReplace);
  const cancelReplace = useStore((s) => s.cancelReplace);
  const setEventChord = useStore((s) => s.setEventChord);
  return (
    <ActionBar className="mt-2" aria-label={`Actions for ${chordName(event.chord)}`}>
      <ChordTitle name={chordName(event.chord)} />
      <BeatsStepper beats={event.beats} onChange={(n) => setEventBeats(event.id, n)} />
      <ActionButton
        onClick={() => setEventChord(event.id, toggleMajorMinor(event.chord, musicKey))}
        disabled={!canToggleMajorMinor(event.chord)}
      >
        {event.chord.quality === 'min' ? 'Make major' : 'Make minor'}
      </ActionButton>
      <ActionButton onClick={onFlavor} aria-pressed={flavorOpen}>
        Flavour
      </ActionButton>
      <ActionButton onClick={onDetail} aria-pressed={detailOpen}>
        Piano / guitar
      </ActionButton>
      <ActionButton onClick={onExplore}>Explore guitar voicings</ActionButton>
      <ActionButton onClick={() => (replacing ? cancelReplace() : startReplace(event.id))} aria-pressed={replacing}>
        {replacing ? 'Cancel replace' : 'Replace'}
      </ActionButton>
      <ActionButton onClick={() => duplicateEvent(event.id)}>Duplicate</ActionButton>
      <ActionButton onClick={() => removeEvent(event.id)}>Remove</ActionButton>
    </ActionBar>
  );
}

/**
 * What the chords workspace shows under the song strip for the selected thing: the strum pattern
 * block's options when a pattern block is selected, otherwise the selected chord's actions (with
 * its Flavour picker and Piano / guitar detail).
 */
export default function ChordInspector({ navigate }: { navigate: Navigate }) {
  const song = useStore((s) => s.song);
  const selectedId = useStore((s) => s.selectedEventId);
  const replaceTargetId = useStore((s) => s.replaceTargetId);
  const laneEventId = useStore((s) => s.laneEventId);
  const detailOpen = useStore((s) => s.chordDetailOpen);
  const setDetailOpen = useStore((s) => s.setChordDetailOpen);
  const [flavorId, setFlavorId] = useState<string | null>(null);

  const lane = useMemo(() => (laneEventId ? findEvent(song, laneEventId) : null), [song, laneEventId]);
  const picked = useMemo(() => (!lane && selectedId ? findEvent(song, selectedId) : null), [song, lane, selectedId]);
  const section = lane?.section ?? picked?.section;
  const toolbarEvent: ChordEvent | undefined = picked ? picked.section.events[picked.index] : undefined;
  if (!section) return null;
  const flavorEvent = toolbarEvent && toolbarEvent.id === flavorId ? toolbarEvent : undefined;
  const detailEvent = detailOpen ? toolbarEvent : undefined;

  return (
    <div className="mod-progression-inspector">
      {/* The strum pattern block's options show under the song strip itself, not here. */}
      {toolbarEvent && (
        <ChordToolbar
          event={toolbarEvent}
          flavorOpen={toolbarEvent.id === flavorId}
          detailOpen={detailOpen}
          replacing={toolbarEvent.id === replaceTargetId}
          musicKey={keyOfSection(song, section.id)}
          onFlavor={() => {
            setFlavorId(flavorId === toolbarEvent.id ? null : toolbarEvent.id);
          }}
          onDetail={() => {
            setFlavorId(null);
            setDetailOpen(!detailOpen);
          }}
          onExplore={() => navigate({ module: 'guitar', eventId: toolbarEvent.id })}
        />
      )}
      {flavorEvent && (
        <div className="mt-2">
          <FlavorPicker
            chord={flavorEvent.chord}
            musicKey={keyOfSection(song, section.id)}
            onPreview={(c) => void previewChordInSong(c)}
            onChoose={(c) => useStore.getState().setEventChord(flavorEvent.id, c)}
            onClose={() => setFlavorId(null)}
          />
        </div>
      )}
      {detailEvent && (
        <div className="mt-2">
          <ChordDetail
            chord={detailEvent.chord}
            attachments={detailEvent.attachments}
            guitar={song.guitar}
            onClose={() => setDetailOpen(false)}
            onExplore={() => navigate({ module: 'guitar', eventId: detailEvent.id })}
          />
        </div>
      )}
    </div>
  );
}
