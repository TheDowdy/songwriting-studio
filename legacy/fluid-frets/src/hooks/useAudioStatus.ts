import { useSyncExternalStore } from 'react';
import { audioEngine, type EngineStatus } from '../audio/engine';

export function useAudioStatus(): { status: EngineStatus; detail: string } {
  const status = useSyncExternalStore(audioEngine.subscribe, audioEngine.getStatus);
  const detail = useSyncExternalStore(audioEngine.subscribe, audioEngine.getDetail);
  return { status, detail };
}
