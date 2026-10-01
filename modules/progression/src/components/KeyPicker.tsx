import { useEffect, useState } from 'react';
import { keyNote, keyOfSection, MODES, MODE_INFO, TONIC_OPTIONS, chroma, fmt, flattenSong } from '@sw/core';
import type { Key, Mode } from '@sw/core';
import { useStore } from '../state/store';

/** Conventional default spelling for each root (the flat side for Db, Eb, Ab, Bb). */
const DEFAULT_SPELLING: Record<number, string> = { 1: 'Db', 3: 'Eb', 6: 'F#', 8: 'Ab', 10: 'Bb' };

const optionsFor = (tonic: string) => TONIC_OPTIONS.find((o) => o.some((n) => chroma(n) === chroma(tonic)))!;

export default function KeyPicker() {
  const song = useStore((s) => s.song);
  const changeKey = useStore((s) => s.changeKey);
  const changeSectionKey = useStore((s) => s.changeSectionKey);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const [pending, setPending] = useState<Key | null>(null);

  // The key can apply to the whole song, or only to the section being edited (a key change partway
  // through). The section's own key, when it has one, is what the picker shows in that scope.
  const section = song.sections.find((sec) => sec.id === activeSectionId);
  const hasOwnKey = !!section?.key;
  const [scope, setScope] = useState<'song' | 'section'>(hasOwnKey ? 'section' : 'song');
  useEffect(() => setScope(hasOwnKey ? 'section' : 'song'), [activeSectionId, hasOwnKey]);
  const scoped = scope === 'section' && !!section;

  const hasChords = scoped ? section!.events.length > 0 : flattenSong(song).length > 0;
  const key = scoped ? keyOfSection(song, section!.id) : song.key;
  const spellings = optionsFor(key.tonic);

  const request = (next: Key) => {
    if (next.tonic === key.tonic && next.mode === key.mode) return;
    if (hasChords) setPending(next);
    else apply(next, 'relabel');
  };
  const apply = (next: Key, how: 'transpose' | 'relabel') =>
    scoped ? changeSectionKey(section!.id, next, how) : changeKey(next, how);
  const confirm = (how: 'transpose' | 'relabel') => {
    if (pending) apply(pending, how);
    setPending(null);
  };

  const note = keyNote(key);

  return (
    <section aria-label="Key" className="space-y-3">
      {(song.sections.length > 1 || hasOwnKey) && section && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" role="group" aria-label="Key applies to">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Key applies to</span>
          {([['song', 'Whole song'], ['section', `Only ${section.name}`]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              aria-pressed={scope === value}
              className="px-1 text-base italic text-muted aria-pressed:text-fg aria-pressed:shadow-[inset_0_-1.5px_0_var(--accent)]"
            >
              {label}
            </button>
          ))}
          {hasOwnKey && (
            <button
              onClick={() => {
                changeSectionKey(section.id, null, 'relabel');
                setScope('song');
              }}
              className="px-1 text-base italic text-muted underline hover:text-fg"
            >
              Back to the song’s key
            </button>
          )}
        </div>
      )}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Root note</h2>
          {spellings.length > 1 && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Spelling">
              <span className="text-xs text-muted">Spell as</span>
              {spellings.map((n) => (
                <button
                  key={n}
                  onClick={() => request({ ...key, tonic: n })}
                  aria-pressed={n === key.tonic}
                  className={`min-w-9 px-2 py-0.5 text-base italic ${
                    n === key.tonic ? 'text-fg shadow-[inset_0_-1.5px_0_var(--accent)]' : 'text-muted'
                  }`}
                >
                  {fmt(n)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-6 border-b border-fg sm:grid-cols-12">
          {TONIC_OPTIONS.map((options) => {
            const selected = options.some((n) => chroma(n) === chroma(key.tonic));
            const label = selected ? key.tonic : (DEFAULT_SPELLING[chroma(options[0])] ?? options[0]);
            return (
              <button
                key={options[0]}
                onClick={() => request({ ...key, tonic: selected ? key.tonic : label })}
                aria-pressed={selected}
                className={`h-10 rounded-[50%] text-xl ${
                  selected ? 'text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'hover:bg-surface-2'
                }`}
              >
                {fmt(label)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="mode" className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          Scale / mode
        </label>
        <select
          id="mode"
          value={key.mode}
          onChange={(e) => request({ ...key, mode: e.target.value as Mode })}
          className="h-10 w-full rounded-none border-0 border-b border-fg bg-transparent px-0 italic sm:w-72"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_INFO[m].label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-base italic text-muted">{MODE_INFO[key.mode].mood}</p>
        {note && <p className="mt-1 text-sm text-[var(--c-borrowed)]">{note}</p>}
      </div>

      {pending && (
        <div role="alertdialog" aria-label="Change key" className="rounded-none border-y border-accent bg-surface p-3">
          <p className="text-sm">
            Change key to <strong>{fmt(pending.tonic)} {MODE_INFO[pending.mode].label}</strong>? What should happen to the
            chords you've already added?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => confirm('transpose')} className="rounded-full bg-accent px-4 py-2 text-base italic text-accent-fg">
              Transpose them
            </button>
            <button onClick={() => confirm('relabel')} className="rounded-full border border-fg px-4 py-2 text-base italic">
              Keep chords, relabel numerals
            </button>
            <button onClick={() => setPending(null)} className="px-3 py-2 text-base italic text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
