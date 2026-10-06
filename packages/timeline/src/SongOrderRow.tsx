import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from 'zustand';
import type { Song } from '@sw/core';
import { songStore } from '@sw/song-store';
import { playhead } from './playhead';

/** The chip's text: the section's name, plus its variant label ("up the neck") if it has one. */
export function chipLabel(song: Song, sectionId: string): string {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section) return '?';
  return section.variantLabel ? `${section.name} · ${section.variantLabel}` : section.name;
}

interface Props {
  song: Song;
  /** A chip was pressed: scroll to that section. */
  onSelect?: (sectionId: string) => void;
  /** Let the viewer reorder, remove and add slots. `onAdded` runs after a section is added to the order. */
  editable?: { onAdded?: (sectionId: string) => void };
}

function Chip({
  id,
  song,
  slot,
  sectionId,
  family,
  playing,
  onSelect,
  editable,
}: {
  id: string;
  song: Song;
  slot: number;
  sectionId: string;
  family: number;
  playing: boolean;
  onSelect?: (sectionId: string) => void;
  editable: boolean;
}) {
  const section = song.sections.find((s) => s.id === sectionId);
  const sortable = useSortable({ id, disabled: !editable });
  const label = chipLabel(song, sectionId);
  return (
    <li
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.4 : 1 }}
      className="sw-order-item"
    >
      <button
        type="button"
        {...(editable ? sortable.attributes : {})}
        {...(editable ? sortable.listeners : {})}
        // dnd-kit's own role is 'button' on a drag handle; a plain button needs no extra role.
        role={undefined}
        className={`sw-order-chip${playing ? ' playing' : ''}${section?.variantOf ? ' variant' : ''}`}
        data-family={family}
        aria-current={playing ? 'step' : undefined}
        onClick={() => onSelect?.(sectionId)}
      >
        {label}
        {section && section.repeat > 1 && <span className="sw-order-repeat"> ×{section.repeat}</span>}
      </button>
      {editable && (
        <button
          type="button"
          className="sw-order-remove"
          aria-label={`Remove ${label} from arrangement`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => songStore.getState().removeArrangementSlot(slot)}
        >
          ×
        </button>
      )}
    </li>
  );
}

/**
 * The song's playing order as a row of chips (Verse · Chorus · Verse · Chorus …). The chip being
 * played is filled in the play colour and bold, like the red slash on the sounding beat. A variant
 * chip keeps its source section's colour tint and carries its label. Pressing a chip scrolls to its
 * section. Where editable, chips drag to reorder, each has a remove button, and the section buttons
 * at the end add a section to the order.
 */
export function SongOrderRow({ song, onSelect, editable }: Props) {
  const playingSlot = useStore(playhead, (s) => s.slot);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (song.arrangement.length === 0 && !editable) return null;
  // Tint chips by their family: a section and its variants share a tint index.
  const family = (sectionId: string) => {
    const s = song.sections.find((x) => x.id === sectionId);
    return s?.variantOf ?? s?.id ?? sectionId;
  };
  const families = [...new Set(song.arrangement.map(family))];
  const ids = song.arrangement.map((sectionId, slot) => `${sectionId}#${slot}`);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) songStore.getState().reorderArrangement(from, to);
  };

  return (
    <nav className="sw-order" aria-label="Song order">
      <span className="sw-order-title">Song order</span>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <ol className="sw-order-list">
            {song.arrangement.map((sectionId, slot) => (
              <Chip
                key={ids[slot]}
                id={ids[slot]!}
                song={song}
                slot={slot}
                sectionId={sectionId}
                family={families.indexOf(family(sectionId)) % 4}
                playing={playingSlot === slot}
                onSelect={onSelect}
                editable={!!editable}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {editable && (
        <div className="sw-order-add" role="group" aria-label="Add to the song order">
          {song.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className="sw-order-addbtn"
              aria-label={`Add ${s.name} to the song order`}
              onClick={() => {
                songStore.getState().addArrangementSlot(s.id);
                editable.onAdded?.(s.id);
              }}
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
