import { useSyncExternalStore } from 'react';
import { isUnlocked, onUnlock, unlockAudio } from '@sw/audio';

/**
 * One "Tap to enable sound" banner for the whole app (PLAN.md §5), shown until the shared
 * AudioContext has been unlocked once this session. The guitar module keeps its own richer banner
 * (it also reports engine failures) — this one only shows outside it, so there's never two.
 */
function useAudioUnlocked(): boolean {
  return useSyncExternalStore(
    (cb) => onUnlock(cb),
    () => isUnlocked(),
    () => true,
  );
}

export function AudioBanner() {
  const unlocked = useAudioUnlocked();
  if (unlocked) return null;
  return (
    <button
      type="button"
      onClick={() => void unlockAudio()}
      className="block w-full border-b border-line bg-accent px-4 py-2 text-center text-sm font-medium text-accent-fg"
    >
      Tap to enable sound
    </button>
  );
}
