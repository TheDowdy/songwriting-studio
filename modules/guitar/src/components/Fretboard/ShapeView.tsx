import { paint, type ResolvedSkin, type Shape } from './guitarSkins';

/** Draws model shapes (paths, circles, rects) with the skin's colours. */
export function ShapeView({ shapes, skin }: { shapes: readonly Shape[]; skin: ResolvedSkin }) {
  return (
    <>
      {shapes.map((s, i) => {
        const common = {
          fill: paint(skin, s.fill, 'none'),
          stroke: paint(skin, s.stroke, 'none'),
          strokeWidth: s.width,
          opacity: s.opacity,
        };
        if (s.kind === 'path') return <path key={i} d={s.d} {...common} />;
        if (s.kind === 'circle') return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...common} />;
        return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...common} />;
      })}
    </>
  );
}
