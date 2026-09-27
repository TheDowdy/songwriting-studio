/**
 * The shared AudioContext for the whole app (§5), so a Tone-based module (progression's samplers)
 * and a raw-Web-Audio module (guitar's AudioWorklet string synth, and its ScriptProcessor
 * fallback) both play through the *same* context and share one "tap to enable sound" gesture —
 * unlocking in either module unlocks both.
 *
 * Tone normally builds its own context through `standardized-audio-context` (a spec-compliant
 * ponyfill, for cross-browser consistency) rather than the browser's native class. That breaks
 * plain Web Audio code built against a genuine native context: the native `AudioWorkletNode`
 * constructor rejects it ("parameter 1 is not of type 'BaseAudioContext'"), and the ponyfill
 * doesn't implement the legacy `createScriptProcessor` at all (needed for guitar's fallback synth
 * where AudioWorklet is unavailable — §5 "keep FF's ScriptProcessor fallback"). So this module
 * creates one real native context itself and hands it to Tone with `Tone.setContext()`, the first
 * time either module touches audio; from then on `Tone.getContext().rawContext` (what Tone-based
 * code already expects) *is* that same native context.
 */
import * as Tone from 'tone';

export type UnlockListener = () => void;

let unlocked = false;
const listeners = new Set<UnlockListener>();

/** The single Web Audio context every module connects to. See the module doc comment above. */
export function getAudioContext(): AudioContext {
  const current = Tone.getContext().rawContext as unknown;
  if (typeof BaseAudioContext !== 'undefined' && current instanceof BaseAudioContext) {
    return current as AudioContext;
  }
  const Ctor =
    (typeof window !== 'undefined' && window.AudioContext) ||
    (typeof window !== 'undefined' &&
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) throw new Error('Web Audio is not available in this browser.');
  const native = new Ctor();
  Tone.setContext(native);
  return native;
}

/**
 * Creates an `AudioWorkletNode` against `ctx`. `ctx` is always a genuine native context by the
 * time this runs (see `getAudioContext()`), so this is just the native constructor — kept as its
 * own function so call sites don't need to import `AudioWorkletNode` directly, and stay correct
 * if a caller ever passes some other, non-native context (e.g. a test's own).
 */
export function createWorkletNode(
  ctx: BaseAudioContext,
  name: string,
  options?: AudioWorkletNodeOptions,
): AudioWorkletNode {
  if (typeof BaseAudioContext !== 'undefined' && ctx instanceof BaseAudioContext) {
    return new AudioWorkletNode(ctx, name, options);
  }
  return Tone.getContext().createAudioWorkletNode(name, options) as unknown as AudioWorkletNode;
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

/**
 * The app-wide master gain (§5): every module's own master bus connects here instead of straight
 * to `ctx.destination`, so the shell's single volume/mute setting (see `apps/web/src/shell`)
 * multiplies on top of each module's own instrument-level volume. Created lazily on the shared
 * context, so it works whichever module happens to unlock audio first.
 */
let masterGain: GainNode | null = null;
let masterVolume = 1;
let masterMuted = false;

function applyMasterGain(): void {
  if (!masterGain) return;
  const target = masterMuted ? 0 : masterVolume;
  masterGain.gain.setTargetAtTime(target, masterGain.context.currentTime, 0.015);
}

/**
 * The node every module's master bus should connect to (instead of `ctx.destination`). Also
 * reroutes `Tone.Destination` (what `toDestination()` connects to — the progression module's
 * samplers) through this same gain the first time it's touched, so every module ends up here
 * without each Tone-based call site needing to know about it.
 */
export function getMasterDestination(): GainNode {
  if (!masterGain) {
    const ctx = getAudioContext();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    applyMasterGain();
    const toneDestination = Tone.getDestination();
    toneDestination.disconnect();
    toneDestination.connect(masterGain as unknown as AudioNode);
  }
  return masterGain;
}

/** 0–1, applied to every module's output via `getMasterDestination()`. */
export function setMasterVolume(volume: number): void {
  masterVolume = Math.min(1, Math.max(0, volume));
  applyMasterGain();
}

export function getMasterVolume(): number {
  return masterVolume;
}

export function setMasterMuted(muted: boolean): void {
  masterMuted = muted;
  applyMasterGain();
}

export function isMasterMuted(): boolean {
  return masterMuted;
}
