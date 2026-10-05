import { useEffect, useMemo, useRef, useState } from 'react';
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
import { canToggleMajorMinor, chordName, chroma, keyLabel, keyOfSection, patternBlocks, toggleMajorMinor, voicingStatus } from '@sw/core';
import type { Key, PatternBlock } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { ChordDiagram, NumberField, VariantDialog } from '@sw/ui';
import type { Navigate } from '../App';
import { previewChordInSong } from '../state/playback';
import { BEATS_MAX, useStore } from '../state/store';
import type { ChordEvent, Section, VariantGeneratorId, VariantOptions } from '@sw/core';
import ChordDetail from './ChordDetail';
import FlavorPicker from './FlavorPicker';
import { PatternBlockToolbar, PatternLaneCell } from './PatternLane';
import { BEAT_PX } from './timelineConstants';

const ORIGIN_COLOR = {
  diatonic: 'var(--c-diatonic)',
  borrowed: 'var(--c-borrowed)',
  secondary: 'var(--c-secondary)',
};

/** On touch, a block only starts dragging after a short press-and-hold, so a plain swipe over it
 *  scrolls the timeline instead of being swallowed by drag detection. */
const TOUCH_DRAG = { activationConstraint: { delay: 250, tolerance: 8 } };

const QUICK_ADD = ['Verse', 'Chorus', 'Bridge'];

