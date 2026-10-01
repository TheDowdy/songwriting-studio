import { useState } from 'react';
import type { ReactNode } from 'react';
import { canToggleMajorMinor, chordName, defaultGuitarSetup, toggleMajorMinor } from '@sw/core';
import type { ChordRef, GuitarSetup, Key } from '@sw/core';
import ChordDetail from './ChordDetail';
import FlavorPicker from './FlavorPicker';

interface Props {
  /** The chord picked on the map or circle. */
  chord: ChordRef;
  /** Why it works (or what it is), under its name. */
  reason: string;
  musicKey: Key;
  guitar?: GuitarSetup;
  /** Replace mode is armed: the Add button says so. */
  replacing?: boolean;
  onPreview: (chord: ChordRef) => void;
  onAdd: (chord: ChordRef) => void;
  /** Extra controls after the built-in ones (the circle's "key shift"). */
  extra?: ReactNode;
}

/**
 * The card under the chord map and the circle of fifths: the picked chord's name, buttons to change
 * its flavour or inversion, flip it between major and minor (same key), see it on a keyboard or
 * guitar, and add it. Give it a `key` that changes with the picked chord so its own edits reset.
 */
export default function ChordFocusCard({ chord, reason, musicKey, guitar, replacing, onPreview, onAdd, extra }: Props) {
  const [flavorOpen, setFlavorOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // The chord with the user's flavour or major/minor edits applied; what Add adds.
  const [pending, setPending] = useState<ChordRef | null>(null);
  const shown = pending ?? chord;
  const canFlip = canToggleMajorMinor(shown);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-y border-fg py-3">
        <div className="min-w-0 basis-full">
          <p className="text-xl font-medium">
            {chordName(shown)} <span className="font-normal text-muted">({shown.numeral})</span>
          </p>
          <p className="text-base italic text-muted">{reason}</p>
        </div>
        <button
          onClick={() => {
            const next = toggleMajorMinor(shown, musicKey);
            setPending(next);
            onPreview(next);
          }}
          disabled={!canFlip}
          className="shrink-0 rounded-full border border-fg px-4 py-2 text-base italic hover:bg-surface-2 disabled:opacity-40"
          title={canFlip ? undefined : 'Only a major or minor chord can be switched'}
        >
          {shown.quality === 'min' ? 'Make major' : 'Make minor'}
        </button>
        <button
          onClick={() => {
            setDetailOpen(false);
            setFlavorOpen((v) => !v);
          }}
          aria-pressed={flavorOpen}
          aria-label="Change flavor or inversion"
          className={`shrink-0 grid size-10 place-items-center rounded-lg border text-base ${flavorOpen ? 'border-accent text-accent' : 'border-line text-muted hover:bg-surface-2'}`}
        >
          ⚙
        </button>
        <button
          onClick={() => {
            setFlavorOpen(false);
            setDetailOpen((v) => !v);
          }}
          aria-pressed={detailOpen}
          aria-label="Expand: piano keyboard or guitar diagram"
          className={`shrink-0 grid size-10 place-items-center rounded-lg border text-base ${detailOpen ? 'border-accent text-accent' : 'border-line text-muted hover:bg-surface-2'}`}
        >
          ⛶
        </button>
        {extra}
        <button
          onClick={() => onAdd(shown)}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-base font-medium italic text-accent-fg"
        >
          {replacing ? 'Replace' : '+ Add'}
        </button>
      </div>
      {flavorOpen && (
        <FlavorPicker chord={shown} musicKey={musicKey} onPreview={onPreview} onChoose={setPending} onClose={() => setFlavorOpen(false)} />
      )}
      {detailOpen && <ChordDetail chord={shown} guitar={guitar ?? defaultGuitarSetup()} onClose={() => setDetailOpen(false)} />}
    </>
  );
}
