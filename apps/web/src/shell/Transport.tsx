import { useRef, useSyncExternalStore } from 'react';
import { useStore as useZustand } from 'zustand';
import { BPM_MAX, BPM_MIN, flattenSong } from '@sw/core';
import { useSong } from '@sw/song-store/react';
import { setLoop, setScope, transportSettings, type PlaybackAdapter } from '@sw/timeline';
import { NumberField, useSpaceBarToggle } from '@sw/ui';
import type { ComponentType } from 'react';

const TAP_TIMEOUT_MS = 2500;
const MIN_TAPS_FOR_BPM = 2;

function TapTempo({ onBpm }: { onBpm: (bpm: number) => void }) {
  const taps = useRef<number[]>([]);
  const tap = () => {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last !== undefined && now - last > TAP_TIMEOUT_MS) taps.current = [];
    taps.current.push(now);
    if (taps.current.length > 6) taps.current.shift();
    if (taps.current.length >= MIN_TAPS_FOR_BPM) {
      const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i]!);
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      onBpm(Math.round(60000 / avgMs));
    }
  };
  return (
    <button
      type="button"
      onClick={tap}
      aria-label="Tap tempo"
      className="h-10 rounded-full border border-fg px-4 text-base italic hover:bg-surface-2"
    >
      Tap
    </button>
  );
}

interface Props {
  playback: PlaybackAdapter;
  /** The active module's own transport controls. */
  Extras?: ComponentType;
}

/**
 * The one transport (play, loop, tempo) for every workspace in a song. It stays put when you switch
 * between Chords and Guitar; what actually sounds is the active module's engine, through its
 * `PlaybackAdapter`. The space bar toggles it from anywhere (see `useSpaceBarToggle`).
 */
export function Transport({ playback, Extras }: Props) {
  const song = useSong((s) => s.currentSong());
  const setBpm = useSong((s) => s.setBpm);
  const { loop, scope } = useZustand(transportSettings);
  const playing = useSyncExternalStore(playback.subscribe, playback.isPlaying, () => false);
  const hasChords = song ? flattenSong(song).length > 0 : false;
  const toggle = () => (playback.isPlaying() ? playback.stop() : playback.play());
  useSpaceBarToggle(toggle, hasChords || playing);
  if (!song) return null;
  const bpm = song.bpm;

  return (
    <div
      role="toolbar"
      aria-label="Playback"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-fg bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:border-y lg:bg-transparent lg:pb-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!hasChords && !playing}
          aria-label={playing ? 'Stop' : 'Play'}
          className="h-12 min-w-24 rounded-full bg-[var(--play)] px-6 text-lg font-medium italic text-[var(--play-fg)] disabled:opacity-40"
        >
          {playing ? '■ Stop' : '▶ Play'}
        </button>

        <div role="group" aria-label="Loop" className="flex h-12 items-center gap-1 rounded-none text-base">
          <button
            type="button"
            role="switch"
            aria-checked={loop}
            aria-label="Loop"
            onClick={() => setLoop(!loop)}
            className="flex h-full items-center gap-2 px-3 italic hover:bg-surface-2"
          >
            Loop
            <span aria-hidden className={`relative h-5 w-9 rounded-full transition-colors ${loop ? 'bg-[var(--play)]' : 'bg-line'}`}>
              <span className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all ${loop ? 'left-[1.125rem]' : 'left-0.5'}`} />
            </span>
          </button>
          <span aria-hidden className="mx-0.5 h-6 w-px bg-line" />
          <div role="radiogroup" aria-label="What to play" className="flex h-full items-center gap-0.5">
            {([['song', 'Whole song'], ['section', 'This section']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => setScope(value)}
                className={`h-full px-3 italic ${scope === value ? 'text-fg shadow-[inset_0_-1.5px_0_var(--fg)]' : 'text-muted hover:text-fg'}`}
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
          <NumberField
            id="bpm"
            inputMode="numeric"
            min={BPM_MIN}
            max={BPM_MAX}
            value={bpm}
            onCommit={setBpm}
            className="h-10 w-16 rounded-none border-0 border-b border-fg bg-transparent px-2 text-center"
          />
          <span className="text-base italic text-muted">BPM</span>
        </div>
        <TapTempo onBpm={setBpm} />
        {Extras && <Extras />}
      </div>
    </div>
  );
}
