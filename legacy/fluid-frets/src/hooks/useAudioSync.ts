import { useEffect } from 'react';
import { audioEngine } from '../audio/engine';
import { useStore } from '../state/store';

/** Pushes persisted volume / mute / sound preset into the audio engine, and keeps them in sync. */
export function useAudioSync(): void {
  useEffect(() => {
    const apply = (s: ReturnType<typeof useStore.getState>) => {
      audioEngine.setVolume(s.volume);
      audioEngine.setMuted(s.muted);
      audioEngine.setPreset(s.soundPreset);
    };
    apply(useStore.getState());
    return useStore.subscribe(apply);
  }, []);
}
