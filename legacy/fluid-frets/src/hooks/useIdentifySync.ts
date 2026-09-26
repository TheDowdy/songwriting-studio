import { useEffect } from 'react';
import { selectionToShape } from '../theory/identifySelection';
import { useStore } from '../state/store';

/**
 * In Identify mode the picked notes are what a strum gesture sounds (muted and unused strings
 * silent). Leaving it releases the strum shape, unless the chord tab is taking over.
 */
export function useIdentifySync(): void {
  const mode = useStore((s) => s.mode);
  const selection = useStore((s) => s.identifySel);

  useEffect(() => {
    const { setStrumShape } = useStore.getState();
    if (mode === 'identify') setStrumShape(selectionToShape(selection));
    else if (mode !== 'chord') setStrumShape(null);
  }, [mode, selection]);
}
