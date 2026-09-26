/**
 * The shared AudioContext for the whole app (§5). Created lazily through Tone
 * (`Tone.getContext()`), so a Tone-based module (progression's samplers) and a raw-Web-Audio
 * module (guitar's AudioWorklet string synth) both play through the *same* context and share one
 * "tap to enable sound" gesture — unlocking in either module unlocks both.
 */
import * as Tone from 'tone';

export type UnlockListener = () => void;

let unlocked = false;
const listeners = new Set<UnlockListener>();

/** The single Web Audio context every module connects to. */
export function getAudioContext(): AudioContext {
  return Tone.getContext().rawContext as unknown as AudioContext;
}

/** True once `unlockAudio()` has resolved at least once this session. */
export function isUnlocked(): boolean {
  return unlocked;
}

/** Notified the first time audio unlocks this session (never again after that). Returns an
 *  unsubscribe function. If audio is already unlocked, calls back immediately. */
export function onUnlock(cb: UnlockListener): () => void {
  if (unlocked) {
    cb();
    return () => {};
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Starts/resumes the shared context. Browsers only allow this from a user gesture, so call it
 * synchronously from a tap/click/keydown handler. Safe to call repeatedly (e.g. from every
 * module's own unlock path) — every caller after the first just resolves once the context is
 * already running.
 */
export async function unlockAudio(): Promise<void> {
  await Tone.start();
  const ctx = getAudioContext();
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      // iOS/Safari can still report 'suspended' immediately after resume(); a later gesture
      // (or the caller's own retry) will get it running.
    }
  }
  if (!unlocked) {
    unlocked = true;
    for (const cb of listeners) cb();
    listeners.clear();
  }
}
