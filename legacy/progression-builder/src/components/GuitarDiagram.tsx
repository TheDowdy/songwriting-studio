import { guitarShapeFor } from '@sw/core';
import type { ChordRef } from '@sw/core';

const STRINGS = 6;
const FRETS_SHOWN = 4;
const W = 140;
const TOP = 34; // room for open/muted markers above the nut
const FRET_H = 26;
const H = TOP + FRET_H * FRETS_SHOWN + 16;
const MARGIN_X = 14;
const stringX = (i: number) => MARGIN_X + (i * (W - MARGIN_X * 2)) / (STRINGS - 1);
const fretY = (row: number) => TOP + row * FRET_H;

interface Props {
  chord: ChordRef;
}

/** A chord diagram (section 9): curated movable E-shape/A-shape, or an algorithmically generated
 *  shape, labelled as such. */
export default function GuitarDiagram({ chord }: Props) {
  const shape = guitarShapeFor(chord);
  const { frets, baseFret } = shape;
  const showNut = baseFret === 1;

  return (
    <figure className="inline-flex flex-col items-center gap-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Guitar diagram, frets ${frets.map((f) => (f === null ? 'muted' : f)).join(', ')}`}>
        {/* Open/muted markers */}
        {frets.map((f, i) => (
          <text key={`m-${i}`} x={stringX(i)} y={TOP - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill={f === null ? 'var(--muted)' : 'var(--fg)'}>
            {f === null ? '×' : f === 0 ? '○' : ''}
          </text>
        ))}

        {/* Nut or fret-position label */}
        {showNut ? (
          <rect x={MARGIN_X} y={TOP - 2} width={W - MARGIN_X * 2} height={4} rx={1} fill="var(--fg)" />
        ) : (
          <text x={2} y={fretY(0.5) + 4} textAnchor="start" fontSize={12} fill="var(--muted)">
            {baseFret}fr
          </text>
        )}

        {/* Frets (horizontal lines) */}
        {Array.from({ length: FRETS_SHOWN + 1 }, (_, row) => (
          <line key={`h-${row}`} x1={MARGIN_X} y1={fretY(row)} x2={W - MARGIN_X} y2={fretY(row)} stroke="var(--line)" strokeWidth={row === 0 && !showNut ? 1.5 : 1} />
        ))}

        {/* Strings (vertical lines) */}
        {Array.from({ length: STRINGS }, (_, i) => (
          <line key={`v-${i}`} x1={stringX(i)} y1={TOP} x2={stringX(i)} y2={fretY(FRETS_SHOWN)} stroke="var(--line)" strokeWidth={1} />
        ))}

        {/* Fretted notes */}
        {frets.map((f, i) => {
          if (f === null || f === 0) return null;
          const rel = f - baseFret + 1; // 1-based row within the shown window
          if (rel < 1 || rel > FRETS_SHOWN) return null;
          return <circle key={`d-${i}`} cx={stringX(i)} cy={fretY(rel - 0.5)} r={8} fill="var(--accent)" />;
        })}
      </svg>
      <figcaption className="text-[11px] text-muted">{shape.generated ? 'Generated voicing' : 'Guitar'}</figcaption>
    </figure>
  );
}
