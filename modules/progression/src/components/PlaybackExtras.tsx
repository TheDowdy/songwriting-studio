import { useState } from 'react';
import { useStore } from '../state/store';
import { NumberField } from '@sw/ui';
import type { InstrumentId } from '@sw/core';

const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'epiano', label: 'Electric piano' },
  { id: 'pad', label: 'Pad' },
  { id: 'guitar', label: 'Guitar' },
];

const DENOMINATORS = [1, 2, 4, 8, 16] as const;

/**
 * The playback settings that belong to the chords workspace — time signature, instrument,
 * metronome and volume — behind a "More" button in the shell's transport row. (Play, loop, tempo
 * and tap are the shell's own, shared by every workspace.)
 */
export default function PlaybackExtras() {
  const [expanded, setExpanded] = useState(false);
  const timeSig = useStore((s) => s.song.timeSig);
  const instrument = useStore((s) => s.song.instrument);
  const metronome = useStore((s) => s.metronome);
  const volume = useStore((s) => s.volume);
  const setTimeSig = useStore((s) => s.setTimeSig);
  const setInstrument = useStore((s) => s.setInstrument);
  const setMetronome = useStore((s) => s.setMetronome);
  const setVolume = useStore((s) => s.setVolume);

  return (
    <>
      <button
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            aria-label="More playback settings"
            className={`h-10 rounded-lg rounded-full border px-4 text-base italic ${expanded ? 'border-accent text-accent' : 'border-fg text-muted hover:bg-surface-2'}`}
          >
            {expanded ? 'Less ▴' : 'More ▾'}
          </button>

        {expanded && (
          <div className="flex basis-full flex-wrap items-end gap-x-5 gap-y-3 border-t border-line pt-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Time signature</label>
              <div className="flex items-center gap-1">
                <NumberField
                  min={1}
                  max={32}
                  value={timeSig.beats}
                  onCommit={(n) => setTimeSig({ ...timeSig, beats: n })}
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

    </>
  );
}
