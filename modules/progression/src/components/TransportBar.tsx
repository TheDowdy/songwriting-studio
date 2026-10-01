import { useRef, useState } from 'react';
import { BPM_MAX, BPM_MIN, useStore } from '../state/store';
import { togglePlay } from '../state/playback';
import { flattenSong, patternOptions } from '@sw/core';
import type { InstrumentId, PatternId } from '@sw/core';

const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'epiano', label: 'Electric piano' },
  { id: 'pad', label: 'Pad' },
  { id: 'guitar', label: 'Guitar' },
];

const DENOMINATORS = [1, 2, 4, 8, 16] as const;
const TAP_TIMEOUT_MS = 2500;
const MIN_TAPS_FOR_BPM = 2;

function TapTempo() {
  const setBpm = useStore((s) => s.setBpm);
  const taps = useRef<number[]>([]);

  const tap = () => {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last !== undefined && now - last > TAP_TIMEOUT_MS) taps.current = [];
    taps.current.push(now);
    if (taps.current.length > 6) taps.current.shift();
    if (taps.current.length >= MIN_TAPS_FOR_BPM) {
      const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.round(60000 / avgMs));
    }
  };

  return (
    <button
      onClick={tap}
      aria-label="Tap tempo"
      className="h-10 rounded-full border border-fg px-4 text-base italic hover:bg-surface-2"
    >
      Tap
    </button>
  );
}

