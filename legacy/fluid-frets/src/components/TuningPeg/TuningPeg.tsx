import { memo, useEffect, useRef } from 'react';
import { audioEngine } from '../../audio/engine';
import type { VoiceHandle } from '../../audio/instrument';
import { commitStringPitch, SNAP_MS } from '../../state/tuningActions';
import { animateLive, cancelAnimation } from '../../state/tuningAnimation';
import { useStore } from '../../state/store';
import { midiToName } from '../../theory/notes';
import { mirrorX, PEG, stringY, STRING_COUNT } from '../Fretboard/geometry';
import { dragPitch, pegRange, snapPitch, WheelStepper, wheelDeltaPixels } from './pegMath';

const ROW = 17;
/** Pitch changes are sent to the audio engine with a short ramp so the note glides (legato). */
const GLIDE_RAMP_MS = 40;

interface Props {
  /** 0 = lowest (6th) string. */
  string: number;
  leftHanded: boolean;
}

interface Drag {
  pointerId: number;
  startY: number;
  startPitch: number;
  clientY: number;
  raf: number | null;
  voice: VoiceHandle | null;
  pitch: number;
}

/**
 * A "drum roller" tuning peg for one string (§5): drag vertically to retune with the note gliding,
 * or use the mouse wheel / arrow keys to step a semitone at a time.
 */
export const TuningPeg = memo(function TuningPeg({ string, leftHanded }: Props) {
  const live = useStore((s) => s.liveTuning[string]) ?? 40;
  const pref = useStore((s) => s.accidentalPref);
  const ref = useRef<SVGGElement>(null);
  const drag = useRef<Drag | null>(null);
  const wheel = useRef(new WheelStepper());

  const cx = mirrorX(PEG.x + PEG.width / 2, leftHanded);
  const cy = stringY(string);
  const x = cx - PEG.width / 2;
  const y = cy - PEG.height / 2;
  const stringNumber = STRING_COUNT - string;
  const name = midiToName(Math.round(live), pref);

  /** Applies a live pitch: redraw and glide the ringing note. */
  const setPitch = (d: Drag, pitch: number) => {
    d.pitch = pitch;
    useStore.getState().setLive(string, pitch);
    if (d.voice) audioEngine.setPitch(d.voice, pitch, GLIDE_RAMP_MS);
  };

  const flush = (d: Drag) => {
    d.raf = null;
    const state = useStore.getState();
    const range = pegRange(string, d.startPitch, state.unlimitedRange);
    setPitch(d, dragPitch(d.startPitch, d.startY - d.clientY, range));
  };

  const onPointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelAnimation(string);
    const state = useStore.getState();
    const startPitch = state.liveTuning[string] ?? state.tuning.strings[string] ?? 40;
    // Press = pluck at the open pitch, full velocity; the drag then bends that ringing note.
    const voice = audioEngine.pluck(string, startPitch, { velocity: 1 });
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startPitch,
      clientY: e.clientY,
      raf: null,
      voice,
      pitch: startPitch,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.clientY = e.clientY;
    // At most one update per frame, however fast the pointer events arrive.
    d.raf ??= requestAnimationFrame(() => flush(d));
  };

  const endDrag = (e: React.PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.raf !== null) cancelAnimationFrame(d.raf);
    const state = useStore.getState();
    const range = pegRange(string, d.startPitch, state.unlimitedRange);
    const raw = dragPitch(d.startPitch, d.startY - e.clientY, range);
    const snapped = snapPitch(raw, range);
    // Settle on the semitone: the drawn labels and the ringing note both land on it.
    if (d.voice) audioEngine.setPitch(d.voice, snapped, SNAP_MS);
    useStore.getState().setLive(string, raw);
    animateLive(string, snapped, SNAP_MS);
    commitStringPitch(string, snapped);
  };

  /** One semitone up (+1) or down (−1), with a short pluck. Used by the wheel and the keyboard. */
  const step = (dir: 1 | -1) => {
    const state = useStore.getState();
    const current = state.tuning.strings[string] ?? 40;
    const range = pegRange(string, current, state.unlimitedRange);
    const next = snapPitch(current + dir, range);
    if (next === current) return;
    cancelAnimation(string);
    animateLive(string, next, SNAP_MS);
    commitStringPitch(string, next);
    audioEngine.pluck(string, next, { velocity: 0.6 });
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // Native listeners: React's wheel/touch handlers are passive, so they can't stop the page from
  // scrolling while the pointer is over a peg.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = wheel.current.feed(wheelDeltaPixels(e), e.timeStamp);
      if (dir !== 0) stepRef.current(dir);
    };
    const stopScroll = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', stopScroll, { passive: false });
    el.addEventListener('touchmove', stopScroll, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', stopScroll);
      el.removeEventListener('touchmove', stopScroll);
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<SVGGElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') step(-1);
    else return;
    e.preventDefault();
  };

  // The reel: the current note in the centre, semitone neighbours above/below, fading out.
  const rows = [Math.floor(live) - 1, Math.floor(live), Math.ceil(live), Math.ceil(live) + 1];
  const shown = [...new Set(rows)];
  const clipId = `peg-clip-${string}`;

  return (
    <g
      ref={ref}
      className="peg"
      role="slider"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`String ${stringNumber} tuning, ${name}`}
      aria-valuenow={Math.round(live)}
      aria-valuetext={name}
      data-string={undefined}
      data-peg={string}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={PEG.width} height={PEG.height} rx={7} />
        </clipPath>
      </defs>
      <rect
        className="peg-body"
        x={x}
        y={y}
        width={PEG.width}
        height={PEG.height}
        rx={7}
        fill="url(#fs-drum)"
        stroke="rgba(0,0,0,0.6)"
      />
      <g
        clipPath={`url(#${clipId})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="system-ui, sans-serif"
      >
        {shown.map((m) => {
          const d = Math.abs(m - live);
          const opacity = Math.max(0, 1 - d * 0.85);
          if (opacity <= 0.02) return null;
          return (
            <text
              key={m}
              x={cx}
              y={cy - (m - live) * ROW}
              fontSize={15 - Math.min(d, 1.4) * 4}
              fontWeight={d < 0.5 ? 700 : 500}
              fill="#f2ead3"
              opacity={opacity}
            >
              {midiToName(m, pref)}
            </text>
          );
        })}
      </g>
      {/* Shading over the reel gives the drum its curve. */}
      <rect
        x={x}
        y={y}
        width={PEG.width}
        height={PEG.height}
        rx={7}
        fill="url(#fs-drum-shade)"
        pointerEvents="none"
      />
      <rect
        className="peg-focus"
        x={x - 2}
        y={y - 2}
        width={PEG.width + 4}
        height={PEG.height + 4}
        rx={9}
        fill="none"
        pointerEvents="none"
      />
    </g>
  );
});
