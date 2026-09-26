import type { SoundPresetId } from '../instrument';

/** Everything that shapes a sound is data here; effects.ts and SynthInstrument.ts only interpret it. */

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  q?: number;
  /** dB, for peaking/shelving filters. */
  gain?: number;
}

export interface StringVoicing {
  /** Excitation low-pass at full velocity (0 = white noise, →1 = dark). Softer plucks get darker. */
  pluckLowpass: number;
  /** Extra darkening applied at zero velocity. */
  velocitySoftening: number;
  /** Pick position as a fraction of the string length (comb notch). */
  pickPosition: number;
  /** 60 dB decay time (s) for a 110 Hz string. */
  sustain: number;
  /** Sustain scales with (f/110)^−exponent: bigger = high strings die faster. */
  sustainExponent: number;
  /** Loop low-pass coefficient at 220 Hz (brightness decay). */
  damping: number;
  /** Tail gate level (linear) — chops the ring of high-gain sounds; 0 = off. */
  gate: number;
}

export interface DriveSpec {
  /** Pre-gain into the shaper. */
  amount: number;
  /** DC bias into the shaper (asymmetric clipping adds even harmonics). */
  asymmetry: number;
  pre?: FilterSpec[];
  post?: FilterSpec[];
}

export interface ReverbSpec {
  /** Wet level, 0–1. */
  mix: number;
  /** Seconds. */
  decay: number;
  /** Low-pass on the tail (Hz) — lower = darker room. */
  damping: number;
}

export interface SoundPreset {
  id: SoundPresetId;
  name: string;
  string: StringVoicing;
  /** Body resonance / pickup EQ. */
  body: FilterSpec[];
  drive?: DriveSpec;
  /** Cabinet simulation, after the drive. */
  cab?: FilterSpec[];
  reverb: ReverbSpec;
  /** Output trim so presets sit at a similar loudness. */
  level: number;
}

export const SOUND_PRESETS: readonly SoundPreset[] = [
  {
    id: 'acoustic',
    name: 'Acoustic (steel)',
    string: {
      pluckLowpass: 0.1,
      velocitySoftening: 0.4,
      pickPosition: 0.13,
      sustain: 6,
      sustainExponent: 0.55,
      damping: 0.16,
      gate: 0,
    },
    body: [
      { type: 'peaking', freq: 100, q: 2, gain: 4 },
      { type: 'peaking', freq: 200, q: 1.5, gain: 3 },
      { type: 'peaking', freq: 400, q: 1.2, gain: 2 },
      { type: 'highshelf', freq: 7000, gain: 3 },
    ],
    reverb: { mix: 0.18, decay: 1.4, damping: 6000 },
    level: 0.6,
  },
  {
    id: 'classical',
    name: 'Classical (nylon)',
    string: {
      pluckLowpass: 0.62,
      velocitySoftening: 0.25,
      pickPosition: 0.2,
      sustain: 3.2,
      sustainExponent: 0.5,
      damping: 0.42,
      gate: 0,
    },
    body: [
      { type: 'peaking', freq: 110, q: 2, gain: 4 },
      { type: 'peaking', freq: 220, q: 1.4, gain: 3 },
      { type: 'peaking', freq: 450, q: 1.2, gain: 1.5 },
      { type: 'highshelf', freq: 3500, gain: -3 },
    ],
    reverb: { mix: 0.22, decay: 1.6, damping: 4500 },
    level: 0.7,
  },
  {
    id: 'clean',
    name: 'Clean electric',
    string: {
      pluckLowpass: 0.3,
      velocitySoftening: 0.35,
      pickPosition: 0.16,
      sustain: 7,
      sustainExponent: 0.5,
      damping: 0.24,
      gate: 0,
    },
    body: [
      { type: 'highpass', freq: 60, q: 0.7 },
      { type: 'lowshelf', freq: 150, gain: -3 },
      { type: 'peaking', freq: 3000, q: 1.2, gain: 5 },
    ],
    reverb: { mix: 0.1, decay: 1.0, damping: 5000 },
    level: 0.6,
  },
  {
    id: 'jazz',
    name: 'Jazz electric',
    string: {
      pluckLowpass: 0.5,
      velocitySoftening: 0.3,
      pickPosition: 0.2,
      sustain: 6,
      sustainExponent: 0.5,
      damping: 0.5,
      gate: 0,
    },
    body: [
      { type: 'highpass', freq: 70, q: 0.7 },
      { type: 'peaking', freq: 250, q: 1, gain: 2 },
      { type: 'peaking', freq: 1800, q: 1.2, gain: 2 },
      { type: 'lowpass', freq: 3500, q: 0.7 },
      { type: 'highshelf', freq: 2000, gain: -5 },
    ],
    reverb: { mix: 0.15, decay: 1.2, damping: 4000 },
    level: 0.75,
  },
  {
    id: 'crunch',
    name: 'Crunch',
    string: {
      pluckLowpass: 0.25,
      velocitySoftening: 0.3,
      pickPosition: 0.14,
      sustain: 6,
      sustainExponent: 0.5,
      damping: 0.24,
      gate: 0,
    },
    body: [
      { type: 'highpass', freq: 70, q: 0.7 },
      { type: 'peaking', freq: 3000, q: 1.2, gain: 4 },
    ],
    drive: {
      amount: 4,
      asymmetry: 0.1,
      pre: [{ type: 'peaking', freq: 900, q: 0.8, gain: 4 }],
    },
    cab: [
      { type: 'highpass', freq: 90, q: 0.7 },
      { type: 'peaking', freq: 900, q: 0.9, gain: 3 },
      { type: 'lowpass', freq: 5000, q: 0.7 },
    ],
    reverb: { mix: 0.1, decay: 0.8, damping: 4500 },
    level: 0.2,
  },
  {
    id: 'highgain',
    name: 'High-gain distortion',
    string: {
      pluckLowpass: 0.2,
      velocitySoftening: 0.25,
      pickPosition: 0.12,
      sustain: 5,
      sustainExponent: 0.4,
      damping: 0.2,
      gate: 0.01,
    },
    body: [
      { type: 'highpass', freq: 80, q: 0.7 },
      { type: 'peaking', freq: 2500, q: 1.2, gain: 3 },
    ],
    drive: {
      amount: 22,
      asymmetry: 0.35,
      pre: [
        { type: 'highpass', freq: 140, q: 0.7 },
        { type: 'peaking', freq: 1000, q: 0.8, gain: 6 },
      ],
      post: [{ type: 'peaking', freq: 1500, q: 1, gain: 3 }],
    },
    cab: [
      { type: 'highpass', freq: 90, q: 0.7 },
      { type: 'peaking', freq: 800, q: 1, gain: 3 },
      { type: 'lowpass', freq: 4500, q: 0.8 },
    ],
    reverb: { mix: 0.05, decay: 0.6, damping: 3500 },
    level: 0.14,
  },
];

export const DEFAULT_PRESET_ID: SoundPresetId = 'acoustic';

export function getSoundPreset(id: SoundPresetId): SoundPreset {
  const found = SOUND_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown sound preset "${id}"`);
  return found;
}
