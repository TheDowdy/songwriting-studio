import { useEffect, useRef } from 'react';
import { chordContext, selectBestVoicing, stopChordPlayback } from '../state/chordActions';
import { committedVoicingFor } from '../state/progressionChordActions';
import { useStore } from '../state/store';
import { indexOfShape } from '@sw/core/fret/voicings';

/**
 * Keeps the fingering on the neck in step with the chord: in chord mode it shows the best voicing
 * whenever the chord, the tuning, the fret count, the voicing rules or (in song context) the
 * bass/inversion control change (which also discards hand edits made for the previous shape), and
 * outside chord mode it releases the chord's shape. A shape sent over from Identify mode is shown
 * instead, once, in place of the best voicing.
 *
 * A chord's own committed voicing (§3.2) wins over the best one — Phase 4 item 1, "before any tap,
 * the chord shows its overall best voicing, or its committed voicing if it has one" — but only on
 * a fresh focus (a different chord, or leaving/entering song context). Once you're already looking
 * at a chord, every other change here (most usefully the bass/inversion control) shows what it
 * would now produce, not silently the committed shape again — that's what the "best voicing
 * whenever ... changes" behaviour above has always meant for every other dependency.
 */
export function useChordSelection(): void {
  const mode = useStore((s) => s.mode);
  const spec = useStore((s) => s.chordSpec);
  const rules = useStore((s) => s.voicingRules);
  const strings = useStore((s) => s.tuning.strings);
  const fretCount = useStore((s) => s.fretCount);
  const capo = useStore((s) => s.capo);
  const pref = useStore((s) => s.accidentalPref);
  const songId = useStore((s) => s.songId);
  const progressionEventId = useStore((s) => s.progressionEventId);
  const bassMode = useStore((s) => s.bassMode);

  const lastFocus = useRef<string | null>(null);

  useEffect(() => {
    if (mode === 'chord') {
      const focus = `${songId ?? ''}:${progressionEventId ?? ''}`;
      const freshFocus = lastFocus.current !== focus;
      lastFocus.current = focus;

      const { adoptShape, chordSpec, setAdoptShape, setChordShape } = useStore.getState();
      const committed = freshFocus ? committedVoicingFor(songId, progressionEventId) : null;
      if (adoptShape && adoptShape.spec === chordSpec) {
        setAdoptShape(null);
        const index = indexOfShape(chordContext().voicings, adoptShape.shape);
        setChordShape(adoptShape.shape, index >= 0 ? index : null);
      } else if (committed) {
        const index = indexOfShape(chordContext().voicings, committed.frets);
        setChordShape(committed.frets.slice(), index >= 0 ? index : null);
      } else {
        selectBestVoicing();
      }
    } else {
      lastFocus.current = null;
      stopChordPlayback();
      const { chordShape, setChordShape, setEditingShape } = useStore.getState();
      if (chordShape) setChordShape(null, null);
      setEditingShape(false);
    }
  }, [mode, spec, rules, strings, fretCount, capo, pref, songId, progressionEventId, bassMode]);
}
