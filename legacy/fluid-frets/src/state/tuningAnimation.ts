import { useStore } from './store';

/** One running tween per string, so a new drag/step/preset cancels the previous one. */
const running = new Map<number, number>();

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function cancelAnimation(stringIndex: number): void {
  const id = running.get(stringIndex);
  if (id !== undefined) cancelAnimationFrame(id);
  running.delete(stringIndex);
}

/**
 * Slides the drawn pitch of one string to `target` over `ms` (the continuous-pitch mechanism the
 * labels are positioned from). Calls `onDone` when it lands, or straight away if there is nothing
 * to animate. Cancels any earlier animation on the same string.
 */
export function animateLive(
  stringIndex: number,
  target: number,
  ms: number,
  onDone?: () => void,
): void {
  cancelAnimation(stringIndex);
  const { setLive, liveTuning } = useStore.getState();
  const from = liveTuning[stringIndex] ?? target;
  if (ms <= 0 || from === target || prefersReducedMotion()) {
    setLive(stringIndex, target);
    onDone?.();
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    // rAF's timestamp is the frame's start time, which can precede our performance.now() call,
    // so progress can come out slightly negative on the first frame: clamp it.
    const t = Math.min(1, Math.max(0, (now - start) / ms));
    setLive(stringIndex, t >= 1 ? target : from + (target - from) * easeOutCubic(t));
    if (t < 1) running.set(stringIndex, requestAnimationFrame(step));
    else {
      running.delete(stringIndex);
      onDone?.();
    }
  };
  running.set(stringIndex, requestAnimationFrame(step));
}
