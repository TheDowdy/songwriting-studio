import { useEffect, useRef } from 'react';
import { onPluck } from '../../state/pluckEvents';
import { nutX, stringY, totalWidth } from './geometry';
import type { ResolvedSkin } from './guitarSkins';

/** A plucked string swings at this (visible, not audible) rate and dies away exponentially. */
const WOBBLE_HZ = 13;
const WOBBLE_DECAY_SECONDS = 0.55;
const WOBBLE_MAX_AMPLITUDE = 5;
const WOBBLE_POINTS = 48;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The three layers a string is drawn with: shadow, string, and (wound strings) a dashed overlay. */
function StringLayers({ index, d, skin }: { index: number; d?: string; skin: ResolvedSkin }) {
  const strings = skin.model.strings;
  const y = stringY(index);
  const width = strings.widths[index];
  const wound = strings.isWound[index];
  // Pale nickel and nylon would disappear against a maple board, so they are drawn darker there.
  const plainColour = skin.lightBoard ? '#7b8188' : strings.plain;
  const woundColour = skin.lightBoard ? '#666c72' : strings.wound;
  const shape = (dy: number, stroke: string, dash?: string) =>
    d ? (
      <path d={d} transform={`translate(0 ${dy})`} stroke={stroke} strokeDasharray={dash} />
    ) : (
      <line
        x1={nutX}
        x2={totalWidth}
        y1={y + dy}
        y2={y + dy}
        stroke={stroke}
        strokeDasharray={dash}
      />
    );
  return (
    <g strokeWidth={width} fill="none">
      {shape(1.2, 'rgba(0,0,0,0.35)')}
      <g opacity={wound ? 1 : strings.plainOpacity}>
        {shape(0, wound ? woundColour : plainColour)}
      </g>
      {wound && strings.windPattern && shape(0, 'rgba(0,0,0,0.35)', '1.1 1.1')}
    </g>
  );
}

/**
 * One string. At rest it is a straight line; when plucked it is swapped for a path whose sine
 * wobble decays with the sound. The path is driven straight from requestAnimationFrame so a
 * strum doesn't cost six React renders per frame.
 */
function StringLine({ index, skin }: { index: number; skin: ResolvedSkin }) {
  const restRef = useRef<SVGGElement>(null);
  const wobbleRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    let startedAt = 0;
    let amplitude = 0;
    const y = stringY(index);

    const settle = () => {
      raf = 0;
      if (wobbleRef.current) wobbleRef.current.style.display = 'none';
      if (restRef.current) restRef.current.style.display = '';
    };

    const frame = () => {
      // performance.now() rather than rAF's timestamp, which can precede the pluck's clock.
      const t = Math.max(0, (performance.now() - startedAt) / 1000);
      const a = amplitude * Math.exp(-t / WOBBLE_DECAY_SECONDS);
      const wobble = wobbleRef.current;
      if (a < 0.05 || !wobble) {
        settle();
        return;
      }
      const swing = a * Math.sin(2 * Math.PI * WOBBLE_HZ * t);
      let d = '';
      for (let k = 0; k <= WOBBLE_POINTS; k++) {
        const u = k / WOBBLE_POINTS;
        const x = nutX + u * (totalWidth - nutX);
        d += `${k === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(y + swing * Math.sin(Math.PI * u)).toFixed(2)}`;
      }
      for (const path of wobble.querySelectorAll('path')) path.setAttribute('d', d);
      raf = requestAnimationFrame(frame);
    };

    const off = onPluck((e) => {
      if (e.string !== index || prefersReducedMotion()) return;
      startedAt = performance.now();
      amplitude = WOBBLE_MAX_AMPLITUDE * (0.35 + 0.65 * e.velocity);
      if (restRef.current) restRef.current.style.display = 'none';
      if (wobbleRef.current) wobbleRef.current.style.display = '';
      if (!raf) frame();
    });
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [index]);

  return (
    <g>
      <g ref={restRef}>
        <StringLayers index={index} skin={skin} />
      </g>
      <g ref={wobbleRef} data-wobble={index} style={{ display: 'none' }}>
        <StringLayers index={index} d={`M${nutX} ${stringY(index)}`} skin={skin} />
      </g>
    </g>
  );
}

/** Six strings from the nut to the end of the board; 4–6 get a wound look. */
export function Strings({ skin }: { skin: ResolvedSkin }) {
  return (
    <g>
      {skin.model.strings.widths.map((_, i) => (
        <StringLine key={i} index={i} skin={skin} />
      ))}
    </g>
  );
}
