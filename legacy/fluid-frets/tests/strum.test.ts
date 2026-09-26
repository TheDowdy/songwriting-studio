import { describe, expect, it } from 'vitest';
import {
  crossedStrings,
  directionShaping,
  strokeDirection,
  StrumTracker,
  strumNotes,
  strumVelocity,
  TAP_THRESHOLD_PX,
} from '../src/theory/strum';

// String 0 (lowest) is at the bottom of the screen, so it has the largest y.
const ys = [200, 160, 120, 80, 40, 0];
const at = (y: number) => ({ x: 100, y });

describe('crossedStrings', () => {
  it('lists strings in the order the segment reaches them', () => {
    expect(crossedStrings(210, -10, ys).map((h) => h.string)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(crossedStrings(-10, 210, ys).map((h) => h.string)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('reports where along the segment each crossing happens', () => {
    const [hit] = crossedStrings(0, 100, [25]);
    expect(hit).toEqual({ string: 0, t: 0.25 });
  });

  it('does not fire for a segment that stays on one side, or has no vertical movement', () => {
    expect(crossedStrings(130, 150, ys)).toEqual([]);
    expect(crossedStrings(100, 100, ys)).toEqual([]);
  });

  it('fires once when the pointer lands exactly on a string and once more only after leaving', () => {
    expect(crossedStrings(170, 160, ys).map((h) => h.string)).toEqual([1]);
    // Resting on the line and moving on does not cross it again.
    expect(crossedStrings(160, 150, ys)).toEqual([]);
    expect(crossedStrings(160, 170, ys)).toEqual([]);
  });
});

describe('stroke direction', () => {
  it('is a downstroke when the low string is crossed first', () => {
    expect(strokeDirection(0, 1)).toBe('down');
    expect(strokeDirection(5, 4)).toBe('up');
  });

  it('makes upstrokes lighter and brighter', () => {
    const down = directionShaping('down');
    const up = directionShaping('up');
    expect(up.gain).toBeLessThan(down.gain);
    expect(up.brightness).toBeGreaterThan(down.brightness);
  });
});

describe('strumVelocity', () => {
  it('grows with drag speed and stays within 0.25–1', () => {
    const speeds = [0, 100, 400, 800, 1500, 3000, 10000];
    const v = speeds.map(strumVelocity);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1] as number);
    expect(v[0]).toBe(0.25);
    expect(v[v.length - 1]).toBe(1);
  });
});

describe('StrumTracker', () => {
  it('treats movement under the threshold as a tap and sounds nothing', () => {
    const t = new StrumTracker(at(100), 0, ys);
    expect(t.move({ x: 100 + TAP_THRESHOLD_PX - 1, y: 100 }, 20)).toEqual([]);
    expect(t.move({ x: 100, y: 104 }, 40)).toEqual([]);
    expect(t.isTap()).toBe(true);
  });

  it('turns into a strum once movement passes the threshold', () => {
    const t = new StrumTracker(at(100), 0, ys);
    t.move(at(100 + TAP_THRESHOLD_PX + 1), 10);
    expect(t.isTap()).toBe(false);
  });

  it('sounds strings low → high, as a downstroke, when dragged up the screen', () => {
    const t = new StrumTracker(at(230), 0, ys);
    const hits = [];
    for (let y = 230, time = 0; y >= -30; y -= 10, time += 5) hits.push(...t.move(at(y), time));
    expect(hits.map((h) => h.string)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(hits.slice(1).every((h) => h.direction === 'down')).toBe(true);
  });

  it('sounds strings high → low, as an upstroke, when dragged down the screen', () => {
    const t = new StrumTracker(at(-30), 0, ys);
    const hits = [];
    for (let y = -30, time = 0; y <= 230; y += 10, time += 5) hits.push(...t.move(at(y), time));
    expect(hits.map((h) => h.string)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(hits.every((h) => h.direction === 'up')).toBe(true);
  });

  it('gives a fast strum more velocity than a slow one', () => {
    const run = (msPerStep: number) => {
      const t = new StrumTracker(at(230), 0, ys);
      let last = 0;
      for (let y = 230, time = 0; y >= -30; y -= 10, time += msPerStep) {
        for (const h of t.move(at(y), time)) last = h.velocity;
      }
      return last;
    };
    expect(run(4)).toBeGreaterThan(run(40));
  });

  it('spreads strings crossed inside a single pointer sample over that sample’s duration', () => {
    const t = new StrumTracker(at(230), 0, ys);
    const hits = t.move(at(-30), 30);
    expect(hits.map((h) => h.string)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(hits[0]?.offsetMs).toBe(0);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]?.offsetMs).toBeGreaterThan(hits[i - 1]?.offsetMs as number);
    }
    expect(hits[5]?.offsetMs).toBeLessThan(30);
  });

  it('a horizontal slide crosses no strings and so sounds nothing', () => {
    const t = new StrumTracker(at(100), 0, ys);
    expect(t.move({ x: 300, y: 100 }, 50)).toEqual([]);
    expect(t.isTap()).toBe(false);
  });
});

describe('strumNotes', () => {
  const open = [40, 45, 50, 55, 59, 64];

  it('strums the open strings when there is no shape', () => {
    expect(strumNotes(open, null).map((n) => n?.midi)).toEqual(open);
  });

  it('leaves muted strings silent and offsets the rest by their fret', () => {
    const notes = strumNotes(open, [null, 3, 2, 0, 1, 0]);
    expect(notes[0]).toBeNull();
    expect(notes.slice(1).map((n) => n?.midi)).toEqual([48, 52, 55, 60, 64]);
    expect(notes.slice(1).map((n) => n?.fret)).toEqual([3, 2, 0, 1, 0]);
  });
});
