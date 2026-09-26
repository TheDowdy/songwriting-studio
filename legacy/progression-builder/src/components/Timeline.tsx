import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { chordName } from '@sw/core';
import { previewChordInSong } from '../state/playback';
import { BEATS_MAX, useStore } from '../state/store';
import type { ChordEvent, Section } from '@sw/core';
import ChordDetail from './ChordDetail';
import FlavorPicker from './FlavorPicker';

const ORIGIN_TINT = {
  diatonic: 'var(--t-diatonic)',
  borrowed: 'var(--t-borrowed)',
  secondary: 'var(--t-secondary)',
};

const ORIGIN_COLOR = {
  diatonic: 'var(--c-diatonic)',
  borrowed: 'var(--c-borrowed)',
  secondary: 'var(--c-secondary)',
};

/** On touch, a block only starts dragging after a short press-and-hold, so a plain swipe over it
 *  scrolls the timeline instead of being swallowed by drag detection. */
const TOUCH_DRAG = { activationConstraint: { delay: 250, tolerance: 8 } };

const QUICK_ADD = ['Verse', 'Chorus', 'Bridge'];

/** Width of one beat on the timeline; a chord block is `beats × BEAT_PX` wide. */
const BEAT_PX = 52;

function ChordSlot({
  event,
  sectionId,
  barLength,
  cumulativeBeats,
  active,
  playing,
  replacing,
}: {
  event: ChordEvent;
  sectionId: string;
  barLength: number;
  cumulativeBeats: number;
  active: boolean;
  playing: boolean;
  replacing: boolean;
}) {
  const isPlaying = useStore((s) => s.isPlaying);
  const selectEvent = useStore((s) => s.selectEvent);
  const setEventBeats = useStore((s) => s.setEventBeats);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: event.id,
    data: { sectionId },
  });
  const isBarStart = cumulativeBeats % barLength === 0;
  const [resizeBeats, setResizeBeats] = useState<number | null>(null);
  const shownBeats = resizeBeats ?? event.beats;

  // Drag the right edge: width maps straight to a beat count, computed from the pointer's
  // absolute position at drag start, so it never depends on a previous render's value.
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startBeats = event.beats;
    const beatsAt = (clientX: number) => Math.max(1, Math.round(startBeats + (clientX - startX) / BEAT_PX));
    const move = (ev: PointerEvent) => {
      const b = beatsAt(ev.clientX);
      setResizeBeats(b);
      setEventBeats(event.id, b);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setResizeBeats(null);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onResizeKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setEventBeats(event.id, event.beats + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setEventBeats(event.id, event.beats - 1);
    else return;
    e.preventDefault();
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`snap-start shrink-0 ${isBarStart ? 'border-l-2 border-line pl-1.5' : ''}`}
    >
      <div
        className={`relative h-24 shrink-0 overflow-hidden rounded-xl border-2 text-center transition-colors ${
          playing ? 'text-[var(--play-fg)]' : ''
        } ${active ? 'shadow-[inset_0_0_0_3px_var(--accent)]' : ''} ${replacing ? 'ring-2 ring-offset-1 ring-[var(--accent)]' : ''}`}
        style={{
          width: shownBeats * BEAT_PX,
          borderColor: ORIGIN_COLOR[event.chord.origin],
          backgroundColor: playing ? 'var(--play)' : ORIGIN_TINT[event.chord.origin],
          // faint tick at every beat boundary, so the block reads as a length
          backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${BEAT_PX - 1}px, color-mix(in srgb, var(--fg) 14%, transparent) ${BEAT_PX - 1}px, color-mix(in srgb, var(--fg) 14%, transparent) ${BEAT_PX}px)`,
        }}
      >
        <button
          onClick={() => {
            selectEvent(event.id);
            if (!isPlaying) void previewChordInSong(event.chord, event.beats);
          }}
          {...attributes}
          {...listeners}
          aria-pressed={active}
          aria-label={`Chord: ${chordName(event.chord)}, ${event.chord.numeral}, ${event.beats} beats`}
          className="absolute inset-0 flex flex-col items-center justify-center pr-3"
        >
          <span className="text-base font-bold leading-tight">{chordName(event.chord)}</span>
          <span className={`font-mono text-xs ${playing ? '' : 'text-muted'}`}>{event.chord.numeral}</span>
          <span className={`mt-1 font-mono text-lg font-medium leading-none ${playing ? '' : 'text-muted'}`}>{shownBeats}</span>
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Length of ${chordName(event.chord)} in beats`}
          aria-valuemin={1}
          aria-valuenow={event.beats}
          aria-valuemax={BEATS_MAX}
          onPointerDown={onResizeDown}
          onKeyDown={onResizeKey}
          className="absolute right-0 top-0 flex h-full w-5 cursor-ew-resize touch-none items-center justify-center bg-black/10 hover:bg-black/25"
        >
          <span className="h-6 w-0.5 rounded bg-current opacity-60" />
        </div>
      </div>
    </li>
  );
}

