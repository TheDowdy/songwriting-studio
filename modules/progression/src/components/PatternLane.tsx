import { useEffect, useRef } from 'react';
import {
  STRUM_PRESETS,
  blockOf,
  chordName,
  chordStrokes,
  customPatternId,
  emptyStrumPattern,
  findStrumPattern,
  newId,
  patternLabel,
  patternOptions,
  strumPatternFromPreset,
} from '@sw/core';
import type { ChordEvent, PatternBlock, Section } from '@sw/core';
import { PatternEditor, PatternSelect } from '@sw/ui';
import { previewStrumPattern } from '../state/playback';
import { useStore } from '../state/store';
import { BEAT_PX } from './timelineConstants';

/** A keyboard resize moves the handle to another chord's cell; the new handle takes focus back. */
let refocusHandle = false;

/** Half the gap between chord blocks: a cell that isn't the last of its block reaches across it. */
const GAP_PX = 8;

/**
 * One chord's slice of the strum pattern lane, drawn under its chord block. Neighbouring cells with
 * the same pattern join into one bar (a *block*); the block's name sits in its first cell and the
 * strokes of a custom pattern run across all of them, continuing from cell to cell.
 */
export function PatternLaneCell({
  event,
  index,
  count,
  block,
  shownBeats,
}: {
  event: ChordEvent;
  index: number;
  count: number;
  block: PatternBlock;
  shownBeats: number;
}) {
  const song = useStore((s) => s.song);
  const selectedBlock = useStore((s) => s.laneEventId !== null && block.eventIds.includes(s.laneEventId));
  const setLaneEvent = useStore((s) => s.setLaneEvent);
  const setBlockLength = useStore((s) => s.setBlockLength);
  const setBlockPattern = useStore((s) => s.setBlockPattern);

  const own = block.own;
  const first = index === block.startIndex;
  const last = index === block.endIndex;
  const label = patternLabel(song, block.patternId);
  const strokes = chordStrokes(song, event.id, shownBeats);
  const blockChords = block.endIndex - block.startIndex + 1;
  const anchor = block.eventIds[0]!;

  const setLength = (chords: number) => {
    setBlockLength(anchor, chords);
    // Shrinking can free the chord that was selected; keep the toolbar on this block.
    useStore.setState({ laneEventId: anchor });
  };

  // Drag the diamond: the block ends at the last chord whose middle is left of the pointer.
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const row = e.currentTarget.closest<HTMLElement>('.timeline-scroll');
    if (!row) return;
    let current = blockChords;
    useStore.setState({ laneEventId: anchor });
    const move = (ev: PointerEvent) => {
      const cells = Array.from(row.querySelectorAll<HTMLElement>('[data-lane-cell]'));
      let end = block.startIndex;
      for (let i = block.startIndex; i < cells.length; i++) {
        const r = cells[i]!.getBoundingClientRect();
        if (r.left + r.width / 2 < ev.clientX) end = i;
        else break;
      }
      const chords = end - block.startIndex + 1;
      if (chords !== current) {
        current = chords;
        setBlockLength(anchor, chords);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const handleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (refocusHandle && last && own) {
      refocusHandle = false;
      handleRef.current?.focus();
    }
  });

  const onHandleKey = (e: React.KeyboardEvent) => {
    const max = count - block.startIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setLength(Math.min(max, blockChords + 1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setLength(Math.max(1, blockChords - 1));
    else if (e.key === 'Home') setLength(1);
    else if (e.key === 'End') setLength(max);
    else return;
    refocusHandle = true;
    e.preventDefault();
  };

  const edge = (on: boolean) => (on ? 1 : 0);
  return (
    <div
      data-lane-cell
      data-block-start={first || undefined}
      data-block-end={last || undefined}
      className="relative mt-1 h-9"
      style={{ width: shownBeats * BEAT_PX + (last ? 0 : GAP_PX), marginRight: last ? 0 : -GAP_PX }}
    >
      <button
        type="button"
        aria-pressed={selectedBlock}
        aria-label={`Pattern for ${chordName(event.chord)} (chord ${index + 1} of ${count}): ${own ? '' : 'song default, '}${label}`}
        onClick={() => setLaneEvent(event.id)}
        onKeyDown={(e) => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && own) {
            e.preventDefault();
            setBlockPattern(event.id, null);
          }
        }}
        className={`absolute inset-0 overflow-hidden text-left ${own ? 'bg-surface-2' : 'text-muted'}`}
        style={{
          borderStyle: own ? 'solid' : 'dashed',
          borderColor: own ? 'var(--fg)' : 'var(--muted)',
          borderWidth: `1px ${edge(last)}px 1px ${edge(first)}px`,
          boxShadow: selectedBlock ? 'inset 0 0 0 1.5px var(--accent)' : undefined,
        }}
      >
        {first && (
          <span className="absolute left-1 top-0.5 max-w-full truncate pr-6 font-mono text-[10px] leading-none" aria-hidden="true">
            {own ? label : `Song default · ${label}`}
          </span>
        )}
        {strokes?.map((hit, i) => (
          <span
            key={i}
            data-stroke
            aria-hidden="true"
            className="absolute bottom-0.5 -translate-x-1/2 font-mono leading-none"
            title={`${hit.step.stroke === 'down' ? 'Down' : 'Up'} strum${hit.step.extent === 'full' ? '' : ', ' + hit.step.extent + ' strings'}`}
            style={{
              left: hit.offsetBeats * BEAT_PX + BEAT_PX / 2,
              fontSize: hit.step.extent === 'full' ? 15 : 11,
              fontWeight: hit.step.accent ? 800 : 500,
              color: 'var(--fg)',
              opacity: !own ? 0.55 : hit.step.stroke === 'up' ? 0.7 : 1,
            }}
          >
            {hit.step.stroke === 'down' ? '↓' : '↑'}
          </span>
        ))}
      </button>
      {last && own && (
        <div
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-label={`Chords in ${label} block`}
          aria-valuemin={1}
          aria-valuemax={count - block.startIndex}
          aria-valuenow={blockChords}
          onPointerDown={onHandleDown}
          onKeyDown={onHandleKey}
          className="absolute right-0 top-0 flex h-full w-6 cursor-ew-resize touch-none items-center justify-center text-[11px] hover:bg-surface-2"
        >
          <span aria-hidden="true">◆</span>
        </div>
      )}
    </div>
  );
}

