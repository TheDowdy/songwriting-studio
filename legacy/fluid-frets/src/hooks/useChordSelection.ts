import { useEffect } from 'react';
import { chordContext, selectBestVoicing, stopChordPlayback } from '../state/chordActions';
import { useStore } from '../state/store';
import { indexOfShape } from '../theory/voicings';

/**
 * Keeps the fingering on the neck in step with the chord: in chord mode it shows the best voicing
 * whenever the chord, the tuning, the fret count or the voicing rules change (which also discards
 * hand edits made for the previous chord), and outside chord mode it releases the chord's shape.
 * A shape sent over from Identify mode is shown instead, once, in place of the best voicing.
 */
export function useChordSelection(): void {
  const mode = useStore((s) => s.mode);
  const spec = useStore((s) => s.chordSpec);
  const rules = useStore((s) => s.voicingRules);
  const strings = useStore((s) => s.tuning.strings);
  const fretCount = useStore((s) => s.fretCount);
  const pref = useStore((s) => s.accidentalPref);

  useEffect(() => {
    if (mode === 'chord') {
      const { adoptShape, chordSpec, setAdoptShape, setChordShape } = useStore.getState();
      if (adoptShape && adoptShape.spec === chordSpec) {
        setAdoptShape(null);
        const index = indexOfShape(chordContext().voicings, adoptShape.shape);
        setChordShape(adoptShape.shape, index >= 0 ? index : null);
      } else {
        selectBestVoicing();
      }
    } else {
      stopChordPlayback();
      const { chordShape, setChordShape, setEditingShape } = useStore.getState();
      if (chordShape) setChordShape(null, null);
      setEditingShape(false);
    }
  }, [mode, spec, rules, strings, fretCount, pref]);
}
