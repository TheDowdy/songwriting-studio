import { useMemo } from 'react';
import { useStore } from '../state/store';
import { chordTabHeaderChord, scaleTabHeaderChord } from '../state/chordHeader';
import type { ChordHeaderChord } from '@sw/core/fret/chordHeader';
import { chordHeaderFromIdentified } from '@sw/core/fret/chordHeader';
import { capoedFretCount, capoedTuning } from '@sw/core/fret/capo';
import { readSelection, selectionToShape } from '@sw/core/fret/identifySelection';
import {
  bestVoicingIndex,
  findVoicings,
  type VoicingRules,
  type VoicingTarget,
} from '@sw/core/fret/voicings';
import { useChordView } from './useChordView';
import { useScaleView } from './useScaleView';
import type { DisplayModel } from './useScaleView';

export interface ChordHeaderVoicing {
  /** Per string, low→high: fret relative to the capo (0 = capo/open), null = muted. */
  frets: (number | null)[];
  /** Open-string MIDI notes as the capo makes them sound. */
  tuning: number[];
  rootPc: number;
}

export interface ChordHeaderView {
  chord: ChordHeaderChord;
  voicing: ChordHeaderVoicing | null;
  /** The capo to show ("Capo N"), or null to show nothing (no capo, or a tab where the diagram's
   *  frets are already physical, not capo-relative — Identify). */
  capo: number | null;
  /** How to colour the note chips, matching the neck and legend; null means always plain (the
   *  neck never colours by function in this tab, e.g. Identify). */
  display: DisplayModel | null;
}

function bestVoicingFor(
  target: VoicingTarget,
  tuning: readonly number[],
  fretCount: number,
  rules: VoicingRules,
): ChordHeaderVoicing | null {
  const voicings = findVoicings(tuning, fretCount, target, rules);
  const i = bestVoicingIndex(voicings);
  const v = i >= 0 ? voicings[i] : undefined;
  return v ? { frets: v.frets.slice(), tuning: tuning.slice(), rootPc: target.rootPc } : null;
}

/**
 * The chord-focus header shown above the neck (owner request: list the notes of whatever chord is
 * selected). Null hides the header — the Explore tab, an empty Identify selection, or a Scales
 * overlay that isn't a chord. Reuses each tab's own display hook (`useChordView`/`useScaleView`)
 * for the colouring, so a header chip always matches the neck and legend exactly.
 */
export function useChordHeader(): ChordHeaderView | null {
  const mode = useStore((s) => s.mode);
  const pref = useStore((s) => s.accidentalPref);
  const tuning = useStore((s) => s.tuning);
  const fretCount = useStore((s) => s.fretCount);
  const capo = useStore((s) => s.capo);
  const rules = useStore((s) => s.voicingRules);
  const chordSpec = useStore((s) => s.chordSpec);
  const chordShape = useStore((s) => s.chordShape);
  const progressionChord = useStore((s) => s.progressionChord);
  const scaleSettings = useStore((s) => s.scaleSettings);
  const identifySel = useStore((s) => s.identifySel);

  const chordVm = useChordView();
  const scaleVm = useScaleView();

  return useMemo(() => {
    if (mode === 'chord' && chordVm) {
      const chord = chordTabHeaderChord(chordSpec, pref, progressionChord);
      const soundingTuning = capoedTuning(tuning.strings, capo);
      const soundingFretCount = capoedFretCount(fretCount, capo);
      // The voicing currently selected in the browser (or the hand-edited shape), matching what
      // the Chords panel below shows; the best voicing before anything has been chosen.
      const voicing = chordShape
        ? { frets: chordShape.slice(), tuning: soundingTuning, rootPc: chordSpec.rootPc }
        : bestVoicingFor(chord.target, soundingTuning, soundingFretCount, rules);
      return { chord, voicing, capo: capo > 0 ? capo : null, display: chordVm };
    }

    if (mode === 'scale' && scaleVm) {
      const chord = scaleTabHeaderChord(
        scaleSettings.overlay,
        scaleVm.root,
        scaleVm.def,
        scaleVm.spelling,
        pref,
        chordSpec,
      );
      if (!chord) return null;
      const soundingTuning = capoedTuning(tuning.strings, capo);
      const soundingFretCount = capoedFretCount(fretCount, capo);
      const voicing = bestVoicingFor(chord.target, soundingTuning, soundingFretCount, rules);
      return { chord, voicing, capo: capo > 0 ? capo : null, display: scaleVm };
    }

    if (mode === 'identify') {
      const { notes, readings } = readSelection(tuning.strings, identifySel, pref);
      const best = readings[0];
      const chord = chordHeaderFromIdentified(best, notes);
      if (!chord || !best) return null;
      // The picked shape is on physical frets already, so it needs no capo relabelling.
      const voicing = {
        frets: selectionToShape(identifySel),
        tuning: tuning.strings.slice(),
        rootPc: best.rootPc,
      };
      return { chord, voicing, capo: null, display: null };
    }

    return null;
  }, [
    mode,
    pref,
    tuning,
    fretCount,
    capo,
    rules,
    chordSpec,
    chordShape,
    progressionChord,
    scaleSettings,
    identifySel,
    chordVm,
    scaleVm,
  ]);
}