/** Options for the selected pattern block, shown under its section in place of the chord's options. */
export function PatternBlockToolbar({ section, eventId }: { section: Section; eventId: string }) {
  const song = useStore((s) => s.song);
  const patternEditorOpen = useStore((s) => s.patternEditorOpen);
  const setPatternEditorOpen = useStore((s) => s.setPatternEditorOpen);
  const setLaneEvent = useStore((s) => s.setLaneEvent);
  const setBlockPattern = useStore((s) => s.setBlockPattern);
  const setBlockLength = useStore((s) => s.setBlockLength);
  const patternForChordOnly = useStore((s) => s.patternForChordOnly);
  const patternForSection = useStore((s) => s.patternForSection);
  const patternForSong = useStore((s) => s.patternForSong);
  const setPattern = useStore((s) => s.setPattern);
  const saveStrumPattern = useStore((s) => s.saveStrumPattern);
  const deleteStrumPattern = useStore((s) => s.deleteStrumPattern);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Below the desktop width the transport bar is pinned over the bottom of the page.
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [eventId]);

  // Escape closes the options wherever focus is (it often sits on a button that just disappeared).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setLaneEvent(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setLaneEvent]);

  const block = blockOf(song, eventId);
  const event = section.events.find((e) => e.id === eventId);
  if (!block || !event) return null;
  const own = block.own;
  // The pattern that actually plays, which may be the song default's, can be edited either way.
  const custom = findStrumPattern(song, block.patternId);
  const label = patternLabel(song, block.patternId);
  const from = section.events[block.startIndex]!;
  const to = section.events[block.endIndex]!;
  const chords = block.endIndex - block.startIndex + 1;
  const room = section.events.length - block.startIndex;
  const btn = 'rounded-full border border-fg px-3.5 py-1.5 text-base italic hover:bg-surface-2 disabled:opacity-40 aria-pressed:border-accent aria-pressed:text-accent';
  const anchor = block.eventIds[0]!;
  const resize = (n: number) => {
    setBlockLength(anchor, n);
    useStore.setState({ laneEventId: anchor });
  };

  const create = (start: string) => {
    const id = newId();
    const preset = STRUM_PRESETS.find((p) => p.name === start);
    saveStrumPattern(preset ? strumPatternFromPreset(id, preset) : emptyStrumPattern(id, 'New pattern'));
    setBlockPattern(eventId, customPatternId(id));
    setPatternEditorOpen(true);
  };

  const wholeSong = () => {
    if (!own) return;
    const others = song.sections.reduce((n, s) => n + s.events.filter((e) => e.pattern && !block.eventIds.includes(e.id)).length, 0);
    if (others > 0 && !confirm(`This replaces the patterns on ${others} other chord${others === 1 ? '' : 's'}.`)) return;
    patternForSong(own);
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Pattern block"
      className="mt-2 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-medium">
          {own ? `Pattern block: ${label}` : 'Song default'} · {chordName(from.chord)}
          {from.id !== to.id ? ` – ${chordName(to.chord)}` : ''}
        </span>
        <PatternSelect
          song={song}
          value={own}
          label="Block pattern"
          inheritLabel={`Song default (${patternLabel(song, song.pattern)})`}
          onChange={(id) => setBlockPattern(eventId, id)}
          onCreate={create}
        />
        {!own && (
          <label className="pb-field">
            <span>Song default</span>
            <select value={song.pattern} onChange={(e) => setPattern(e.target.value as typeof song.pattern)}>
              {patternOptions(song).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={() => setPatternEditorOpen(!patternEditorOpen)} disabled={!custom} aria-pressed={patternEditorOpen && !!custom} className={btn}>
          Edit pattern
        </button>
        {own && (
          <>
            <button type="button" onClick={() => resize(Math.max(1, chords - 1))} disabled={chords <= 1} className={btn}>
              − Shorter block
            </button>
            <button type="button" onClick={() => resize(Math.min(room, chords + 1))} disabled={chords >= room} className={btn}>
              + Longer block
            </button>
          </>
        )}
        <button type="button" onClick={() => setLaneEvent(null)} aria-label="Close pattern block" className={btn}>
          ×
        </button>
      </div>
      {own && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Use this pattern for">
          <span className="text-sm text-muted">Use it for</span>
          <button type="button" className={btn} onClick={() => patternForChordOnly(eventId)} disabled={chords <= 1}>
            Just this chord
          </button>
          <button type="button" className={btn} onClick={() => patternForSection(section.id, own)}>
            Whole section
          </button>
          <button type="button" className={btn} onClick={wholeSong}>
            Whole song
          </button>
          <button type="button" className={btn} onClick={() => setBlockPattern(eventId, null)}>
            Remove pattern
          </button>
        </div>
      )}
      {patternEditorOpen && custom && (
        <PatternEditor
          song={song}
          pattern={custom}
          onSave={saveStrumPattern}
          onDelete={deleteStrumPattern}
          onDuplicate={(copy) => {
            saveStrumPattern(copy);
            setBlockPattern(eventId, customPatternId(copy.id));
          }}
          onPreview={(p) => void previewStrumPattern(p, event.chord, event.attachments)}
        />
      )}
    </div>
  );
}
