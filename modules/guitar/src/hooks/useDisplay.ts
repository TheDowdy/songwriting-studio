import { useChordView } from './useChordView';
import { useIdentifyView } from './useIdentifyView';
import { useScaleView, type DisplayModel } from './useScaleView';

/** How notes are drawn on the neck: by chord, picked shape or scale; null for plain exploring. */
export function useDisplay(): DisplayModel | null {
  const chord = useChordView();
  const scale = useScaleView();
  const identify = useIdentifyView();
  return chord ?? identify ?? scale;
}