function ChordSlot({
  event,
  sectionId,
  index,
  count,
  block,
  barLength,
  cumulativeBeats,
  active,
  playing,
  replacing,
}: {
  event: ChordEvent;
  sectionId: string;
  index: number;
  count: number;
  /** The pattern block this chord is in, for its lane cell. */
  block: PatternBlock;
  barLength: number;
  cumulativeBeats: number;
  active: boolean;
  playing: boolean;
  replacing: boolean;
}) {
  const isPlaying = useStore((s) => s.isPlaying);
  const selectEvent = useStore((s) => s.selectEvent);
  const setEventBeats = useStore((s) => s.setEventBeats);
  const guitar = useStore((s) => s.song.guitar);
  // A committed guitar voicing shows as a mini diagram, flagged when it no longer fits the chord
  // or the song's tuning/capo (Phase 5 item 1 — the same badge the guitar module's strip shows).
  const voicing = event.attachments?.guitar;
  const stale = voicing ? voicingStatus(event, { guitar }) !== 'ok' : false;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: event.id,
    data: { sectionId },
  });
  const isBarStart = cumulativeBeats % barLength === 0;
  const [resizeBeats, setResizeBeats] = useState<number | null>(null);
  const shownBeats = resizeBeats ?? event.beats;

  // When this chord becomes the selected one (just added, or picked), scroll the timeline row
  // sideways so it's in view. Only the row scrolls, never the page, so adding from the map above
  // doesn't jump the window down.
  const itemRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const li = itemRef.current;
    const row = li?.closest<HTMLElement>('.timeline-scroll');
    if (!active || !li || !row) return;
    const left = li.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    const right = left + li.offsetWidth;
    const pad = 16;
    let to: number | null = null;
    if (left < row.scrollLeft) to = left - pad;
    else if (right > row.scrollLeft + row.clientWidth) to = right - row.clientWidth + pad;
    if (to === null) return;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: Math.max(0, to), behavior: smooth ? 'smooth' : 'auto' });
  }, [active]);

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
      ref={(el) => {
        setNodeRef(el);
        itemRef.current = el;
      }}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`snap-start shrink-0 ${isBarStart ? 'border-l-2 border-line pl-1.5' : ''}`}
    >
      <div
        className={`relative h-28 shrink-0 overflow-hidden rounded-none border-b-2 border-l border-l-fg text-center transition-colors ${
          active ? 'shadow-[inset_0_0_0_1.5px_var(--accent)]' : ''} ${replacing ? 'ring-2 ring-offset-1 ring-[var(--accent)]' : ''}`}
        style={{
          width: shownBeats * BEAT_PX,
          borderBottomColor: ORIGIN_COLOR[event.chord.origin],
          backgroundColor: playing ? 'var(--t-diatonic)' : 'transparent',
          // faint tick at every beat boundary, so the block reads as a length
          backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${BEAT_PX - 1}px, var(--line) ${BEAT_PX - 1}px, var(--line) ${BEAT_PX}px)`,
        }}
      >
        <button
          onClick={() => {
            selectEvent(event.id);
            if (!isPlaying) void previewChordInSong(event.chord, event.beats, event.attachments);
          }}
          {...attributes}
          {...listeners}
          aria-pressed={active}
          aria-label={`Chord: ${chordName(event.chord)}, ${event.chord.numeral}, ${event.beats} beats${
            voicing ? (stale ? ', guitar voicing needs a re-fit' : ', guitar voicing committed') : ''
          }`}
          className="absolute inset-0 flex flex-col items-center justify-center pb-7 pr-3"
        >
          <span className="text-2xl font-medium leading-tight" style={{ color: ORIGIN_COLOR[event.chord.origin] }}>{chordName(event.chord)}</span>
          <span className={`font-mono text-xs ${playing ? '' : 'text-muted'}`}>{event.chord.numeral}</span>
          {voicing ? (
            <span className="mt-0.5 flex items-center gap-1.5">
              {/* A stale voicing no longer shows its old shape (the owner's call: the diagram was
                  misleading next to a changed chord) — a warning takes its place until it's re-fit. */}
              {stale ? (
                <span className="block-stale" aria-hidden="true" title="This guitar voicing no longer fits: re-fit it in the guitar module">
                  ⚠
                </span>
              ) : (
                <span className="block-diagram" data-testid="block-diagram">
                  <ChordDiagram
                    frets={voicing.frets}
                    tuning={capoedTuning(voicing.tuning, voicing.capo)}
                    rootPc={chroma(event.chord.root)}
                    capo={voicing.capo}
                    size="mini"
                  />
                </span>
              )}
            </span>
          ) : null}
        </button>
        {/* One slash per beat on a little staff, as in a lead sheet: the length reads at a glance. The
            first slash turns red pencil while the block sounds. (The exact count is in the button's
            label and the length slider.) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-7 items-center"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 5px, var(--line) 5px, var(--line) 6px)' }}
        >
          {Array.from({ length: shownBeats }, (_, i) => (
                <span key={i} className="flex shrink-0 justify-center" style={{ width: BEAT_PX }}>
                  <span
                    className="block h-4 w-0.5"
                    style={{
                      transform: 'skewX(-28deg)',
                      background: playing && i === 0 ? 'var(--play)' : 'var(--fg)',
                      opacity: playing && i === 0 ? 1 : 0.7,
                    }}
                  />
                </span>
              ))}
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Length of ${chordName(event.chord)} in beats`}
          aria-valuemin={1}
          aria-valuenow={event.beats}
          aria-valuemax={BEATS_MAX}
          onPointerDown={onResizeDown}
          onKeyDown={onResizeKey}
          className="absolute right-0 top-0 flex h-full w-5 cursor-ew-resize touch-none items-center justify-center hover:bg-surface-2"
        >
          <span className="h-6 w-0.5 rounded bg-current opacity-60" />
        </div>
      </div>
      <PatternLaneCell event={event} index={index} count={count} block={block} shownBeats={shownBeats} />
    </li>
  );
}

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
  const btn = 'rounded-full border border-fg px-3.5 py-1.5 text-base italic hover:bg-surface-2 aria-pressed:border-accent aria-pressed:text-accent';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" aria-label={`Actions for ${chordName(event.chord)}`}>
      <span className="text-lg font-medium">{chordName(event.chord)}</span>
      <label className="flex items-center gap-1 text-sm text-muted">
        Beats
        <NumberField
          min={1}
          max={BEATS_MAX}
          value={event.beats}
          onCommit={(n) => setEventBeats(event.id, n)}
          aria-label="Beats for selected chord"
          className="w-16 rounded-none border-0 border-b border-fg bg-transparent px-2 py-1.5 text-base text-fg"
        />
      </label>
      <button
        onClick={() => setEventChord(event.id, toggleMajorMinor(event.chord, musicKey))}
        disabled={!canToggleMajorMinor(event.chord)}
        className={`${btn} disabled:opacity-40`}
      >
        {event.chord.quality === 'min' ? 'Make major' : 'Make minor'}
      </button>
      <button onClick={onFlavor} aria-pressed={flavorOpen} className={btn}>Flavor</button>
      <button onClick={onDetail} aria-pressed={detailOpen} className={btn}>Piano / guitar</button>
      <button onClick={onExplore} className={btn}>Explore guitar voicings</button>
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
      className={`rounded-none border border-dashed px-3 py-6 text-center text-base italic text-muted ${isOver ? 'border-accent bg-surface-2' : 'border-muted'}`}
    >
      Add chords from the map above, or drag one here.
    </p>
  );
}

