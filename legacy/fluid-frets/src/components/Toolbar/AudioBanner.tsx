import { audioEngine } from '../../audio/engine';
import { useAudioStatus } from '../../hooks/useAudioStatus';

/** Shown until audio is running; explains why when it can't. */
export function AudioBanner() {
  const { status, detail } = useAudioStatus();
  if (status === 'running') return null;

  if (status === 'unsupported') {
    return (
      <div className="banner banner-error" role="alert">
        Sound isn&apos;t available: {detail}
      </div>
    );
  }
  return (
    <button type="button" className="banner" onClick={() => audioEngine.unlock()}>
      {status === 'loading' ? 'Starting sound…' : 'Tap to enable sound'}
      <small> (on iPhone, sound may be muted if the silent switch is on)</small>
    </button>
  );
}
