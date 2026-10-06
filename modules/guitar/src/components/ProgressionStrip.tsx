import { useEffect, useRef, useState } from 'react';
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
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { chordName, chordStrokes, chroma, voicingStatus, type ChordEvent, type Section, type Song, type VariantGeneratorId, type VariantOptions } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { useSong } from '@sw/song-store/react';
import { blockWidth, sectionsInOrder } from '@sw/timeline';
import { ChordDiagram, VariantDialog } from '@sw/ui';
import { addSection, duplicateSection, focusAndPlay, makeSectionVariant, renameSection, reorderChord } from '../state/progressionEdits';
import { centreWithin } from '../state/scrollWithin';
import { useStore } from '../state/store';

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

/** On touch, a block only starts dragging after a short press-and-hold (the progression module's
 *  own delay), so a plain swipe over the strip still scrolls it. */
const TOUCH_DRAG = { activationConstraint: { delay: 250, tolerance: 8 } };
/** With a mouse, a click stays a click until the pointer has moved a few pixels. */
const MOUSE_DRAG = { activationConstraint: { distance: 6 } };

/** A block's sortable id: sections show once each, so the section id keeps ids unique. */
const blockId = (sectionId: string, eventId: string) => `${sectionId}:${eventId}`;

/**
 * One chord block. A committed voicing (§3.2) shows its mini diagram, or a warning in its place if
 * it no longer fits (Phase 4 items 4–5). A chord with no committed voicing plays its suggested
 * shape and says so (Phase 6 item 2). Clicking focuses and sounds exactly what the neck then
 * shows; press-and-hold (or drag with a mouse) reorders it within its section (Phase 6 item 1).
 */
function StripChord({ sectionId, event, song, selected }: { sectionId: string; event: ChordEvent; song: Song; selected: boolean }) {
  const playing = useStore((s) => s.progressionPlaying && s.progressionEventId === event.id);
  const playingBeat = useStore((s) => (playing ? s.progressionBeat : -1));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: blockId(sectionId, event.id),
  });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Follow playback: keep the sounding chord centred in the strip (the strip only — the page stays put).
  useEffect(() => {
    if (playing) centreWithin(buttonRef.current?.closest('.strip-scroll') ?? null, buttonRef.current);
  }, [playing]);
  const voicing = event.attachments?.guitar;
  const stale = voicing ? voicingStatus(event, song) !== 'ok' : false;
  // A chord with one of the song's own strum patterns shows its strokes in order, as arrows.
  const strokes = chordStrokes(song, event.id);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <button
        {...attributes}
        {...listeners}
        ref={buttonRef}
        type="button"
        className={`strip-chord${stale ? ' stale' : ''}${voicing ? '' : ' uncommitted'}${playing ? ' sounding' : ''}`}
        aria-pressed={selected}
        aria-label={`Chord: ${chordName(event.chord)}, ${event.chord.numeral}, ${event.chord.origin}, ${event.beats} ${event.beats === 1 ? 'beat' : 'beats'}${
          voicing ? (stale ? ', voicing needs a re-fit' : ', voicing committed') : ', no voicing committed (plays the suggested shape)'
        }`}
        style={{
          // Width follows the chord's length in beats (compact density), with a readable minimum.
          width: blockWidth(event.beats, 'compact'),
          backgroundColor: ORIGIN_TINT[event.chord.origin],
          borderColor: ORIGIN_COLOR[event.chord.origin],
        }}
        onClick={() => focusAndPlay(event.id)}
      >
        <span className="strip-chord-name">{chordName(event.chord)}</span>
        <span className="strip-chord-numeral">{event.chord.numeral}</span>
        {voicing && (
          <span className="strip-chord-diagram">
            {/* A stale voicing shows a warning in place of its old shape, as in the progression
                module's timeline (owner's call). */}
            {stale ? (
              <span className="strip-chord-stale-badge" aria-hidden="true">
                ⚠
              </span>
            ) : (
              <ChordDiagram
                frets={voicing.frets}
                tuning={capoedTuning(voicing.tuning, voicing.capo)}
                rootPc={chroma(event.chord.root)}
                size="mini"
              />
            )}
          </span>
        )}
        {/* One slash per beat, as in a lead sheet (a long chord shows its count instead). With a
            custom strum pattern, the strokes themselves: down and up arrows, smaller if partial. */}
        <span className="strip-chord-beats" aria-hidden="true" title={`${event.beats} ${event.beats === 1 ? 'beat' : 'beats'}`}>
          {strokes ? (
            strokes.length <= 8 ? (
              strokes.map((hit, i) => (
                <b key={i} className={`strip-stroke${hit.step.extent === 'full' ? '' : ' partial'}${hit.step.stroke === 'up' ? ' up' : ''}${hit.step.accent ? ' accent' : ''}`}>
                  {hit.step.stroke === 'down' ? '↓' : '↑'}
                </b>
              ))
            ) : (
              `${strokes.length} strokes`
            )
          ) : (
            Array.from({ length: Math.min(event.beats, 16) }, (_, i) => <i key={i} className={`strip-slash${i === playingBeat ? ' now' : ''}`} />)
          )}
        </span>
      </button>
    </li>
  );
}