function SectionBlock({ section, isOnly, navigate }: { section: Section; isOnly: boolean; navigate: Navigate }) {
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
  const makeVariantWithGenerator = useStore((s) => s.makeVariantWithGenerator);
  const [flavorId, setFlavorId] = useState<string | null>(null);
  const [variantOpen, setVariantOpen] = useState(false);
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
  const laneEventId = useStore((s) => s.laneEventId);
  const laneEvent = section.events.find((e) => e.id === laneEventId);
  const blocks = useMemo(() => patternBlocks(song, section.id), [song, section.id]);
  const toolbarEvent = laneEvent ? undefined : section.events.find((e) => e.id === selectedId);
  const flavorEvent = section.events.find((e) => e.id === flavorId && e.id === selectedId);
  const detailEvent = detailOpen ? toolbarEvent : undefined;
  const sourceSection = section.variantOf ? song.sections.find((s) => s.id === section.variantOf) : undefined;
  const jumpToSource = () => {
    setActiveSection(section.variantOf as string);
    document.getElementById(`section-${section.variantOf}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <section
      id={`section-${section.id}`}
      aria-label={`Section: ${section.name}`}
      onClick={() => setActiveSection(section.id)}
      className={`rounded-none border-t px-0 py-4 ${section.id === activeSectionId ? 'border-accent' : 'border-line'}`}
    >
      {sourceSection && (
        <p className="mb-2 text-xs text-muted" data-testid="variant-of">
          Variant of{' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              jumpToSource();
            }}
            className="underline hover:text-fg"
          >
            {sourceSection.name}
          </button>
          {section.variantLabel && ` · ${section.variantLabel}`}
        </p>
      )}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={section.name}
            onChange={(e) => renameSection(section.id, e.target.value)}
            aria-label="Section name"
            className="w-44 rounded-none border-0 border-b border-transparent bg-transparent px-1 text-2xl font-medium italic hover:border-line focus:border-fg"
          />
          {section.key && (
            <span className="font-mono text-xs text-muted" title="This section has its own key">
              Key: {keyLabel(section.key)}
            </span>
          )}
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                setVariantOpen(true);
              }}
              className="rounded-lg px-2 py-1 hover:bg-surface-2"
            >
              Make variant
            </button>
          )}
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
          <div className="flex gap-2">
          {/* Row labels, lined up with the chord blocks (h-28) and the pattern lane under them (mt-1 h-9). */}
          <div aria-hidden="true" className="w-12 shrink-0 font-mono text-[10px] uppercase leading-tight tracking-[0.12em] text-muted">
            <div className="flex h-28 items-center">Chords</div>
            <div className="mt-1 flex h-9 items-center" data-testid="pattern-lane-label">Strum pattern</div>
          </div>
          <ol className="timeline-scroll flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto overscroll-x-contain pb-3">
            {withOffsets.map(({ event, offset }, index) => (
              <ChordSlot
                key={event.id}
                event={event}
                sectionId={section.id}
                index={index}
                count={section.events.length}
                block={blocks.find((b) => index >= b.startIndex && index <= b.endIndex)!}
                barLength={barLength}
                cumulativeBeats={offset}
                active={event.id === activeId}
                playing={isPlaying && event.id === playingId}
                replacing={event.id === replaceTargetId}
              />
            ))}
          </ol>
          </div>
        </SortableContext>
      )}

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
      {variantOpen && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <VariantDialog
            sectionName={section.name}
            chords={section.events.map((e) => e.chord)}
            tuning={song.guitar.tuning}
            capo={song.guitar.capo}
            onClose={() => setVariantOpen(false)}
            onCreate={(generator: VariantGeneratorId, options: VariantOptions) => {
              makeVariantWithGenerator(section.id, generator, options);
              setVariantOpen(false);
            }}
          />
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
    <section aria-label="Arrangement" className="rounded-none border-t border-fg pt-3">
      <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Arrangement</h2>
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

function ArrangementChip({ id, name, onRemove }: { id: string; name: string; onRemove: () => void }) {
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
      className="flex items-center gap-1 rounded-none border-b border-fg py-0.5 pl-1 pr-1 text-base italic"
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
            <SectionBlock key={section.id} section={section} isOnly={song.sections.length === 1} navigate={navigate} />
          ))}
        </div>
      </DndContext>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_ADD.map((name) => (
          <button key={name} onClick={() => addSection(name)} className="rounded-full border border-fg px-4 py-1.5 text-base italic hover:bg-surface-2">
            + {name}
          </button>
        ))}
        <button onClick={() => addSection('Custom')} className="rounded-full border border-fg px-4 py-1.5 text-base italic hover:bg-surface-2">
          + Custom section
        </button>
      </div>

      <ArrangementRow />
    </div>
  );
}
