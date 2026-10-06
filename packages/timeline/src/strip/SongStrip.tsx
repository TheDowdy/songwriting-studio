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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SectionLane } from './SectionLane';
import { useStripHost } from './host';

/** On touch, a block only starts dragging after a short press-and-hold, so a plain swipe over it
 *  scrolls the lane instead of being swallowed by drag detection. */
const TOUCH_DRAG = { activationConstraint: { delay: 250, tolerance: 8 } };

const QUICK_ADD = ['Verse', 'Chorus', 'Bridge'];

/**
 * The song's sections, each as a lane of chords, with drag to reorder (within a section) or move
 * (between sections), and buttons to add a section. The same strip in every workspace.
 */
export function SongStrip() {
  const host = useStripHost();
  const { song } = host;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, TOUCH_DRAG),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sectionOf = (eventId: string) => song.sections.find((sec) => sec.events.some((e) => e.id === eventId));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
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
      if (fromIndex >= 0 && fromIndex !== toIndex) host.reorderEvents(fromSection, fromIndex, toIndex);
    } else {
      host.moveEvent(String(active.id), toSection, toIndex);
    }
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="space-y-3">
          {song.sections.map((section) => (
            <SectionLane key={section.id} section={section} isOnly={song.sections.length === 1} />
          ))}
        </div>
      </DndContext>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_ADD.map((name) => (
          <button type="button" key={name} onClick={() => host.addSection(name)} className="rounded-full border border-fg px-4 py-1.5 text-base italic hover:bg-surface-2">
            + {name}
          </button>
        ))}
        <button type="button" onClick={() => host.addSection('Custom')} className="rounded-full border border-fg px-4 py-1.5 text-base italic hover:bg-surface-2">
          + Custom section
        </button>
      </div>

      {host.renderAfterSections?.()}
    </div>
  );
}
