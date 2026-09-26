import { useMemo } from 'react';
import { resolveSkin, type ResolvedSkin } from '../components/Fretboard/guitarSkins';
import { useStore } from '../state/store';

/** The selected guitar model with the user's wood / inlay / finish choices applied. */
export function useGuitarSkin(): ResolvedSkin {
  const model = useStore((s) => s.guitarModel);
  const customise = useStore((s) => s.customise);
  return useMemo(() => resolveSkin(model, customise), [model, customise]);
}
