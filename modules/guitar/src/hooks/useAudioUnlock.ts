import { useEffect } from 'react';
import { audioEngine } from '../audio/engine';

/**
 * Browsers only allow audio after a user gesture, and Safari on iOS is picky about which events
 * count (pointerdown isn't enough for some versions). Retry on every gesture type until running.
 */
export function useAudioUnlock(): void {
  useEffect(() => {
    const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
    const unlock = () => {
      audioEngine.unlock();
      if (audioEngine.getStatus() === 'running') remove();
    };
    const remove = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
    events.forEach((e) => window.addEventListener(e, unlock, true));
    return remove;
  }, []);
}
