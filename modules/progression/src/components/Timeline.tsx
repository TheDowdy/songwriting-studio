import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { canToggleMajorMinor, chordName, keyOfSection, toggleMajorMinor } from '@sw/core';
import type { Key, Section } from '@sw/core';
import { ActionBar, ActionButton, BeatsStepper, chipLabel, ChordTitle, PatternBlockToolbar, playhead, SongStrip, StripHostProvider, type StripHost } from '@sw/timeline';
import { useStore as useZustand } from 'zustand';
import type { Navigate } from '../App';
import { previewChordInSong, previewStrumPattern } from '../state/playback';
import { useStore } from '../state/store';
import type { ChordEvent } from '@sw/core';
import ChordDetail from './ChordDetail';
import FlavorPicker from './FlavorPicker';

/** On touch, a block only starts dragging after a short press-and-hold, so a plain swipe over it
 *  scrolls the timeline instead of being swallowed by drag detection. */
const TOUCH_DRAG = { activationConstraint: { delay: 250, tolerance: 8 } };

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

/** What the chords workspace shows under a section's lane: the pattern block's options, or the
 *  selected chord's actions (with its Flavour picker and Piano / guitar detail). */
function SectionFooter({ section, navigate }: { section: Section; navigate: Navigate }) {
  const song = useStore((s) => s.song);
  const selectedId = useStore((s) => s.selectedEventId);
  const replaceTargetId = useStore((s) => s.replaceTargetId);
  const laneEventId = useStore((s) => s.laneEventId);
  const detailOpen = useStore((s) => s.chordDetailOpen);
  const setDetailOpen = useStore((s) => s.setChordDetailOpen);
  const [flavorId, setFlavorId] = useState<string | null>(null);

  const laneEvent = section.events.find((e) => e.id === laneEventId);
  const toolbarEvent = laneEvent ? undefined : section.events.find((e) => e.id === selectedId);
  const flavorEvent = section.events.find((e) => e.id === flavorId && e.id === selectedId);
  const detailEvent = detailOpen ? toolbarEvent : undefined;

  return (
    <>
      {laneEvent && <PatternBlockToolbar section={section} eventId={laneEvent.id} />}
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
    </>
  );
}

function ArrangementRow() {
  const arrangement = useStore((s) => s.song.arrangement);
  const sections = useStore((s) => s.song.sections);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const addArrangementSlot = useStore((s) => s.addArrangementSlot);
  const removeArrangementSlot = useStore((s) => s.removeArrangementSlot);
  const reorderArrangement = useStore((s) => s.reorderArrangement);
  const setActiveSection = useStore((s) => s.setActiveSection);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, TOUCH_DRAG), useSensor(KeyboardSensor));
  const ids = arrangement.map((sectionId, i) => `${sectionId}#${i}`);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorderArrangement(from, to);
  };

  const song = useStore((s) => s.song);
  const playingSlot = useZustand(playhead, (s) => s.slot);
  const nameFor = (id: string) => chipLabel(song, id);
  const isVariant = (id: string) => !!sections.find((s) => s.id === id)?.variantOf;

  return (
    <section aria-label="Arrangement" className="rounded-none border-t border-fg pt-3">
      <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Arrangement</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <ol className="flex flex-wrap items-center gap-1.5">
            {arrangement.map((sectionId, i) => (
              <ArrangementChip key={ids[i]} id={ids[i]} name={nameFor(sectionId)} playing={playingSlot === i} variant={isVariant(sectionId)} onRemove={() => removeArrangementSlot(i)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              addArrangementSlot(s.id);
              setActiveSection(s.id);
            }}
            className={`rounded-full border px-3 py-1 text-sm italic ${
              s.id === activeSectionId ? 'border-accent text-accent' : 'border-fg text-muted hover:bg-surface-2'
            }`}
          >
            + {s.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function ArrangementChip({ id, name, playing, variant, onRemove }: { id: string; name: string; playing: boolean; variant: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      // dnd-kit's own `attributes.role` is 'button' (so a screen reader knows the whole item is a
      // keyboard drag handle); this li also contains the real "Remove" button below, and a button
      // nested inside another interactive role is inaccessible — `listitem` is accurate anyway.
      role="listitem"
      className={`flex items-center gap-1 rounded-none border-b py-0.5 pl-1 pr-1 text-base ${playing ? 'font-bold' : 'italic'} ${variant ? 'border-dashed' : ''} border-fg`}
      aria-current={playing ? 'step' : undefined}
      // The section being played is filled in the play colour, like the red slash on the sounding beat.
      data-playing={playing || undefined}
    >
      {name}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${name} from arrangement`}
        className="grid size-6 place-items-center rounded-lg text-sm opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </li>
  );
}

export default function Timeline({ navigate }: { navigate: Navigate }) {
  const state = useStore();
  const host: StripHost = {
    song: state.song,
    density: 'comfortable',
    layout: 'rows',
    showLane: true,
    showVoicingState: false,
    selectedEventId: state.selectedEventId,
    laneEventId: state.laneEventId,
    activeSectionId: state.activeSectionId,
    replaceTargetId: state.replaceTargetId,
    playing: state.isPlaying,
    playingEventId: state.playingEventId,
    playingBeat: state.playingBeat,
    patternEditorOpen: state.patternEditorOpen,
    selectEvent: (event) => {
      state.selectEvent(event.id);
      if (!state.isPlaying) void previewChordInSong(event.chord, event.beats, event.attachments);
    },
    setActiveSection: state.setActiveSection,
    setLaneEvent: state.setLaneEvent,
    setPatternEditorOpen: state.setPatternEditorOpen,
    previewPattern: (pattern, chord, attachments) => void previewStrumPattern(pattern, chord, attachments),
    setBeats: state.setEventBeats,
    reorderEvents: state.reorderEvents,
    moveEvent: state.moveEvent,
    addSection: state.addSection,
    renameSection: state.renameSection,
    duplicateSection: state.duplicateSection,
    removeSection: state.removeSection,
    setSectionRepeat: state.setSectionRepeat,
    clearSection: state.clearSection,
    makeVariant: state.makeVariantWithGenerator,
    setBlockPattern: state.setBlockPattern,
    setBlockLength: state.setBlockLength,
    patternForChordOnly: state.patternForChordOnly,
    patternForSection: state.patternForSection,
    patternForSong: state.patternForSong,
    setSongPattern: state.setPattern,
    saveStrumPattern: state.saveStrumPattern,
    deleteStrumPattern: state.deleteStrumPattern,
    renderSectionFooter: (section) => <SectionFooter section={section} navigate={navigate} />,
    renderAfterSections: () => <ArrangementRow />,
  };
  return (
    <StripHostProvider host={host}>
      <SongStrip />
    </StripHostProvider>
  );
}