export default function TransportBar() {
  const [expanded, setExpanded] = useState(false);
  const bpm = useStore((s) => s.song.bpm);
  const timeSig = useStore((s) => s.song.timeSig);
  const instrument = useStore((s) => s.song.instrument);
  const pattern = useStore((s) => s.song.pattern);
  const songPatterns = useStore((s) => s.song.patterns);
  const patternsOpen = useStore((s) => s.patternsOpen);
  const setPatternsOpen = useStore((s) => s.setPatternsOpen);
  const loop = useStore((s) => s.loop);
  const loopScope = useStore((s) => s.loopScope);
  const metronome = useStore((s) => s.metronome);
  const volume = useStore((s) => s.volume);
  const isPlaying = useStore((s) => s.isPlaying);
  const hasChords = useStore((s) => flattenSong(s.song).length > 0);
  const setBpm = useStore((s) => s.setBpm);
  const setTimeSig = useStore((s) => s.setTimeSig);
  const setInstrument = useStore((s) => s.setInstrument);
  const setPattern = useStore((s) => s.setPattern);
  const setLoop = useStore((s) => s.setLoop);
  const setLoopScope = useStore((s) => s.setLoopScope);
  const setMetronome = useStore((s) => s.setMetronome);
  const setVolume = useStore((s) => s.setVolume);

  return (
    <div
      role="toolbar"
      aria-label="Playback"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-fg bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:border-y lg:bg-transparent lg:pb-3"
    >
      <div className="mx-auto max-w-3xl space-y-3 lg:max-w-none">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={togglePlay}
            disabled={!hasChords}
            aria-label={isPlaying ? 'Stop' : 'Play'}
            className="h-12 min-w-24 rounded-full bg-[var(--play)] px-6 text-lg font-medium italic text-[var(--play-fg)] disabled:opacity-40"
          >
            {isPlaying ? '■ Stop' : '▶ Play'}
          </button>

          <div role="group" aria-label="Loop" className="flex h-12 items-center gap-1 rounded-none text-base">
            <button
              role="switch"
              aria-checked={loop}
              aria-label="Loop"
              onClick={() => setLoop(!loop)}
              className="flex h-full items-center gap-2 px-3 italic hover:bg-surface-2"
            >
              Loop
              <span
                aria-hidden
                className={`relative h-5 w-9 rounded-full transition-colors ${loop ? 'bg-[var(--play)]' : 'bg-line'}`}
              >
                <span className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all ${loop ? 'left-[1.125rem]' : 'left-0.5'}`} />
              </span>
            </button>
            <span aria-hidden className="mx-0.5 h-6 w-px bg-line" />
            <div role="radiogroup" aria-label="What to loop" className={`flex h-full items-center gap-0.5 transition-opacity ${loop ? '' : 'opacity-40'}`}>
              {([['song', 'Whole song'], ['section', 'This section']] as const).map(([scope, label]) => (
                <button
                  key={scope}
                  role="radio"
                  aria-checked={loopScope === scope}
                  disabled={!loop}
                  onClick={() => setLoopScope(scope)}
                  className={`h-full px-3 italic ${loopScope === scope ? 'text-fg shadow-[inset_0_-1.5px_0_var(--fg)]' : 'text-muted hover:text-fg'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-[12rem] flex-1 items-center gap-2">
            <label htmlFor="bpm" className="text-base italic text-muted">
              Tempo
            </label>
            <input
              id="bpm-slider"
              aria-label="Tempo slider"
              type="range"
              min={BPM_MIN}
              max={BPM_MAX}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="h-8 min-w-0 flex-1 accent-[var(--accent)]"
            />
            <input
              id="bpm"
              type="number"
              inputMode="numeric"
              min={BPM_MIN}
              max={BPM_MAX}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="h-10 w-16 rounded-none border-0 border-b border-fg bg-transparent px-2 text-center"
            />
            <span className="text-base italic text-muted">BPM</span>
          </div>
          <TapTempo />

          <button
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            aria-label="More playback settings"
            className={`h-10 rounded-lg rounded-full border px-4 text-base italic ${expanded ? 'border-accent text-accent' : 'border-fg text-muted hover:bg-surface-2'}`}
          >
            {expanded ? 'Less ▴' : 'More ▾'}
          </button>
        </div>

        {expanded && (
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line pt-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Time signature</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={timeSig.beats}
                  onChange={(e) => setTimeSig({ ...timeSig, beats: Math.max(1, Math.min(32, Math.round(Number(e.target.value)) || timeSig.beats)) })}
                  aria-label="Beats per bar"
                  className="h-10 w-14 rounded-none border-0 border-b border-fg bg-transparent px-2 text-center"
                />
                <span className="text-muted">/</span>
                <select
                  value={timeSig.unit}
                  onChange={(e) => setTimeSig({ ...timeSig, unit: Number(e.target.value) as (typeof DENOMINATORS)[number] })}
                  aria-label="Beat unit"
                  className="h-10 rounded-none border-0 border-b border-fg bg-transparent px-2"
                >
                  {DENOMINATORS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="instrument" className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Instrument
              </label>
              <select
                id="instrument"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as InstrumentId)}
                className="h-10 rounded-none border-0 border-b border-fg bg-transparent px-2"
              >
                {INSTRUMENTS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pattern" className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Pattern
              </label>
              <select
                id="pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value as PatternId)}
                className="h-10 rounded-none border-0 border-b border-fg bg-transparent px-2"
              >
                {patternOptions({ patterns: songPatterns }).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setPatternsOpen(!patternsOpen)}
              aria-pressed={patternsOpen}
              className={`h-10 rounded-full border px-4 text-base italic ${patternsOpen ? 'border-accent text-accent' : 'border-fg text-muted hover:bg-surface-2'}`}
            >
              Strum patterns
            </button>

            <button
              onClick={() => setMetronome(!metronome)}
              aria-pressed={metronome}
              className={`h-10 rounded-full border px-4 text-base italic ${metronome ? 'border-accent text-fg' : 'border-fg text-muted'}`}
            >
              ⏱ Metronome {metronome ? 'on' : 'off'}
            </button>

            <div className="flex min-w-[10rem] items-center gap-2">
              <label htmlFor="volume" className="text-base italic text-muted">
                Volume
              </label>
              <input
                id="volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-8 min-w-0 flex-1 accent-[var(--accent)]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
