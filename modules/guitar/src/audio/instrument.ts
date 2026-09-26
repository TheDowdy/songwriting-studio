/**
 * The UI talks to sound only through this interface, so a sample-based instrument can replace
 * the synth later without touching components (PLAN.md §8.1, §8.5).
 */
export type SoundPresetId = 'acoustic' | 'classical' | 'clean' | 'jazz' | 'crunch' | 'highgain';

export interface VoiceHandle {
  readonly id: number;
  /** 0 = lowest (6th) string. */
  readonly string: number;
}

export interface PluckOptions {
  /** 0–1, default 0.8. */
  velocity?: number;
  /** 0–1, default 0. Brightens the attack without making it louder (upstrokes use this). */
  brightness?: number;
  /** AudioContext time in seconds; default = now. */
  when?: number;
}

export interface Instrument {
  /** Sounds a note on a string, damping whatever was ringing on that string. */
  pluck(string: number, midi: number, opts?: PluckOptions): VoiceHandle;
  /** Continuously retunes a ringing voice (fractional MIDI) without re-plucking. */
  setPitch(voice: VoiceHandle, midi: number, rampMs?: number): void;
  damp(voice: VoiceHandle, when?: number): void;
  setPreset(id: SoundPresetId): void;
}
