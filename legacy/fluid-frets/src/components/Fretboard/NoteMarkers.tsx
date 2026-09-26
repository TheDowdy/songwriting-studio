import { memo, useEffect, useRef } from 'react';
import type { DisplayModel } from '../../hooks/useScaleView';
import { onPluck } from '../../state/pluckEvents';
import { useStore } from '../../state/store';
import { edgeOpacity, slidingNotes } from '../../theory/fretboard';
import { formatNoteName, pitchClass, type Spelling } from '../../theory/notes';
import {
  interpolateAtFret,
  interpolateClamped,
  markerRadius,
  mirrorX,
  stringY,
  STRING_COUNT,
} from './geometry';
import { markerStyle, type ScaleStyleOptions } from './markerStyle';
import { skin } from './skin';

interface StringProps {
  /** 0 = lowest string. */
  string: number;
  fretCount: number;
  centres: readonly number[];
  spaces: readonly number[];
  spelling: Spelling;
  leftHanded: boolean;
  /** Null in explore mode. */
  display: DisplayModel | null;
  /** Pale board (maple): dark outlines for out-of-key notes. */
  lightBoard: boolean;
}

/** Font size that keeps 1–3 character labels (F, F♯, F𝄪) inside a marker of radius r. */
function labelSize(r: number, label: string): number {
  const chars = [...label].length;
  return r * (chars === 1 ? 1.15 : chars === 2 ? 0.95 : 0.8);
}

/** Gap between a marker and its overlay ring, and the ring's line width. */
const RING_GAP = 2.4;
const RING_WIDTH = 2.4;

/**
 * All the note markers of one string. Each is placed from its pitch (fret = midi − string
 * pitch), so when the string's live pitch changes the labels slide along the neck. It selects
 * only its own string's pitch, so a peg drag re-renders one string, not six. Scale mode styles
 * each marker by its pitch class, so notes keep their role as they slide.
 */
const StringMarkers = memo(function StringMarkers({
  string,
  fretCount,
  centres,
  spaces,
  spelling,
  leftHanded,
  display,
  lightBoard,
}: StringProps) {
  const pitch = useStore((s) => s.liveTuning[string]) ?? 40;
  // The fret being sounded by scale playback on this string, if any (one string re-renders per step).
  const playheadFret = useStore((s) => (s.playhead?.string === string ? s.playhead.fret : null));
  const cy = stringY(string);
  const styleOptions: ScaleStyleOptions | null = display && {
    colourMode: display.colourMode,
    palette: display.palette,
    hideOutOfScale: display.hideOutOfScale,
    chromatic: display.chromatic,
  };
  // undefined: string not in the fingering (drawn normally); null: muted; number: the fret played.
  const shapeFret = display?.shape ? display.shape[string] : undefined;

  return (
    <g>
      {slidingNotes(pitch, fretCount).map(({ midi, fret }) => {
        const edge = edgeOpacity(fret, fretCount);
        if (edge <= 0) return null;
        const pc = pitchClass(midi);
        // Only a marker sitting exactly on a fret is a tap target (always true at rest).
        const onFret = Math.abs(fret - Math.round(fret)) < 1e-6 && fret >= 0 && fret <= fretCount;
        // A note in the fingering gets the overlay ring whatever its role, and is never hidden.
        const inShape = onFret && shapeFret === Math.round(fret);
        const baseView = display?.views[pc];
        const view = inShape && baseView ? { ...baseView, overlay: true } : baseView;
        const style = markerStyle(view, styleOptions, lightBoard);
        if (!style.visible) return null;
        const label =
          display?.labels?.[pc] ?? formatNoteName(spelling[pc] as (typeof spelling)[number]);
        const r = markerRadius(interpolateClamped(spaces, fret)) * style.scale;
        const cx = mirrorX(interpolateAtFret(centres, fret), leftHanded);
        // A string muted in the fingering shows ✕ in its open-note slot instead of a note.
        if (onFret && Math.round(fret) === 0 && shapeFret === null) {
          return (
            <g key={midi} opacity={edge} data-string={string} data-fret={0} data-muted="">
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="transparent"
                stroke="none"
                className="marker-dot"
              />
              <text x={cx} y={cy} fontSize={r * 1.3} fontWeight={700} fill={skin.mutedMark}>
                ✕
              </text>
            </g>
          );
        }
        const sounding = onFret && playheadFret === Math.round(fret);
        return (
          <g
            key={midi}
            opacity={edge}
            data-string={onFret ? string : undefined}
            data-fret={onFret ? Math.round(fret) : undefined}
            data-midi={midi}
            data-role={baseView?.role}
            data-degree={baseView?.degree?.label}
            data-overlay={baseView?.overlay ? '' : undefined}
            data-shape={inShape ? '' : undefined}
            data-sounding={sounding ? '' : undefined}
            pointerEvents={onFret ? undefined : 'none'}
          >
            {style.ring && (
              <g fill="none" pointerEvents="none">
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + RING_GAP}
                  stroke={skin.ringHalo}
                  strokeWidth={RING_WIDTH + 2.2}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + RING_GAP}
                  stroke={skin.ring}
                  strokeWidth={RING_WIDTH}
                />
              </g>
            )}
            <g opacity={style.opacity}>
              <circle
                className="marker-dot"
                cx={cx}
                cy={cy}
                r={r}
                fill={style.fill}
                stroke={sounding ? skin.playhead : style.stroke}
                strokeWidth={sounding ? 3.6 : style.strokeWidth}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
              {style.dashed && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r * 0.68}
                  fill="none"
                  stroke={style.text}
                  strokeWidth={1.3}
                  strokeDasharray="2.4 2"
                  pointerEvents="none"
                />
              )}
              <text
                x={cx}
                y={cy}
                fontSize={labelSize(r, label)}
                fontWeight={sounding ? 800 : 600}
                fill={style.text}
              >
                {label}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
});

interface Props {
  fretCount: number;
  centres: readonly number[];
  spaces: readonly number[];
  spelling: Spelling;
  leftHanded: boolean;
  display: DisplayModel | null;
  /** Pale board (maple): dark outlines for out-of-key notes. */
  lightBoard: boolean;
}

/** A circle + label in every fret space, and one per string behind the nut for the open note. */
export function NoteMarkers(props: Props) {
  const ref = useRef<SVGGElement>(null);

  // Pulse the marker of any note that sounds, whether tapped, strummed or played back.
  useEffect(
    () =>
      onPluck(({ string, fret }) => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        ref.current
          ?.querySelector(`[data-string="${string}"][data-fret="${fret}"] .marker-dot`)
          ?.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
            { duration: 380, easing: 'ease-out' },
          );
      }),
    [],
  );

  return (
    <g
      ref={ref}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="system-ui, sans-serif"
      className="markers"
    >
      {Array.from({ length: STRING_COUNT }, (_, string) => (
        <StringMarkers key={string} string={string} {...props} />
      ))}
    </g>
  );
}
