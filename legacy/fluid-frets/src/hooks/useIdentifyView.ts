import { useMemo } from 'react';
import { useStore } from '../state/store';
import { describeChord } from '../theory/chords';
import { readSelection, selectionToShape } from '../theory/identifySelection';
import { chromaticSpelling, type NoteName } from '../theory/notes';
import type { PitchView } from '../theory/scaleView';
import { shapeText } from '../theory/voicings';
import type { DisplayModel } from './useScaleView';

/**
 * Identify mode: every note is drawn plainly, the picked notes are ringed, and the root of the best
 * reading is highlighted wherever it occurs. Notes of the reading are spelled for it.
 */
export function useIdentifyView(): DisplayModel | null {
  const mode = useStore((s) => s.mode);
  const selection = useStore((s) => s.identifySel);
  const tuning = useStore((s) => s.tuning);
  const palette = useStore((s) => s.palette);
  const pref = useStore((s) => s.accidentalPref);

  return useMemo(() => {
    if (mode !== 'identify') return null;
    const { readings } = readSelection(tuning.strings, selection, pref);
    const best = readings[0];
    const spelling: NoteName[] = [...chromaticSpelling(pref)];
    if (best?.spec) {
      for (const t of describeChord(best.spec, pref).tones) spelling[t.pc] = t.name;
    }
    const rootPc = best && best.kind !== 'interval' ? best.rootPc : null;
    const views: PitchView[] = Array.from({ length: 12 }, (_, pc) => ({
      role: pc === rootPc ? 'tonic' : 'scale',
      interval: rootPc === null ? 0 : (pc - rootPc + 12) % 12,
      variant: false,
      overlay: false,
    }));
    const picked = selectionToShape(selection);
    const any = picked.some((f) => f !== null);
    // A string that is unused (null) is drawn normally; a muted one shows ✕ behind the nut.
    const shape = selection.map((c) => (c === null ? undefined : typeof c === 'number' ? c : null));
    return {
      spelling,
      views,
      colourMode: false,
      palette,
      hideOutOfScale: false,
      chromatic: false,
      labels: null,
      shape,
      legend: {
        items: [],
        terms: {
          tonic: rootPc === null ? null : 'Root of the best reading',
          scale: 'Note',
          out: null,
        },
        overlayLabel: any ? `picked ${shapeText(picked)}` : null,
      },
    };
  }, [mode, selection, tuning.strings, palette, pref]);
}
