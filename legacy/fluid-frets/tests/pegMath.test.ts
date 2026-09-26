import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  dragPitch,
  MAX_OVERSHOOT,
  PX_PER_SEMITONE,
  pegRange,
  rubberBand,
  snapPitch,
  WheelStepper,
  wheelDeltaPixels,
} from '../src/components/TuningPeg/pegMath';

describe('drag maths', () => {
  const range: [number, number] = [38, 50]; // A string: 45 −7 … +5

  it('24 px per semitone, dragging up raises the pitch', () => {
    expect(PX_PER_SEMITONE).toBe(24);
    expect(dragPitch(45, 24, range)).toBeCloseTo(46, 10);
    expect(dragPitch(45, -48, range)).toBeCloseTo(43, 10);
    expect(dragPitch(45, 12, range)).toBeCloseTo(45.5, 10);
    expect(dragPitch(45, 0, range)).toBe(45);
  });

  it('is continuous, so the ringing note can glide', () => {
    let prev = dragPitch(45, -200, range);
    for (let dy = -199; dy <= 200; dy++) {
      const p = dragPitch(45, dy, range);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p - prev).toBeLessThan(0.05);
      prev = p;
    }
  });

  it('rubber-bands past the limits and never exceeds the overshoot cap', () => {
    expect(rubberBand(50, 38, 50)).toBe(50);
    expect(rubberBand(50.2, 38, 50)).toBeGreaterThan(50);
    expect(rubberBand(50.2, 38, 50)).toBeLessThan(50.2); // resisted
    expect(rubberBand(1000, 38, 50)).toBeLessThanOrEqual(50 + MAX_OVERSHOOT);
    expect(rubberBand(-1000, 38, 50)).toBeGreaterThanOrEqual(38 - MAX_OVERSHOOT);
    expect(rubberBand(-1000, 38, 50)).toBeLessThan(38);
  });

  it('snaps to the nearest semitone inside the range', () => {
    expect(snapPitch(43.4, range)).toBe(43);
    expect(snapPitch(43.6, range)).toBe(44);
    expect(snapPitch(50.4, range)).toBe(50); // rubber-band overshoot lands on the limit
    expect(snapPitch(37.6, range)).toBe(38);
    expect(snapPitch(1e6, range)).toBe(50);
  });

  it('widens the range to include a preset that sits outside it', () => {
    // Nashville: the low string is E3 (52) although its normal ceiling is 45.
    expect(pegRange(0, 52, false)).toEqual([33, 52]);
    expect(pegRange(0, 40, false)).toEqual([33, 45]);
    expect(pegRange(0, 40, true)).toEqual([16, 64]);
    expect(pegRange(0, 20, false)).toEqual([20, 45]);
  });
});

describe('wheel stepping', () => {
  it('one notch (100 px) is one semitone; up raises', () => {
    const w = new WheelStepper();
    expect(w.feed(-100, 0)).toBe(1);
    expect(w.feed(100, 1000)).toBe(-1);
  });

  it('accumulates small trackpad deltas and resets when idle', () => {
    const w = new WheelStepper();
    expect(w.feed(-20, 0)).toBe(0);
    expect(w.feed(-20, 10)).toBe(0);
    expect(w.feed(-20, 20)).toBe(1); // 60 ≥ 50
    expect(w.feed(-20, 30)).toBe(0); // restarted
    expect(w.feed(-20, 2000)).toBe(0); // idle → accumulation discarded
    expect(w.feed(-20, 2010)).toBe(0);
  });

  it('opposite directions cancel', () => {
    const w = new WheelStepper();
    expect(w.feed(-40, 0)).toBe(0);
    expect(w.feed(30, 10)).toBe(0);
    expect(w.feed(-30, 20)).toBe(0); // net −40
  });

  it('normalises line and page deltas', () => {
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2 })).toBe(400);
    expect(wheelDeltaPixels({ deltaY: 100, deltaMode: 0 })).toBe(100);
  });
});

describe('animateLive', () => {
  let frame: ((t: number) => void) | null = null;
  let now = 0;

  beforeEach(async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frame = null;
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    now = 0;
    const { useStore } = await import('../src/state/store');
    useStore.getState().jumpToTuning({
      id: 'x',
      name: 'x',
      strings: [40, 45, 50, 55, 59, 64],
      builtIn: false,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('slides the drawn pitch and lands exactly on the target', async () => {
    const { useStore } = await import('../src/state/store');
    const { animateLive } = await import('../src/state/tuningAnimation');
    const done = vi.fn();
    animateLive(1, 43, 300, done);
    expect(useStore.getState().liveTuning[1]).toBe(45); // nothing until the first frame

    const seen: number[] = [];
    for (const t of [50, 100, 200, 300]) {
      now = t;
      frame?.(t);
      seen.push(useStore.getState().liveTuning[1] as number);
    }
    expect(seen[0]).toBeLessThan(45);
    for (let i = 1; i < seen.length; i++)
      expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] as number);
    expect(seen.at(-1)).toBe(43); // exact, not 43.0000001
    expect(done).toHaveBeenCalledOnce();
    expect(useStore.getState().liveTuning[0]).toBe(40); // other strings untouched
  });

  it('never moves away from the target on the first frame (rAF time can precede the start time)', async () => {
    const { useStore } = await import('../src/state/store');
    const { animateLive } = await import('../src/state/tuningAnimation');
    now = 100;
    animateLive(1, 43, 300);
    frame?.(96); // the frame began 4 ms before performance.now() was read
    expect(useStore.getState().liveTuning[1]).toBe(45); // not 45.03… (overshoot the wrong way)
    frame?.(110);
    expect(useStore.getState().liveTuning[1]).toBeLessThan(45);
  });

  it('completes immediately when there is nothing to animate', async () => {
    const { animateLive } = await import('../src/state/tuningAnimation');
    const done = vi.fn();
    animateLive(2, 50, 300, done);
    expect(done).toHaveBeenCalledOnce();
    animateLive(2, 48, 0, done);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('a new animation on the same string replaces the old one', async () => {
    const { useStore } = await import('../src/state/store');
    const { animateLive } = await import('../src/state/tuningAnimation');
    const first = vi.fn();
    animateLive(3, 50, 300, first);
    animateLive(3, 57, 0);
    expect(useStore.getState().liveTuning[3]).toBe(57);
    expect(first).not.toHaveBeenCalled();
  });
});
