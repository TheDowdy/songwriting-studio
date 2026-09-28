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
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { chordName, chroma, voicingStatus, type ChordEvent, type Section, type Song } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { useSong } from '@sw/song-store/react';
import { ChordDiagram } from '@sw/ui';
import { addSection, duplicateSection, focusAndPlay, renameSection, reorderChord } from '../state/progressionEdits';
import { playProgression, stopProgression } from '../state/progressionPlayback';
import { undoLastGuitarChange } from '../state/undo';
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

/** A block's sortable id: the same chord shows once per arrangement slot its section fills. */
const blockId = (slot: number, eventId: string) => `${slot}:${eventId}`;

/**
 * One chord block. A committed voicing (§3.2) shows its mini diagram, or a warning in its place if
 * it no longer fits (Phase 4 items 4–5). A chord with no committed voicing plays its suggested
 * shape and says so (Phase 6 item 2). Clicking focuses and sounds exactly what the neck then
 * shows; press-and-hold (or drag with a mouse) reorders it within its section (Phase 6 item 1).
 */
function StripChord({ slot, event, song, selected }: { slot: number; event: ChordEvent; song: Song; selected: boolean }) {
  const playing = useStore((s) => s.progressionPlaying && s.progressionEventId === event.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: blockId(slot, event.id),
  });
  const voicing = event.attachments?.guitar;
  const stale = voicing ? voicingStatus(event, song) !== 'ok' : false;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className={`strip-chord${stale ? ' stale' : ''}${voicing ? '' : ' uncommitted'}${playing ? ' sounding' : ''}`}
        aria-pressed={selected}
        aria-label={`Chord: ${chordName(event.chord)}, ${event.chord.numeral}, ${event.chord.origin}${
          voicing ? (stale ? ', voicing needs a re-fit' : ', voicing committed') : ', no voicing committed (plays the suggested shape)'
        }`}
        style={{
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

/** Play the song or a section through the guitar synth (Phase 6 item 2), at the song's tempo; plus
 *  the re-voice panel's button when voicings no longer fit, and Undo (Phase 7 items 2–3). */
function Transport({ song, hasChords }: { song: Song; hasChords: boolean }) {
  const playing = useStore((s) => s.progressionPlaying);
  const loop = useStore((s) => s.progressionLoop);
  const undo = useStore((s) => s.guitarUndo);
  const revoiceOpen = useStore((s) => s.revoiceOpen);
  const bpm = song.bpm;
  let stale = 0;
  for (const section of song.sections) {
    for (const event of section.events) if (event.attachments?.guitar && voicingStatus(event, song) !== 'ok') stale++;
  }
  return (
    <div className="strip-transport" role="group" aria-label="Play the progression">
      {playing ? (
        <button type="button" className="button primary" onClick={() => stopProgression()}>
          ■ Stop
        </button>
      ) : (
        <>
          <button type="button" className="button primary" disabled={!hasChords} onClick={() => playProgression('song')}>
            ▶ Play song
          </button>
          <button
            type="button"
            className="button"
            disabled={!hasChords}
            title="Play the section of the selected chord"
            onClick={() => playProgression('section')}
          >
            ▶ Play section
          </button>
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => useStore.getState().setProgressionLoop(e.target.checked)}
        />
        <span>Loop</span>
      </label>
      <span className="muted strip-tempo">{bpm} BPM</span>
      <span className="strip-transport-end">
        {stale > 0 && (
          <button
            type="button"
            className="button revoice-button"
            aria-pressed={revoiceOpen}
            onClick={() => useStore.getState().setRevoiceOpen(!revoiceOpen)}
          >
            ⚠ Re-voice {stale} {stale === 1 ? 'chord' : 'chords'}
          </button>
        )}
        {undo && undo.songId === song.id && (
          <button type="button" className="button" onClick={() => undoLastGuitarChange()}>
            ↶ Undo {undo.label}
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The progression strip (§7 Phase 3 item 2, editable since Phase 6): each arrangement slot's
 * section in order, its chords shown once (a repeat count on the name), with rename/duplicate on
 * each section, "+ Section" at the end, and "+ Add chord" in an empty section. The arrangement
 * itself stays editable only in the progression module. Horizontally scrollable so a long song
 * stays compact.
 */
export function ProgressionStrip() {
  const song = useSong((s) => s.currentSong());
  const progressionEventId = useStore((s) => s.progressionEventId);
  const addSectionId = useStore((s) => s.stripAddSectionId);
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_DRAG),
    useSensor(TouchSensor, TOUCH_DRAG),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!song) return null;
  const slots = song.arrangement
    .map((sectionId, slot) => ({ slot, section: song.sections.find((s) => s.id === sectionId) }))
    .filter((x): x is { slot: number; section: Section } => !!x.section);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const [fromSlot, fromId] = String(active.id).split(':');
    const [toSlot, toId] = String(over.id).split(':');
    if (fromSlot !== toSlot) return; // reorder within a section only
    const section = slots.find((x) => String(x.slot) === fromSlot)?.section;
    if (!section) return;
    const from = section.events.findIndex((e) => e.id === fromId);
    const to = section.events.findIndex((e) => e.id === toId);
    if (from >= 0 && to >= 0) reorderChord(section.id, from, to);
  };

  const hasChords = song.sections.some((s) => s.events.length > 0);

  return (
    <section className="progression-strip" aria-label="Progression">
      <Transport song={song} hasChords={hasChords} />
      {!hasChords && <p className="muted">This song has no chords yet — pick one below to start.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <ol className="strip-scroll">
          {slots.map(({ slot, section }) => (
            <li key={slot} className="strip-group">
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
              </span>
              <SortableContext
                items={section.events.map((e) => blockId(slot, e.id))}
                strategy={horizontalListSortingStrategy}
              >
                <ol className="strip-chords">
                  {section.events.map((event) => (
                    <StripChord
                      key={blockId(slot, event.id)}
                      slot={slot}
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
          ))}
          <li className="strip-group strip-group-new">
            <button type="button" className="strip-add-section" onClick={() => addSection()}>
              + Section
            </button>
          </li>
        </ol>
      </DndContext>
    </section>
  );
}
