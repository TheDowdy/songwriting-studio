import { useMemo, useRef } from 'react';
import { stringY } from '../components/Fretboard/geometry';
import { tapFret } from '../state/tap';
import { playStrumHit } from '../state/playing';
import { StrumTracker } from '../theory/strum';
import { STRING_COUNT } from '../theory/tunings';

/**
 * A press that stays put this long without releasing is a held tap, so it sounds now rather than
 * waiting for release. (A tap otherwise waits for release so it can't fire before a strum starts.)
 */
const HOLD_TAP_MS = 80;

interface Gesture {
  tracker: StrumTracker;
  /** The note under the pointer when it went down, if it was on a marker. */
  tap: { string: number; fret: number } | null;
  tapFired: boolean;
  holdTimer: number;
}

/**
 * Pointer handlers for the fretboard SVG (PLAN.md §7). A press that stays within 8 px is a tap and
 * plucks the note it started on. A drag crosses string lines and sounds each string the instant it
 * is crossed, so strum speed is drag speed; the note under the initial press does not also fire.
 * Works with mouse, touch and pen, one gesture per pointer.
 */
export function useStrumGestures() {
  const gestures = useRef(new Map<number, Gesture>());

  return useMemo(() => {
    const finish = (pointerId: number): Gesture | undefined => {
      const g = gestures.current.get(pointerId);
      if (g) window.clearTimeout(g.holdTimer);
      gestures.current.delete(pointerId);
      return g;
    };

    return {
      onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // Tuning pegs handle their own drags.
        if ((e.target as Element).closest('[data-peg]')) return;
        const ctm = e.currentTarget.getScreenCTM();
        if (!ctm) return;
        const ys = Array.from({ length: STRING_COUNT }, (_, i) => ctm.d * stringY(i) + ctm.f);
        const marker = (e.target as Element).closest<SVGGElement>('[data-string]');
        const pointerId = e.pointerId;
        const gesture: Gesture = {
          tracker: new StrumTracker({ x: e.clientX, y: e.clientY }, e.timeStamp, ys),
          tap: marker
            ? { string: Number(marker.dataset.string), fret: Number(marker.dataset.fret) }
            : null,
          tapFired: false,
          holdTimer: window.setTimeout(() => {
            const g = gestures.current.get(pointerId);
            if (g?.tap && g.tracker.isTap() && !g.tapFired) {
              g.tapFired = true;
              tapFret(g.tap.string, g.tap.fret);
            }
          }, HOLD_TAP_MS),
        };
        gestures.current.set(pointerId, gesture);
        // Keep receiving moves if the pointer leaves the board mid-strum.
        e.currentTarget.setPointerCapture(pointerId);
      },

      onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
        const g = gestures.current.get(e.pointerId);
        if (!g) return;
        // Coalesced events keep fast strums from skipping strings between animation frames.
        const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const s of samples.length > 0 ? samples : [e.nativeEvent]) {
          for (const hit of g.tracker.move({ x: s.clientX, y: s.clientY }, s.timeStamp)) {
            playStrumHit(hit);
          }
        }
      },

      onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
        const g = finish(e.pointerId);
        if (g?.tap && g.tracker.isTap() && !g.tapFired) tapFret(g.tap.string, g.tap.fret);
      },

      onPointerCancel(e: React.PointerEvent<SVGSVGElement>) {
        finish(e.pointerId);
      },
    };
  }, []);
}
