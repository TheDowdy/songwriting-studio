import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { keyLabel, patternBlocks, type Section } from '@sw/core';
import { VariantDialog } from '@sw/ui';
import { ChordBlock } from './ChordBlock';
import { useStripHost } from './host';

/** The placeholder for a section with no chords: a place to drop one from another section. */
export function EmptySectionDrop({ sectionId }: { sectionId: string }) {
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

/**
 * One section of the song: its name, repeat count and actions, then its chords as a lane (with the
 * strum pattern lane under them), then whatever the workspace shows under it (`renderSectionFooter`).
 */
export function SectionLane({ section, isOnly }: { section: Section; isOnly: boolean }) {
  const host = useStripHost();
  const { song } = host;
  const [variantOpen, setVariantOpen] = useState(false);
  const inline = host.layout === 'inline';
  const [menuOpen, setMenuOpen] = useState(false);

  const playingId = host.playing ? host.playingEventId : null;
  const activeId = playingId ?? host.selectedEventId;
  const barLength = song.timeSig.beats;
  let cumulative = 0;
  const withOffsets = section.events.map((event) => {
    const offset = cumulative;
    cumulative += event.beats;
    return { event, offset };
  });
  const blocks = useMemo(() => patternBlocks(song, section.id), [song, section.id]);
  const sourceSection = section.variantOf ? song.sections.find((s) => s.id === section.variantOf) : undefined;
  const jumpToSource = () => {
    if (host.onJumpToSource) host.onJumpToSource(section.variantOf as string);
    else {
      host.setActiveSection(section.variantOf as string);
      document.getElementById(`section-${section.variantOf}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <section
      id={`section-${section.id}`}
      aria-label={`Section: ${section.name}`}
      onClick={() => host.setActiveSection(section.id)}
      className={`rounded-none border-t ${inline ? 'shrink-0 px-0 py-2' : 'px-0 py-4'} ${section.id === host.activeSectionId ? 'border-accent' : 'border-line'}`}
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
            onChange={(e) => host.renameSection(section.id, e.target.value)}
            aria-label="Section name"
            className={`rounded-none border-0 border-b border-transparent bg-transparent px-1 font-medium italic hover:border-line focus:border-fg ${inline ? 'w-32 text-lg' : 'w-44 text-2xl'}`}
          />
          {section.key && (
            <span className="font-mono text-xs text-muted" title="This section has its own key">
              Key: {keyLabel(section.key)}
            </span>
          )}
          <div className="flex items-center gap-1 text-sm text-muted">
            <button
              type="button"
              onClick={() => host.setSectionRepeat(section.id, section.repeat - 1)}
              aria-label="Fewer repeats"
              className="grid size-6 place-items-center rounded-lg hover:bg-surface-2"
            >
              –
            </button>
            <span aria-label="Repeat count">×{section.repeat}</span>
            <button
              type="button"
              onClick={() => host.setSectionRepeat(section.id, section.repeat + 1)}
              aria-label="More repeats"
              className="grid size-6 place-items-center rounded-lg hover:bg-surface-2"
            >
              +
            </button>
          </div>
        </div>
        {inline && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-expanded={menuOpen}
            aria-label={`Section actions for ${section.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
          >
            ⋯
          </button>
        )}
        {(!inline || menuOpen) && (
        <div className={`flex items-center gap-1 text-sm text-muted ${inline ? 'basis-full flex-wrap' : ''}`}>
          <button type="button" onClick={() => host.duplicateSection(section.id)} className="rounded-lg px-2 py-1 hover:bg-surface-2">
            Duplicate section
          </button>
          {section.events.length > 0 && (
            <button
              type="button"
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
            <button type="button" onClick={() => host.clearSection(section.id)} className="rounded-lg px-2 py-1 hover:bg-surface-2">
              Clear
            </button>
          )}
          {!isOnly && (
            <button type="button" onClick={() => host.removeSection(section.id)} aria-label={`Delete ${section.name}`} className="rounded-lg px-2 py-1 hover:bg-surface-2">
              Delete
            </button>
          )}
        </div>
        )}
      </div>

      {section.events.length === 0 ? (
        (host.renderEmpty?.(section) ?? <EmptySectionDrop sectionId={section.id} />)
      ) : (
        <SortableContext items={section.events.map((e) => e.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-2">
            {/* Row labels, lined up with the chord blocks and the pattern lane under them. */}
            {host.showLane && !inline && (
              <div aria-hidden="true" className="w-12 shrink-0 font-mono text-[10px] uppercase leading-tight tracking-[0.12em] text-muted">
                <div className={`flex items-center ${host.density === 'compact' ? 'h-24' : 'h-28'}`}>Chords</div>
                <div className="mt-1 flex h-9 items-center" data-testid="pattern-lane-label">
                  Strum pattern
                </div>
              </div>
            )}
            <ol className={`flex min-w-0 gap-2 ${inline ? 'pb-1' : 'timeline-scroll flex-1 snap-x overflow-x-auto overscroll-x-contain pb-3'}`}>
              {withOffsets.map(({ event, offset }, index) => (
                <ChordBlock
                  key={event.id}
                  event={event}
                  sectionId={section.id}
                  index={index}
                  count={section.events.length}
                  block={blocks.find((b) => index >= b.startIndex && index <= b.endIndex)!}
                  barLength={barLength}
                  cumulativeBeats={offset}
                  active={event.id === activeId}
                  playing={host.playing && event.id === playingId}
                  replacing={event.id === host.replaceTargetId}
                />
              ))}
            </ol>
          </div>
        </SortableContext>
      )}

      {host.renderSectionFooter?.(section)}
      {variantOpen && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <VariantDialog
            sectionName={section.name}
            chords={section.events.map((e) => e.chord)}
            tuning={song.guitar.tuning}
            capo={song.guitar.capo}
            onClose={() => setVariantOpen(false)}
            onCreate={(generator, options) => {
              host.makeVariant(section.id, generator, options);
              setVariantOpen(false);
            }}
          />
        </div>
      )}
    </section>
  );
}
