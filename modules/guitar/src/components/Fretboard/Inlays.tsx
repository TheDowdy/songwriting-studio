import { boardHeight, inlayFrets, markerRadius } from './geometry';
import type { ResolvedSkin } from './guitarSkins';

interface Props {
  fretCount: number;
  centres: readonly number[];
  spaces: readonly number[];
  skin: ResolvedSkin;
}

/** Position inlays at 3 5 7 9 15 17 19 21 (double at 12 and 24) as dots, blocks, or side dots only. */
export function Inlays({ fretCount, centres, spaces, skin }: Props) {
  const colour = skin.wood.inlay;
  return (
    <g fill={colour} data-inlays={skin.inlay}>
      {inlayFrets(fretCount).flatMap(({ fret, double }) => {
        const x = centres[fret] as number;
        const space = spaces[fret] as number;
        if (skin.inlay === 'none') {
          // Small dots on the upper edge of the board, the only marks a plain board has.
          const xs = double ? [x - 5, x + 5] : [x];
          return xs.map((cx) => <circle key={`${fret}-${cx}`} cx={cx} cy={5} r={2.2} />);
        }
        if (skin.inlay === 'blocks') {
          const w = Math.min(20, space * 0.5);
          const ys = double ? [boardHeight * 0.3, boardHeight * 0.7] : [boardHeight / 2];
          const h = double ? 34 : 56;
          return ys.map((y) => (
            <rect key={`${fret}-${y}`} x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2} />
          ));
        }
        const r = Math.min(7, markerRadius(space) * 0.5);
        const ys = double ? [boardHeight * 0.3, boardHeight * 0.7] : [boardHeight / 2];
        return ys.map((y) => <circle key={`${fret}-${y}`} cx={x} cy={y} r={r} />);
      })}
    </g>
  );
}