/** Actions for the selected chord, shown once below the row so blocks can stay narrow. */
function ChordToolbar({
  event,
  flavorOpen,
  detailOpen,
  replacing,
  onFlavor,
  onDetail,
}: {
  event: ChordEvent;
  flavorOpen: boolean;
  detailOpen: boolean;
  replacing: boolean;
  onFlavor: () => void;
  onDetail: () => void;
}) {
  const removeEvent = useStore((s) => s.removeEvent);
  const duplicateEvent = useStore((s) => s.duplicateEvent);
  const setEventBeats = useStore((s) => s.setEventBeats);
  const startReplace = useStore((s) => s.startReplace);
  const cancelReplace = useStore((s) => s.cancelReplace);
  const btn = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2 aria-pressed:border-accent';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" aria-label={`Actions for ${chordName(event.chord)}`}>
      <span className="text-sm font-semibold">{chordName(event.chord)}</span>
      <label className="flex items-center gap-1 text-sm text-muted">
        Beats
        <input
          type="number"
          min={1}
          max={BEATS_MAX}
          value={event.beats}
          onChange={(e) => setEventBeats(event.id, Number(e.target.value))}
          aria-label="Beats for selected chord"
          className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-fg"
        />
      </label>
      <button onClick={onFlavor} aria-pressed={flavorOpen} className={btn}>Flavor</button>
      <button onClick={onDetail} aria-pressed={detailOpen} className={btn}>Piano / guitar</button>
      <button onClick={() => (replacing ? cancelReplace() : startReplace(event.id))} aria-pressed={replacing} className={btn}>
        {replacing ? 'Cancel replace' : 'Replace'}
      </button>
      <button onClick={() => duplicateEvent(event.id)} className={btn}>Duplicate</button>
      <button onClick={() => removeEvent(event.id)} className={btn}>Remove</button>
    </div>
  );
}

function EmptyDropZone({ sectionId }: { sectionId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `empty:${sectionId}`, data: { sectionId } });
  return (
    <p
      ref={setNodeRef}
      className={`rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted ${isOver ? 'border-accent bg-surface-2' : 'border-line'}`}
    >
      Add chords from the map above, or drag one here.
    </p>
  );
}

