/**
 * A standard chord chart (moved here from the guitar module in Songwriting Studio Phase 4 item 4,
 * so a committed voicing's mini diagram can also show in the progression module's timeline in
 * Phase 5 — every consumer of the rich chord vocabulary lives in a shared package, never in one
 * module only). Strings run up the page (lowest on the left), frets down it. ○ marks an open
 * string, ✕ a muted one, and a fret number on the left shows where a high shape sits.
 */
import { pitchClass } from '@sw/core/fret/notes';
import { fingering, shapeText } from '@sw/core/fret/voicings';

export interface ChordDiagramProps {
  /** Per string, 0 = lowest: fret, or null for muted. Relative to the capo when there is one
   *  (0 = capo/open), matching every other shape in the guitar module. */
  frets: readonly (number | null)[];
  /** Open-string MIDI notes, to find which dots are the root. */
  tuning: readonly number[];
  rootPc: number;
  /** 'default' (the tool's voicing browser and the chord header) or 'mini' — about 44 px wide, for
   *  a committed chord shown in a strip or timeline block (Phase 4 item 4). */
  size?: 'default' | 'mini';
  /** A small "Capo N" tag (mini only — the default size already sits somewhere that shows the
   *  capo another way), shown when it's greater than 0. */
  capo?: number;
}

/** Every geometry constant for one size, in SVG user units. `mini` is not just `default` scaled
 *  down — its dot/text sizes are chosen so it stays legible at roughly 44 px wide, not merely small. */
interface Geometry {
  left: number;
  /** Gap between the fret-number label's right edge and the leftmost string. */
  fretLabelGap: number;
  top: number;
  stringGap: number;
  fretGap: number;
  minRows: number;
  widthPad: number;
  heightPad: number;
  lineWidth: number;
  nutWidth: number;
  dotR: number;
  openR: number;
  openCy: number;
  muteY: number;
  muteFontSize: number;
  fretFontSize: number;
  barreInset: number;
  barreYPad: number;
  barreHeightPad: number;
}

const DEFAULT_GEOMETRY: Geometry = {
  left: 18,
  fretLabelGap: 6,
  top: 17,
  stringGap: 9,
  fretGap: 11,
  minRows: 5,
  widthPad: 10,
  heightPad: 6,
  lineWidth: 0.8,
  nutWidth: 2.4,
  dotR: 3.7,
  openR: 2.6,
  openCy: 8,
  muteY: 11,
  muteFontSize: 9,
  fretFontSize: 7,
  barreInset: 3.6,
  barreYPad: 1.8,
  barreHeightPad: 3.6,
};

const MINI_GEOMETRY: Geometry = {
  // Wide enough for a "12fr" label at fretFontSize, so a shape up the neck isn't clipped at x = 0.
  left: 17,
  fretLabelGap: 2,
  top: 6,
  stringGap: 5,
  fretGap: 5.6,
  minRows: 4,
  widthPad: 5,
  heightPad: 3,
  lineWidth: 0.6,
  nutWidth: 1.5,
  dotR: 2,
  openR: 1.4,
  openCy: 4.5,
  muteY: 6,
  muteFontSize: 5,
  fretFontSize: 5.5,
  barreInset: 2,
  barreYPad: 1,
  barreHeightPad: 2,
};

export function ChordDiagram({ frets, tuning, rootPc, size = 'default', capo }: ChordDiagramProps) {
  const g = size === 'mini' ? MINI_GEOMETRY : DEFAULT_GEOMETRY;
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const maxF = fretted.length ? Math.max(...fretted) : 1;
  const start = maxF <= g.minRows ? 1 : minF;
  const rows = Math.max(g.minRows, maxF - start + 1);
  const x = (s: number) => g.left + s * g.stringGap;
  const width = g.left + (frets.length - 1) * g.stringGap + g.widthPad;
  const height = g.top + rows * g.fretGap + g.heightPad;
  const { barre } = fingering(frets);
  const barreStrings = barre === null ? [] : frets.flatMap((f, s) => (f === barre ? [s] : []));

  return (
    <svg
      className={size === 'mini' ? 'chord-diagram chord-diagram--mini' : 'chord-diagram'}
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
          y1={g.top + r * g.fretGap}
          y2={g.top + r * g.fretGap}
          stroke="currentColor"
          strokeWidth={r === 0 && start === 1 ? g.nutWidth : g.lineWidth}
        />
      ))}
      {frets.map((_, s) => (
        <line
          key={s}
          x1={x(s)}
          x2={x(s)}
          y1={g.top}
          y2={g.top + rows * g.fretGap}
          stroke="currentColor"
          strokeWidth={g.lineWidth}
        />
      ))}
      {start > 1 && (
        <text
          x={g.left - g.fretLabelGap}
          y={g.top + g.fretGap * 0.72}
          fontSize={g.fretFontSize}
          textAnchor="end"
          fill="currentColor"
        >
          {start}fr
        </text>
      )}
      {!!capo && (
        <text
          x={width}
          y={g.fretFontSize}
          fontSize={g.fretFontSize}
          textAnchor="end"
          fill="currentColor"
          className="diagram-capo"
        >
          {`Capo ${capo}`}
        </text>
      )}
      {frets.map((f, s) =>
        f === null ? (
          <text key={s} x={x(s)} y={g.muteY} fontSize={g.muteFontSize} textAnchor="middle" fill="currentColor">
            ✕
          </text>
        ) : f === 0 ? (
          <circle
            key={s}
            cx={x(s)}
            cy={g.openCy}
            r={g.openR}
            fill="none"
            stroke="currentColor"
            strokeWidth={g.lineWidth * 1.1}
          />
        ) : null,
      )}
      {barre !== null && barreStrings.length > 1 && (
        <rect
          x={x(barreStrings[0] as number) - g.barreInset}
          y={g.top + (barre - start) * g.fretGap + g.barreYPad}
          width={
            x(barreStrings[barreStrings.length - 1] as number) - x(barreStrings[0] as number) + g.barreInset * 2
          }
          height={g.fretGap - g.barreHeightPad}
          rx={g.barreInset}
          className="diagram-dot"
        />
      )}
      {frets.map((f, s) =>
        f !== null && f > 0 ? (
          <circle
            key={s}
            cx={x(s)}
            cy={g.top + (f - start) * g.fretGap + g.fretGap / 2}
            r={g.dotR}
            className={
              pitchClass((tuning[s] as number) + f) === rootPc ? 'diagram-dot root' : 'diagram-dot'
            }
          />
        ) : null,
      )}
    </svg>
  );
}
