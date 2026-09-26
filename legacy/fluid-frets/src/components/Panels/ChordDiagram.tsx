import { pitchClass } from '../../theory/notes';
import { fingering, shapeText } from '../../theory/voicings';

interface Props {
  /** Per string, 0 = lowest: fret, or null for muted. */
  frets: readonly (number | null)[];
  /** Open-string MIDI notes, to find which dots are the root. */
  tuning: readonly number[];
  rootPc: number;
}

const LEFT = 18;
const TOP = 17;
const STRING_GAP = 9;
const FRET_GAP = 11;
const MIN_ROWS = 5;

/**
 * A standard chord chart: strings run up the page (lowest on the left), frets down it. ○ marks an
 * open string, ✕ a muted one, and a fret number on the left shows where a high shape sits.
 */
export function ChordDiagram({ frets, tuning, rootPc }: Props) {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const maxF = fretted.length ? Math.max(...fretted) : 1;
  const start = maxF <= MIN_ROWS ? 1 : minF;
  const rows = Math.max(MIN_ROWS, maxF - start + 1);
  const x = (s: number) => LEFT + s * STRING_GAP;
  const width = LEFT + (frets.length - 1) * STRING_GAP + 10;
  const height = TOP + rows * FRET_GAP + 6;
  const { barre } = fingering(frets);
  const barreStrings = barre === null ? [] : frets.flatMap((f, s) => (f === barre ? [s] : []));

  return (
    <svg
      className="chord-diagram"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={shapeText(frets)}
    >
      {Array.from({ length: rows + 1 }, (_, r) => (
        <line
          key={r}
          x1={x(0)}
          x2={x(frets.length - 1)}
          y1={TOP + r * FRET_GAP}
          y2={TOP + r * FRET_GAP}
          stroke="currentColor"
          strokeWidth={r === 0 && start === 1 ? 2.4 : 0.8}
        />
      ))}
      {frets.map((_, s) => (
        <line
          key={s}
          x1={x(s)}
          x2={x(s)}
          y1={TOP}
          y2={TOP + rows * FRET_GAP}
          stroke="currentColor"
          strokeWidth={0.8}
        />
      ))}
      {start > 1 && (
        <text
          x={LEFT - 6}
          y={TOP + FRET_GAP * 0.72}
          fontSize="7"
          textAnchor="end"
          fill="currentColor"
        >
          {start}fr
        </text>
      )}
      {frets.map((f, s) =>
        f === null ? (
          <text key={s} x={x(s)} y={11} fontSize="9" textAnchor="middle" fill="currentColor">
            ✕
          </text>
        ) : f === 0 ? (
          <circle
            key={s}
            cx={x(s)}
            cy={8}
            r={2.6}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.9}
          />
        ) : null,
      )}
      {barre !== null && barreStrings.length > 1 && (
        <rect
          x={x(barreStrings[0] as number) - 3.6}
          y={TOP + (barre - start) * FRET_GAP + 1.8}
          width={
            x(barreStrings[barreStrings.length - 1] as number) - x(barreStrings[0] as number) + 7.2
          }
          height={FRET_GAP - 3.6}
          rx={3.6}
          className="diagram-dot"
        />
      )}
      {frets.map((f, s) =>
        f !== null && f > 0 ? (
          <circle
            key={s}
            cx={x(s)}
            cy={TOP + (f - start) * FRET_GAP + FRET_GAP / 2}
            r={3.7}
            className={
              pitchClass((tuning[s] as number) + f) === rootPc ? 'diagram-dot root' : 'diagram-dot'
            }
          />
        ) : null,
      )}
    </svg>
  );
}