function SectionBlock({ section, isOnly }: { section: Section; isOnly: boolean }) {
  const song = useStore((s) => s.song);
  const selectedId = useStore((s) => s.selectedEventId);
  const playingId = useStore((s) => s.playingEventId);
  const isPlaying = useStore((s) => s.isPlaying);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const replaceTargetId = useStore((s) => s.replaceTargetId);
  const renameSection = useStore((s) => s.renameSection);
  const duplicateSection = useStore((s) => s.duplicateSection);
  const removeSection = useStore((s) => s.removeSection);
  const setSectionRepeat = useStore((s) => s.setSectionRepeat);
  const clearSection = useStore((s) => s.clearSection);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const [flavorId, setFlavorId] = useState<string | null>(null);
  const detailOpen = useStore((s) => s.chordDetailOpen);
  const setDetailOpen = useStore((s) => s.setChordDetailOpen);

  const activeId = isPlaying && playingId ? playingId : selectedId;
  const barLength = song.timeSig.beats;
  let cumulative = 0;
  const withOffsets = section.events.map((event) => {
    const offset = cumulative;
    cumulative += event.beats;
    return { event, offset };
  });
  const toolbarEvent = section.events.find((e) => e.id === selectedId);
  const flavorEvent = section.events.find((e) => e.id === flavorId && e.id === selectedId);
  const detailEvent = detailOpen ? toolbarEvent : undefined;

  return (
    <section
      aria-label={`Section: ${section.name}`}
      onClick={() => setActiveSection(section.id)}
      className={`rounded-xl border p-3 ${section.id === activeSectionId ? 'border-accent bg-surface' : 'border-line bg-surface'}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={section.name}
            onChange={(e) => renameSection(section.id, e.target.value)}
            aria-label="Section name"
            className="w-28 rounded-lg border border-transparent bg-transparent px-1 font-semibold hover:border-line focus:border-line"
          />
          <div className="flex items-center gap-1 text-sm text-muted">
            <button
              onClick={() => setSectionRepeat(section.id, section.repeat - 1)}
              aria-label="Fewer repeats"
              className="grid size-6 place-items-center rounded-lg hover:bg-surface-2"
            >
              –
            </button>
            <span aria-label="Repeat count">×{section.repeat}</span>
            <button
              onClick={() => setSectionRepeat(section.id, section.repeat + 1)}
              aria-label="More repeats"
              className="grid size-6 place-items-center rounded-lg hover:bg-surface-2"
            >
              +
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted">
          <button onClick={() => duplicateSection(section.id)} className="rounded-lg px-2 py-1 hover:bg-surface-2">
            Duplicate section
          </button>
          {section.events.length > 0 && (
            <button onClick={() => clearSection(section.id)} className="rounded-lg px-2 py-1 hover:bg-surface-2">
              Clear
            </button>
          )}
          {!isOnly && (
            <button onClick={() => removeSection(section.id)} aria-label={`Delete ${section.name}`} className="rounded-lg px-2 py-1 hover:bg-surface-2">
              Delete
            </button>
          )}
        </div>
      </div>

      {section.events.length === 0 ? (
        <EmptyDropZone sectionId={section.id} />
      ) : (
        <SortableContext items={section.events.map((e) => e.id)} strategy={horizontalListSortingStrategy}>
          <ol className="timeline-scroll flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-3">
            {withOffsets.map(({ event, offset }) => (
              <ChordSlot
                key={event.id}
                event={event}
                sectionId={section.id}
                barLength={barLength}
                cumulativeBeats={offset}
                active={event.id === activeId}
                playing={isPlaying && event.id === playingId}
                replacing={event.id === replaceTargetId}
              />
            ))}
          </ol>
        </SortableContext>
      )}

      {toolbarEvent && (
        <ChordToolbar
          event={toolbarEvent}
          flavorOpen={toolbarEvent.id === flavorId}
          detailOpen={detailOpen}
          replacing={toolbarEvent.id === replaceTargetId}
          onFlavor={() => {
            setFlavorId(flavorId === toolbarEvent.id ? null : toolbarEvent.id);
          }}
          onDetail={() => {
            setFlavorId(null);
            setDetailOpen(!detailOpen);
          }}
        />
      )}
      {flavorEvent && (
        <div className="mt-2">
          <FlavorPicker
            chord={flavorEvent.chord}
            musicKey={song.key}
            onPreview={(c) => void previewChordInSong(c)}
            onChoose={(c) => useStore.getState().setEventChord(flavorEvent.id, c)}
            onClose={() => setFlavorId(null)}
          />
        </div>
      )}
      {detailEvent && (
        <div className="mt-2">
          <ChordDetail chord={detailEvent.chord} onClose={() => setDetailOpen(false)} />
        </div>
      )}
    </section>
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

  const nameFor = (id: string) => sections.find((s) => s.id === id)?.name ?? '?';

  return (
    <section aria-label="Arrangement" className="rounded-xl border border-line bg-surface p-3">
      <h2 className="mb-2 text-xs font-medium text-muted">Arrangement</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <ol className="flex flex-wrap items-center gap-1.5">
            {arrangement.map((sectionId, i) => (
              <ArrangementChip key={ids[i]} id={ids[i]} name={nameFor(sectionId)} onRemove={() => removeArrangementSlot(i)} />
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
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
              s.id === activeSectionId ? 'border-accent text-accent' : 'border-line text-muted hover:bg-surface-2'
            }`}
          >
            + {s.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function ArrangementChip({ id, name, onRemove }: { id: string; name: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm"
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

export default function Timeline() {
  const song = useStore((s) => s.song);
  const addSection = useStore((s) => s.addSection);
  const reorderEvents = useStore((s) => s.reorderEvents);
  const moveEvent = useStore((s) => s.moveEvent);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, TOUCH_DRAG), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const sectionOf = (eventId: string) => song.sections.find((sec) => sec.events.some((e) => e.id === eventId));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const fromSection = active.data.current?.sectionId as string | undefined;
    const toSection = (over.data.current?.sectionId as string | undefined) ?? sectionOf(String(over.id))?.id;
    if (!fromSection || !toSection) return;
    const toEvents = song.sections.find((s) => s.id === toSection)?.events ?? [];
    const overIndex = toEvents.findIndex((e) => e.id === over.id);
    const toIndex = overIndex >= 0 ? overIndex : toEvents.length;

    if (fromSection === toSection) {
      const events = song.sections.find((s) => s.id === fromSection)!.events;
      const fromIndex = events.findIndex((e) => e.id === active.id);
      if (fromIndex >= 0 && fromIndex !== toIndex) reorderEvents(fromSection, fromIndex, toIndex);
    } else {
      moveEvent(String(active.id), toSection, toIndex);
    }
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="space-y-3">
          {song.sections.map((section) => (
            <SectionBlock key={section.id} section={section} isOnly={song.sections.length === 1} />
          ))}
        </div>
      </DndContext>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_ADD.map((name) => (
          <button key={name} onClick={() => addSection(name)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
            + {name}
          </button>
        ))}
        <button onClick={() => addSection('Custom')} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          + Custom section
        </button>
      </div>

      <ArrangementRow />
    </div>
  );
}
