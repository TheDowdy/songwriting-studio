import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BEATS_MAX, chordName, chordStrokes, chroma, voicingStatus, type ChordEvent, type PatternBlock } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { ChordDiagram } from '@sw/ui';
import { blockWidth, unitPx } from '../layout';
import { PatternLaneCell } from './PatternLane';
import { useStripHost } from './host';

const ORIGIN_COLOR = {
  diatonic: 'var(--c-diatonic)',
  borrowed: 'var(--c-borrowed)',
  secondary: 'var(--c-secondary)',
};

/**
 * One chord in a section's lane (with its strum pattern cell under it). Its width follows its
 * length in beats; the slashes mark the beats, and the red one moves with the sound. A committed
 * guitar voicing shows as a mini diagram, or a warning when it no longer fits. Drag the right
 * edge (or use the arrow keys) to change its length; press and hold to move it.
 */
export function ChordBlock({
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
  const host = useStripHost();
  const { song, density, showLane, showVoicingState } = host;
  const compact = density === 'compact';
  // Which slash is sounding: it moves through the chord's beats while playing.
  const playingBeat = playing ? host.playingBeat : -1;
  const voicing = event.attachments?.guitar;
  const stale = voicing ? voicingStatus(event, song) !== 'ok' : false;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: event.id,
    data: { sectionId },
  });
  const isBarStart = cumulativeBeats % barLength === 0;
  const [resizeBeats, setResizeBeats] = useState<number | null>(null);
  const shownBeats = resizeBeats ?? event.beats;
  const unit = unitPx(shownBeats, density);
  // With no lane, a chord with its own strum pattern shows the strokes themselves in its block.
  const strokes = !showLane ? chordStrokes(song, event.id, shownBeats) : null;

  // When this chord becomes the selected one (just added, or picked), scroll its row sideways so
  // it's in view. Only the row scrolls, never the page, so adding from the map doesn't jump the window.
  const itemRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const li = itemRef.current;
    const row = li?.closest<HTMLElement>('.timeline-scroll');
    if (!(active || playing) || !li || !row) return;
    const left = li.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    const right = left + li.offsetWidth;
    const pad = 16;
    let to: number | null = null;
    if (left < row.scrollLeft) to = left - pad;
    else if (right > row.scrollLeft + row.clientWidth) to = right - row.clientWidth + pad;
    if (to === null) return;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: Math.max(0, to), behavior: smooth ? 'smooth' : 'auto' });
  }, [active, playing]);

  // Drag the right edge: width maps straight to a beat count, computed from the pointer's
  // absolute position at drag start, so it never depends on a previous render's value.
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startBeats = event.beats;
    const beatsAt = (clientX: number) => Math.max(1, Math.round(startBeats + (clientX - startX) / unit));
    const move = (ev: PointerEvent) => {
      const b = beatsAt(ev.clientX);
      setResizeBeats(b);
      host.setBeats(event.id, b);
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
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') host.setBeats(event.id, event.beats + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') host.setBeats(event.id, event.beats - 1);
    else return;
    e.preventDefault();
  };

  const origin = ORIGIN_COLOR[event.chord.origin];
  const voicingNote = voicing ? (stale ? ', guitar voicing needs a re-fit' : ', guitar voicing committed') : (host.noVoicingText ?? '');
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
        className={`relative shrink-0 overflow-hidden rounded-none border-b-2 border-l border-l-fg text-center transition-colors ${compact ? 'h-24' : 'h-28'} ${
          active ? 'shadow-[inset_0_0_0_1.5px_var(--accent)]' : ''} ${replacing ? 'ring-2 ring-offset-1 ring-[var(--accent)]' : ''}`}
        style={{
          width: blockWidth(shownBeats, density),
          borderBottomColor: origin,
          borderBottomStyle: showVoicingState && !voicing ? 'dashed' : 'solid',
          backgroundColor: playing ? 'var(--t-diatonic)' : 'transparent',
          // faint tick at every beat boundary, so the block reads as a length
          backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${unit - 1}px, var(--line) ${unit - 1}px, var(--line) ${unit}px)`,
        }}
      >
        <button
          type="button"
          onClick={() => host.selectEvent(event)}
          {...attributes}
          {...listeners}
          aria-pressed={active}
          aria-label={`Chord: ${chordName(event.chord)}, ${event.chord.numeral}, ${event.beats} beats${voicingNote}`}
          className={`absolute inset-0 flex flex-col items-center justify-center pr-3 ${compact ? 'pb-6' : 'pb-7'}`}
        >
          <span className={`${compact ? 'text-xl' : 'text-2xl'} font-medium leading-tight`} style={{ color: origin }}>
            {chordName(event.chord)}
          </span>
          <span className={`font-mono text-xs ${playing ? '' : 'text-muted'}`}>{event.chord.numeral}</span>
          {voicing ? (
            <span className="mt-0.5 flex items-center gap-1.5">
              {/* A stale voicing no longer shows its old shape (the diagram was misleading next to a
                  changed chord) — a warning takes its place until it's re-fit. */}
              {stale ? (
                <span className="block-stale" aria-hidden="true" title="This guitar voicing no longer fits: re-fit it in the guitar workspace">
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
            slash for the beat that is sounding turns red pencil, and the red moves along as the chord
            plays. (The exact count is in the button's label and the length slider.) With a custom
            strum pattern and no lane, its strokes take the slashes' place. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-center ${compact ? 'h-6' : 'h-7'}`}
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 5px, var(--line) 5px, var(--line) 6px)' }}
        >
          {strokes
            ? strokes.map((hit, i) => (
                <span
                  key={i}
                  data-stroke
                  className="absolute bottom-0.5 -translate-x-1/2 font-mono leading-none"
                  title={`${hit.step.stroke === 'down' ? 'Down' : 'Up'} strum${hit.step.extent === 'full' ? '' : ', ' + hit.step.extent + ' strings'}`}
                  style={{
                    left: hit.offsetBeats * unit + unit / 2,
                    fontSize: hit.step.extent === 'full' ? 15 : 11,
                    fontWeight: hit.step.accent ? 800 : 500,
                    color: 'var(--fg)',
                    opacity: hit.step.stroke === 'up' ? 0.7 : 1,
                  }}
                >
                  {hit.step.stroke === 'down' ? '↓' : '↑'}
                </span>
              ))
            : Array.from({ length: Math.min(shownBeats, 32) }, (_, i) => (
                <span key={i} className="flex shrink-0 justify-center" style={{ width: unit }}>
                  <span
                    className="block h-4 w-0.5"
                    style={{
                      transform: 'skewX(-28deg)',
                      background: i === playingBeat ? 'var(--play)' : 'var(--fg)',
                      opacity: i === playingBeat ? 1 : 0.7,
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
          className="absolute right-0 top-0 flex h-full w-6 cursor-ew-resize touch-none items-center justify-center hover:bg-surface-2"
        >
          <span className="h-6 w-0.5 rounded bg-current opacity-60" />
        </div>
      </div>
      {showLane && <PatternLaneCell event={event} index={index} count={count} block={block} shownBeats={shownBeats} />}
    </li>
  );
}
