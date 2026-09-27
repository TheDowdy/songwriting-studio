import { SOUND_PRESETS } from '../../audio/synth/presets';
import type { SoundPresetId } from '../../audio/instrument';
import { useStore } from '../../state/store';

export function SoundControls() {
  const soundPreset = useStore((s) => s.soundPreset);
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const { setSoundPreset, setVolume, setMuted } = useStore.getState();

  return (
    <>
      <label className="field">
        <span>Sound</span>
        <select
          value={soundPreset}
          onChange={(e) => setSoundPreset(e.target.value as SoundPresetId)}
        >
          {SOUND_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field volume">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-valuetext={muted ? 'Muted' : `${Math.round(volume * 100)} percent`}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
        />
      </label>

      <button
        type="button"
        className="button"
        aria-pressed={muted}
        onClick={() => setMuted(!muted)}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
    </>
  );
}
