/**
 * "Make variant" (Phase 8 item 1), shared by both modules: choose a generator, preview the
 * diagrams it produces for the section's own chords, then create. Styling comes from each module's
 * own stylesheet (`.chip`, `.dialog-actions`, `.field`, …), so it matches whichever module it's in.
 */
import { useMemo, useState } from 'react';
import {
  chordName,
  chroma,
  generateVariantShapes,
  variantLabelFor,
  VARIANT_GENERATORS,
  type ChordRef,
  type VariantGeneratorId,
  type VariantOptions,
} from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { ChordDiagram } from './ChordDiagram';

export interface VariantDialogProps {
  sectionName: string;
  chords: readonly ChordRef[];
  tuning: readonly number[];
  capo: number;
  onCreate: (generator: VariantGeneratorId, options: VariantOptions) => void;
  onClose: () => void;
}

const DEFAULT_FROM_FRET = 5;
const DEFAULT_WINDOW_START = 0;
const WINDOW_SPAN = 4; // a 5-fret window: start..start+4

export function VariantDialog({ sectionName, chords, tuning, capo, onCreate, onClose }: VariantDialogProps) {
  const [generator, setGenerator] = useState<VariantGeneratorId>('up-the-neck');
  const [fromFret, setFromFret] = useState(DEFAULT_FROM_FRET);
  const [windowStart, setWindowStart] = useState(DEFAULT_WINDOW_START);

  const options: VariantOptions =
    generator === 'up-the-neck'
      ? { fromFret }
      : generator === 'stay-in-position'
        ? { window: { start: windowStart, end: windowStart + WINDOW_SPAN } }
        : {};

  const soundingTuning = useMemo(() => capoedTuning(tuning, capo), [tuning, capo]);
  const shapes = useMemo(
    () => generateVariantShapes(chords, tuning, capo, generator, options),
    // `options` is a fresh object each render; its actual inputs are `fromFret`/`windowStart`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chords, tuning, capo, generator, fromFret, windowStart],
  );

  return (
    <div className="variant-dialog" role="dialog" aria-label={`Make a variant of ${sectionName}`} data-testid="variant-dialog">
      <div className="variant-dialog-head">
        <h3>Make a variant of {sectionName}</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="variant-dialog-close">
          ×
        </button>
      </div>

      <fieldset className="chip-group" data-testid="variant-generators">
        <legend>Generator</legend>
        {VARIANT_GENERATORS.map((g) => (
          <button key={g.id} type="button" className="chip" aria-pressed={generator === g.id} onClick={() => setGenerator(g.id)}>
            {g.label}
          </button>
        ))}
      </fieldset>

      {generator === 'up-the-neck' && (
        <label className="field variant-dialog-option">
          <span>From fret</span>
          <input
            type="number"
            min={0}
            max={20}
            value={fromFret}
            onChange={(e) => setFromFret(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
          />
        </label>
      )}
      {generator === 'stay-in-position' && (
        <label className="field variant-dialog-option">
          <span>
            Window: {windowStart}–{windowStart + WINDOW_SPAN}
          </span>
          <input
            type="range"
            min={0}
            max={18}
            value={windowStart}
            onChange={(e) => setWindowStart(Math.max(0, Math.min(18, Number(e.target.value) || 0)))}
          />
        </label>
      )}

      <p className="muted variant-dialog-label">{variantLabelFor(generator, options)}</p>

      <ol className="variant-preview" data-testid="variant-preview">
        {chords.map((chord, i) => {
          const shape = shapes[i];
          return (
            <li key={`${i}:${chordName(chord)}`} className="variant-preview-chord">
              {shape ? (
                <ChordDiagram frets={shape.frets} tuning={soundingTuning} rootPc={chroma(chord.root)} capo={capo} size="mini" />
              ) : (
                <span className="muted" title="No playable shape for this chord in this window">
                  —
                </span>
              )}
              <span className="variant-preview-name">{chordName(chord)}</span>
            </li>
          );
        })}
      </ol>

      <div className="dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button primary" onClick={() => onCreate(generator, options)}>
          Create
        </button>
      </div>
    </div>
  );
}
