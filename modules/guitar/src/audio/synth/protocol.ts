import type { PluckParams, StringBank } from './stringDsp';

/** Messages from the main thread to the string worklet. Times are AudioContext seconds. */
export type WorkletMessage =
  | { type: 'pluck'; params: PluckParams }
  | { type: 'pitch'; when?: number; id: number; midi: number; rampMs: number }
  | { type: 'damp'; when?: number; id: number };

export const PROCESSOR_NAME = 'fluid-frets-strings';

/**
 * Applies a message to a string bank. Times arrive in seconds on the AudioContext clock; a missing
 * or past time plays immediately. Shared by the AudioWorklet and the ScriptProcessor fallback so
 * both interpret messages identically.
 */
export function applyWorkletMessage(bank: StringBank, m: WorkletMessage, sampleRate: number): void {
  const frame = (when: number | undefined) =>
    when === undefined ? 0 : Math.round(when * sampleRate);
  if (m.type === 'pluck') bank.pluck(frame(m.params.when), m.params);
  else if (m.type === 'pitch') bank.setPitch(frame(m.when), m.id, m.midi, m.rampMs);
  else bank.damp(frame(m.when), m.id);
}
