import { boardHeight, nutX } from './geometry';
import type { ResolvedSkin } from './guitarSkins';

interface Props {
  wires: readonly number[];
  skin: ResolvedSkin;
}

/** Nut and fret wires (right-handed coordinates). */
export function Frets({ wires, skin }: Props) {
  const { nut, fretWire } = skin.model;
  return (
    <g>
      <rect x={nutX - 5} y={0} width={5} height={boardHeight} fill={nut} />
      {wires.slice(1).map((x, i) => (
        <g key={i}>
          <line x1={x} x2={x} y1={0} y2={boardHeight} stroke={fretWire[1]} strokeWidth={3.2} />
          <line x1={x} x2={x} y1={0} y2={boardHeight} stroke={fretWire[0]} strokeWidth={1.6} />
        </g>
      ))}
    </g>
  );
}
