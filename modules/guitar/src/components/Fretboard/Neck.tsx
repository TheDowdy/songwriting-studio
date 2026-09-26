import { boardHeight, LAYOUT, nutX } from './geometry';
import type { ResolvedSkin } from './guitarSkins';
import { paint } from './guitarSkins';
import { ShapeView } from './ShapeView';
import { skin as ui } from './skin';

const lastWireX = nutX + LAYOUT.neckLength;
const boardEndX = lastWireX + LAYOUT.boardOverhang;
const BINDING = 3.5;

/**
 * Everything that isn't a string, fret or note: the body edge past the last fret, the headstock,
 * and the fretboard, in the selected guitar's woods and finish. Right-handed coordinates.
 * The body is drawn first, so the board and headstock always sit over it and no shape can cover a
 * note marker (markers are drawn after all of this).
 */
export function Neck({ skin }: { skin: ResolvedSkin }) {
  const { model, wood } = skin;
  const [head, ...headDecor] = model.headstock.shapes;
  return (
    <g>
      <defs>
        <linearGradient id="fs-board" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wood.board[0]} />
          <stop offset="1" stopColor={wood.board[1]} />
        </linearGradient>
        <linearGradient id="fs-drum" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ui.drum[0]} />
          <stop offset="0.5" stopColor={ui.drum[1]} />
          <stop offset="1" stopColor={ui.drum[0]} />
        </linearGradient>
        <linearGradient id="fs-drum-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        {/* Subtle horizontal grain: stretched turbulence, kept faint. */}
        <filter id="fs-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.35" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 -0.12" />
        </filter>
      </defs>

      <g data-part="body" transform={`translate(${lastWireX} 0)`}>
        <ShapeView shapes={model.body.shapes} skin={skin} />
      </g>

      <g data-part="headstock">
        {head && head.kind === 'path' && (
          <path
            d={head.d}
            fill={paint(skin, model.headstock.face)}
            stroke={paint(skin, head.stroke)}
            strokeWidth={head.width}
          />
        )}
        <ShapeView shapes={headDecor} skin={skin} />
      </g>

      <g data-part="board">
        <rect x={nutX} y={0} width={boardEndX - nutX} height={boardHeight} fill="url(#fs-board)" />
        <rect
          x={nutX}
          y={0}
          width={boardEndX - nutX}
          height={boardHeight}
          filter="url(#fs-grain)"
          opacity={wood.grain}
          style={{ mixBlendMode: 'multiply' }}
        />
        {model.binding && (
          <g fill="#f0e6c8">
            <rect x={nutX} y={0} width={boardEndX - nutX} height={BINDING} />
            <rect x={nutX} y={boardHeight - BINDING} width={boardEndX - nutX} height={BINDING} />
          </g>
        )}
      </g>
    </g>
  );
}
