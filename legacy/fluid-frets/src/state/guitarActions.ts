import { getGuitarModel, type GuitarModelId } from '../components/Fretboard/guitarSkins';
import { useStore } from './store';

/**
 * Chooses a guitar (§4a). With "Match sound to guitar" on it also selects the guitar's natural
 * sound, and unless the user has picked a fret count themselves it takes the guitar's default one.
 * Both remain freely changeable afterwards.
 */
export function selectGuitarModel(id: GuitarModelId): void {
  const model = getGuitarModel(id);
  const state = useStore.getState();
  state.setGuitarModel(model.id);
  if (state.matchSound) state.setSoundPreset(model.defaultSound);
  if (!state.fretCountUserSet) state.setFretCount(model.defaultFrets);
}

/** A fret count chosen by the user, which a guitar's default no longer overrides. */
export function chooseFretCount(fretCount: number): void {
  const state = useStore.getState();
  state.setFretCount(fretCount);
  state.setFretCountUserSet(true);
}
