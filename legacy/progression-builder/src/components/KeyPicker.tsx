import { useState } from 'react';
import { keyNote } from '../theory/suggestions';
import { MODES, MODE_INFO, TONIC_OPTIONS, chroma, fmt } from '../theory/scales';
import type { Key, Mode } from '../theory/types';
import { flattenSong } from '../state/song';
import { useStore } from '../state/store';

/** Conventional default spelling for each root (the flat side for Db, Eb, Ab, Bb). */
const DEFAULT_SPELLING: Record<number, string> = { 1: 'Db', 3: 'Eb', 6: 'F#', 8: 'Ab', 10: 'Bb' };

const optionsFor = (tonic: string) => TONIC_OPTIONS.find((o) => o.some((n) => chroma(n) === chroma(tonic)))!;

export default function KeyPicker() {
  const song = useStore((s) => s.song);
  const changeKey = useStore((s) => s.changeKey);
  const [pending, setPending] = useState<Key | null>(null);

  const hasChords = flattenSong(song).length > 0;
  const key = song.key;
  const spellings = optionsFor(key.tonic);

  const request = (next: Key) => {
    if (next.tonic === key.tonic && next.mode === key.mode) return;
    if (hasChords) setPending(next);
    else changeKey(next, 'relabel');
  };
  const confirm = (how: 'transpose' | 'relabel') => {
    if (pending) changeKey(pending, how);
    setPending(null);
  };

  const note = keyNote(key);

  return (
    <section aria-label="Key" className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium text-muted">Root note</h2>
          {spellings.length > 1 && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Spelling">
              <span className="text-xs text-muted">Spell as</span>
              {spellings.map((n) => (
                <button
                  key={n}
                  onClick={() => request({ ...key, tonic: n })}
                  aria-pressed={n === key.tonic}
                  className={`min-w-9 rounded-lg border px-2 py-0.5 text-sm ${
                    n === key.tonic ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface'
                  }`}
                >
                  {fmt(n)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {TONIC_OPTIONS.map((options) => {
            const selected = options.some((n) => chroma(n) === chroma(key.tonic));
            const label = selected ? key.tonic : (DEFAULT_SPELLING[chroma(options[0])] ?? options[0]);
            return (
              <button
                key={options[0]}
                onClick={() => request({ ...key, tonic: selected ? key.tonic : label })}
                aria-pressed={selected}
                className={`h-10 rounded-lg border text-sm font-medium ${
                  selected ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                {fmt(label)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="mode" className="mb-1.5 block text-xs font-medium text-muted">
          Scale / mode
        </label>
        <select
          id="mode"
          value={key.mode}
          onChange={(e) => request({ ...key, mode: e.target.value as Mode })}
          className="h-10 w-full rounded-lg border border-line bg-surface px-3 sm:w-72"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_INFO[m].label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-muted">{MODE_INFO[key.mode].mood}</p>
        {note && <p className="mt-1 text-sm text-[var(--c-borrowed)]">{note}</p>}
      </div>

      {pending && (
        <div role="alertdialog" aria-label="Change key" className="rounded-xl border border-accent bg-surface p-3">
          <p className="text-sm">
            Change key to <strong>{fmt(pending.tonic)} {MODE_INFO[pending.mode].label}</strong>? What should happen to the
            chords you've already added?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => confirm('transpose')} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
              Transpose them
            </button>
            <button onClick={() => confirm('relabel')} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium">
              Keep chords, relabel numerals
            </button>
            <button onClick={() => setPending(null)} className="rounded-lg px-3 py-2 text-sm text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
