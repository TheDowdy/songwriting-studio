import { useMemo } from 'react';
import { useStore } from '../state/store';
import {
  formatNoteName,
  noteNamePc,
  pitchClass,
  type NoteName,
  type Spelling,
} from '../theory/notes';
import { describeOverlay, overlayPitchClasses } from '../theory/overlays';
import type { PaletteId } from '../theory/scaleColors';
import { bestRootSpelling, getScale, scaleSpelling, type ScaleDef } from '../theory/scales';
import { buildPitchViews, type PitchView } from '../theory/scaleView';

export interface LegendItem {
  /** Degree or interval label, e.g. "♭3", "R". */
  label: string;
  /** Note name, e.g. "G". */
  note: string;
  view: PitchView;
}

/** What the fretboard draws in scale or chord mode; explore mode has no display model. */
export interface DisplayModel {
  /** Spelling of all 12 pitch classes: the key's/chord's own names where they apply. */
  spelling: Spelling;
  /** Indexed by pitch class. */
  views: PitchView[];
  colourMode: boolean;
  palette: PaletteId;
  hideOutOfScale: boolean;
  /** The chromatic scale is coloured by a 12-hue wheel rather than by degree. */
  chromatic: boolean;
  /** Text shown in a marker instead of the note name, by pitch class (interval labels). */
  labels: (string | null)[] | null;
  /**
   * Fingering to ring on the neck, per string: a fret, null = muted (✕ behind the nut), or
   * undefined = not part of the fingering (drawn normally).
   */
  shape: (number | null | undefined)[] | null;
  legend: {
    items: LegendItem[];
    /** What the three plain marker styles are called. */
    terms: { tonic: string | null; scale: string | null; out: string | null };
    /** Explains the ring, e.g. "vi — Am"; null when there's none. */
    overlayLabel: string | null;
  };
}

export interface ScaleViewModel extends DisplayModel {
  root: NoteName;
  def: ScaleDef;
}

/** The view model in scale mode, or null otherwise. */
export function useScaleView(): ScaleViewModel | null {
  const mode = useStore((s) => s.mode);
  const settings = useStore((s) => s.scaleSettings);
  const palette = useStore((s) => s.palette);
  const pref = useStore((s) => s.accidentalPref);
  const chordSpec = useStore((s) => s.chordSpec);

  return useMemo(() => {
    if (mode !== 'scale') return null;
    const def = getScale(settings.scaleId);
    const root = bestRootSpelling(settings.rootPc, def, pref);
    const overlay = overlayPitchClasses(root, def, settings.overlay, pref, chordSpec);
    const spelling = scaleSpelling(root, def, pref);
    const views = buildPitchViews(root, def, overlay);
    const rootPc = noteNamePc(root);
    return {
      root,
      def,
      spelling,
      views,
      colourMode: settings.colourMode,
      palette,
      hideOutOfScale: settings.hideOutOfScale,
      chromatic: !!def.chromatic,
      labels: null,
      shape: null,
      legend: {
        items: def.degrees.map((d) => {
          const pc = pitchClass(rootPc + d.interval);
          return {
            label: d.label,
            note: formatNoteName(spelling[pc] as NoteName),
            view: views[pc] as PitchView,
          };
        }),
        terms: { tonic: 'Tonic', scale: 'In scale', out: 'Out of scale' },
        overlayLabel: overlay
          ? describeOverlay(root, def, settings.overlay, pref, chordSpec)
          : null,
      },
    };
  }, [mode, settings, palette, pref, chordSpec]);
}
