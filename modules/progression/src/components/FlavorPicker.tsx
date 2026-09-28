import { useState } from 'react';
import { FLAVORS, chordName, inversionCount, inversionOf, toChordSpec, withChordSpec, withFlavor, withInversion } from '@sw/core';
import type { ChordRef, Flavor, Key } from '@sw/core';
import { ChordBuilderChips, type ChordBuilderGroup } from '@sw/ui';

/** The rich options offered under "More…" (Phase 5 item 4): everything the guitar module's builder
 *  has except the chord quality, since this picker changes a chord's shape, never its function. */
const RICH_GROUPS: readonly ChordBuilderGroup[] = ['seventh', 'extension', 'alterations', 'added', 'omit'];

const FLAVOR_LABEL: Record<Flavor, string> = {
  triad: 'Triad',
  '7': '7th',
  sus2: 'Sus2',
  sus4: 'Sus4',
  add9: 'Add9',
};

const INVERSION_LABEL = ['Root', '1st inv', '2nd inv', '3rd inv'];

interface Props {
  chord: ChordRef;
  musicKey: Key;
  /** Play the chord so each option can be previewed before choosing it. */
  onPreview: (chord: ChordRef) => void;
  /** The chord to use now (a new flavor or inversion). */
  onChoose: (chord: ChordRef) => void;
  onClose: () => void;
}

/**
 * Flavor and inversion picker (section 7.6): triad / 7 / sus2 / sus4 / add9, plus the chord's
 * inversions, and under "More…" the guitar module's rich options (6ths, 9/11/13, alterations,
 * added tones, omissions — Phase 5 item 4), with unavailable ones greyed and the reason shown.
 * Never changes harmonic function (root, quality or numeral base), only its shape.
 */
export default function FlavorPicker({ chord, musicKey, onPreview, onChoose, onClose }: Props) {
  const invCount = inversionCount(chord);
  const currentInversion = inversionOf(chord);
  const [moreOpen, setMoreOpen] = useState(() => !!chord.colour);

  const choose = (next: ChordRef) => {
    onPreview(next);
    onChoose(next);
  };

  return (
    <div role="dialog" aria-label={`Change ${chordName(chord)}`} className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {chordName(chord)} <span className="font-normal text-muted">({chord.numeral})</span>
        </h3>
        <button onClick={onClose} aria-label="Close flavor picker" className="grid size-8 place-items-center rounded-lg text-lg text-muted hover:bg-surface-2">
          ×
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Flavor</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Flavor">
          {FLAVORS.map((f) => {
            const active = chord.flavor === f;
            return (
              <button
                key={f}
                onClick={() => choose(withFlavor(chord, f, musicKey))}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  active ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface-2 hover:bg-surface'
                }`}
              >
                {FLAVOR_LABEL[f]}
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              moreOpen ? 'border-accent text-fg' : 'border-line bg-surface-2 hover:bg-surface'
            }`}
          >
            More…
          </button>
        </div>
        {moreOpen && (
          <div className="rich-builder mt-2" data-testid="rich-builder">
            <ChordBuilderChips
              spec={toChordSpec(chord)}
              groups={RICH_GROUPS}
              onChange={(next) => choose(withChordSpec(chord, next, musicKey))}
            />
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Inversion</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Inversion">
          {Array.from({ length: invCount }, (_, i) => i).map((i) => {
            const active = i === currentInversion;
            return (
              <button
                key={i}
                onClick={() => choose(withInversion(chord, i, musicKey))}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  active ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface-2 hover:bg-surface'
                }`}
              >
                {INVERSION_LABEL[i] ?? `Inv ${i}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
