import { useMemo } from 'react';
import { useStore } from '../state/store';
import { describeChord, toneShortLabel } from '../theory/chords';
import { chromaticSpelling, formatNoteName, type NoteName } from '../theory/notes';
import type { Degree } from '../theory/scales';
import type { PitchView } from '../theory/scaleView';
import { shapeText } from '../theory/voicings';
import type { DisplayModel, LegendItem } from './useScaleView';

/** The chord's tones as marker roles: root, other chord tones (coloured by function), everything else. */
export function useChordView(): DisplayModel | null {
  const mode = useStore((s) => s.mode);
  const spec = useStore((s) => s.chordSpec);
  const display = useStore((s) => s.chordDisplay);
  const palette = useStore((s) => s.palette);
  const pref = useStore((s) => s.accidentalPref);
  const shape = useStore((s) => s.chordShape);

  return useMemo(() => {
    if (mode !== 'chord') return null;
    const info = describeChord(spec, pref);
    const spelling: NoteName[] = [...chromaticSpelling(pref)];
    const labels: (string | null)[] = new Array<string | null>(12).fill(null);
    const views: PitchView[] = Array.from({ length: 12 }, (_, pc) => ({
      role: 'out',
      interval: (pc - spec.rootPc + 12) % 12,
      variant: false,
      overlay: false,
    }));
    const stepCounts = new Map<number, number>();
    for (const t of info.tones) stepCounts.set(t.steps, (stepCounts.get(t.steps) ?? 0) + 1);

    const items: LegendItem[] = [];
    for (const t of info.tones) {
      spelling[t.pc] = t.name;
      labels[t.pc] = toneShortLabel(t);
      const degree: Degree = {
        // The letter step fixes the hue family, so 9/11/13 share the colours of 2/4/6.
        number: t.steps + 1,
        alter:
          t.label.startsWith('♭') || t.label.startsWith('𝄫') ? -1 : t.label.startsWith('♯') ? 1 : 0,
        label: t.label,
        interval: t.semitones,
      };
      const view: PitchView = {
        role: t.kind === 'root' ? 'tonic' : 'scale',
        interval: t.semitones,
        degree,
        variant: degree.alter !== 0 && (stepCounts.get(t.steps) ?? 0) > 1,
        overlay: false,
      };
      views[t.pc] = view;
      items.push({ label: toneShortLabel(t), note: formatNoteName(t.name), view });
    }

    return {
      spelling,
      views,
      colourMode: display.colourByFunction,
      palette,
      hideOutOfScale: display.hideOthers,
      chromatic: false,
      labels: display.showIntervals ? labels : null,
      shape,
      legend: {
        items,
        terms: { tonic: 'Root', scale: 'Chord tone', out: 'Other note' },
        overlayLabel: shape ? `fingering ${shapeText(shape)}` : null,
      },
    };
  }, [mode, spec, display, palette, pref, shape]);
}