/** A section's name, renamed in place (Phase 6 item 1: section rename). */
function SectionName({ section }: { section: Section }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  if (editing) {
    return (
      <input
        autoFocus
        className="strip-section-input"
        aria-label="Section name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          renameSection(section.id, draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(section.name);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="strip-section-name"
      title="Rename this section"
      onClick={() => {
        setDraft(section.name);
        setEditing(true);
      }}
    >
      {section.name}
      {section.repeat > 1 && <span className="strip-section-repeat"> ×{section.repeat}</span>}
    </button>
  );
}

/** "Variant of X" (Phase 8 item 3): a link back to the source section. Jumping to it scrolls the
 *  strip to that section's block, the same way the progression module's own link does. */
function VariantOf({ section, sourceName }: { section: Section; sourceName: string }) {
  const jump = () => document.getElementById(`strip-section-${section.variantOf}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
  return (
    <p className="strip-variant-of" data-testid="strip-variant-of">
      Variant of{' '}
      <button type="button" onClick={jump} className="strip-variant-link">
        {sourceName}
      </button>
      {section.variantLabel && ` · ${section.variantLabel}`}
    </p>
  );
}

/**
 * The progression strip (§7 Phase 3 item 2, editable since Phase 6): each section once, in the
 * order the song first plays it (a repeat count on the name; the shell's Song order row above shows the
 * playing order, with the section being played highlighted), with rename/duplicate on
 * each section, "+ Section" at the end, and "+ Add chord" in an empty section. The arrangement
 * itself stays editable only in the progression module. Horizontally scrollable so a long song
 * stays compact.
 */
export function ProgressionStrip() {
  const song = useSong((s) => s.currentSong());
  const progressionEventId = useStore((s) => s.progressionEventId);
  const addSectionId = useStore((s) => s.stripAddSectionId);
  const [variantSectionId, setVariantSectionId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_DRAG),
    useSensor(TouchSensor, TOUCH_DRAG),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!song) return null;
  // Each section once, in the order the song first plays it, a variant right after its source.
  const sections = sectionsInOrder(song);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const [fromSection, fromId] = String(active.id).split(':');
    const [toSection, toId] = String(over.id).split(':');
    if (fromSection !== toSection) return; // reorder within a section only
    const section = sections.find((x) => x.id === fromSection);
    if (!section) return;
    const from = section.events.findIndex((e) => e.id === fromId);
    const to = section.events.findIndex((e) => e.id === toId);
    if (from >= 0 && to >= 0) reorderChord(section.id, from, to);
  };

  const hasChords = song.sections.some((s) => s.events.length > 0);

  return (
    <section className="progression-strip" aria-label="Progression">
      {!hasChords && <p className="muted">This song has no chords yet — pick one below to start.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <ol className="strip-scroll">
          {sections.map((section) => {
            const sourceSection = section.variantOf ? song.sections.find((s) => s.id === section.variantOf) : undefined;
            return (
            <li key={section.id} className="strip-group" id={`strip-section-${section.id}`}>
              <span className="strip-group-head">
                <SectionName section={section} />
                <button
                  type="button"
                  className="strip-section-action"
                  aria-label={`Duplicate ${section.name}`}
                  title="Duplicate this section"
                  onClick={() => duplicateSection(section.id)}
                >
                  ⧉
                </button>
                {section.events.length > 0 && (
                  <button
                    type="button"
                    className="strip-section-action"
                    aria-label={`Make a variant of ${section.name}`}
                    title="Make a variant of this section"
                    onClick={() => setVariantSectionId(section.id)}
                  >
                    ⎘
                  </button>
                )}
              </span>
              {sourceSection && <VariantOf section={section} sourceName={sourceSection.name} />}
              <SortableContext
                items={section.events.map((e) => blockId(section.id, e.id))}
                strategy={horizontalListSortingStrategy}
              >
                <ol className="strip-chords">
                  {section.events.map((event) => (
                    <StripChord
                      key={blockId(section.id, event.id)}
                      sectionId={section.id}
                      event={event}
                      song={song}
                      selected={event.id === progressionEventId}
                    />
                  ))}
                  {section.events.length === 0 && hasChords && (
                    <li>
                      <button
                        type="button"
                        className="strip-add-chord"
                        aria-pressed={addSectionId === section.id}
                        onClick={() => useStore.getState().setStripAddSectionId(section.id)}
                      >
                        + Add chord
                      </button>
                    </li>
                  )}
                </ol>
              </SortableContext>
            </li>
            );
          })}
          <li className="strip-group strip-group-new">
            <button type="button" className="strip-add-section" onClick={() => addSection()}>
              + Section
            </button>
          </li>
        </ol>
      </DndContext>
      {variantSectionId && (
        <VariantDialog
          sectionName={sections.find((x) => x.id === variantSectionId)?.name ?? ''}
          chords={(sections.find((x) => x.id === variantSectionId)?.events ?? []).map((e) => e.chord)}
          tuning={song.guitar.tuning}
          capo={song.guitar.capo}
          onClose={() => setVariantSectionId(null)}
          onCreate={(generator: VariantGeneratorId, options: VariantOptions) => {
            makeSectionVariant(variantSectionId, generator, options);
            setVariantSectionId(null);
          }}
        />
      )}
    </section>
  );
}
