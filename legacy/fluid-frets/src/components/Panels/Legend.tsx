import type { ReactNode } from 'react';
import { useDisplay } from '../../hooks/useDisplay';
import type { DisplayModel } from '../../hooks/useScaleView';
import { markerStyle, type MarkerStyle, type ScaleStyleOptions } from '../Fretboard/markerStyle';
import { skin } from '../Fretboard/skin';

/** Wood behind each swatch, so it looks as it does on the neck whatever the page theme. */
function SwatchBacking() {
  return <rect x="-15" y="-15" width="30" height="30" rx="7" fill={skin.legendBacking} />;
}

/** A small marker drawn exactly as it appears on the neck. */
function Swatch({ style, children }: { style: MarkerStyle; children?: ReactNode }) {
  return (
    <svg className="swatch" width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true">
      <SwatchBacking />
      <g opacity={style.opacity === 1 ? 1 : Math.max(style.opacity, 0.55)}>
        <circle
          r={12 * style.scale}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
        />
        {style.dashed && (
          <circle
            r={12 * style.scale * 0.68}
            fill="none"
            stroke={style.text}
            strokeWidth={1.3}
            strokeDasharray="2.4 2"
          />
        )}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="system-ui, sans-serif"
          fontSize="11"
          fontWeight="600"
          fill={style.text}
        >
          {children}
        </text>
      </g>
    </svg>
  );
}

function RingSwatch() {
  return (
    <svg className="swatch" width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true">
      <SwatchBacking />
      <circle r="9" fill={skin.markerFill} stroke="rgba(0,0,0,0.5)" />
      <circle r="12" fill="none" stroke={skin.ringHalo} strokeWidth="4.6" />
      <circle r="12" fill="none" stroke={skin.ring} strokeWidth="2.4" />
    </svg>
  );
}

function options(d: DisplayModel): ScaleStyleOptions {
  return {
    colourMode: d.colourMode,
    palette: d.palette,
    hideOutOfScale: false,
    chromatic: d.chromatic,
  };
}

/** Under the neck: what each marker style means. Shown in scale and chord modes. */
export function Legend() {
  const display = useDisplay();
  if (!display) return null;
  const opts = options(display);
  const { items, terms, overlayLabel } = display.legend;
  const plain = (role: 'tonic' | 'scale' | 'out', interval: number) =>
    markerStyle({ role, interval, variant: false, overlay: false }, opts);

  return (
    <div className="legend" aria-label="Legend">
      {display.colourMode ? (
        <ul className="legend-list">
          {items.map((item) => (
            <li key={item.label + item.note} data-degree={item.label}>
              <Swatch style={markerStyle(item.view, opts)}>{item.label}</Swatch>
              <span className="legend-note">{item.note}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="legend-list">
          {terms.tonic !== null && (
            <li>
              <Swatch style={plain('tonic', 0)} />
              <span>{terms.tonic}</span>
            </li>
          )}
          {terms.scale !== null && (
            <li>
              <Swatch style={plain('scale', 7)} />
              <span>{terms.scale}</span>
            </li>
          )}
          {terms.out !== null && (
            <li>
              <Swatch style={plain('out', 1)} />
              <span>{display.hideOutOfScale ? `${terms.out} (hidden)` : terms.out}</span>
            </li>
          )}
        </ul>
      )}
      {overlayLabel && (
        <p className="legend-overlay">
          <RingSwatch />
          <span>Ring: {overlayLabel}</span>
        </p>
      )}
    </div>
  );
}
