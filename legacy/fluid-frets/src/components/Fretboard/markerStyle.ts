import { chromaticColour, degreeColour, textOn, type PaletteId } from '../../theory/scaleColors';
import type { PitchView } from '../../theory/scaleView';
import { skin } from './skin';

export interface MarkerStyle {
  /** False for out-of-scale notes when they are hidden. */
  visible: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
  /** Opacity of the marker body (the overlay ring is always drawn at full strength). */
  opacity: number;
  /** Multiplier on the marker radius. */
  scale: number;
  /** Draw the overlay ring. */
  ring: boolean;
  /** Draw the dashed inner ring that marks an altered degree sharing another note's hue. */
  dashed: boolean;
}

export interface ScaleStyleOptions {
  colourMode: boolean;
  palette: PaletteId;
  hideOutOfScale: boolean;
  /** The chromatic scale is coloured by a 12-hue wheel rather than by degree number. */
  chromatic: boolean;
}

/** Room for the overlay ring beside neighbouring strings' markers. */
const RING_SHRINK = 0.84;
const TONIC_GROW = 1.08;
const OUT_OPACITY = 0.3;
const OUT_OVERLAY_OPACITY = 0.75;

export const PLAIN_MARKER: MarkerStyle = {
  visible: true,
  fill: skin.markerFill,
  stroke: 'rgba(0,0,0,0.5)',
  strokeWidth: 1,
  text: skin.markerText,
  opacity: 1,
  scale: 1,
  ring: false,
  dashed: false,
};

/** Fill colour of an in-scale note in colour mode. */
export function noteColour(view: PitchView, o: Pick<ScaleStyleOptions, 'palette' | 'chromatic'>) {
  if (o.chromatic || !view.degree) return chromaticColour(view.interval, o.palette);
  return degreeColour(view.degree, o.palette);
}

/**
 * How a marker is drawn. With no `view` (explore mode) every note looks the same; in scale mode
 * the tonic, in-scale and out-of-scale notes differ, and colour mode fills by degree (§10).
 */
export function markerStyle(
  view: PitchView | undefined,
  o: ScaleStyleOptions | null,
  lightBoard = false,
): MarkerStyle {
  const style = baseMarkerStyle(view, o);
  if (!lightBoard || !style.visible) return style;
  // On a pale board the cream outlines and white rings would vanish: outline everything darkly.
  const dark = skin.markerFillOnLight;
  return style.fill === 'transparent'
    ? { ...style, stroke: dark, text: dark }
    : { ...style, stroke: dark, strokeWidth: Math.max(style.strokeWidth, 1.5) };
}

function baseMarkerStyle(view: PitchView | undefined, o: ScaleStyleOptions | null): MarkerStyle {
  if (!view || !o) return PLAIN_MARKER;
  const ring = view.overlay;
  const shrink = ring ? RING_SHRINK : 1;

  if (view.role === 'out') {
    if (!ring && o.hideOutOfScale) return { ...PLAIN_MARKER, visible: false };
    return {
      visible: true,
      // Transparent, not "none", so the empty middle of the outline can still be tapped.
      fill: 'transparent',
      stroke: skin.markerFill,
      strokeWidth: 1.4,
      text: skin.markerFill,
      opacity: ring ? OUT_OVERLAY_OPACITY : OUT_OPACITY,
      scale: shrink,
      ring,
      dashed: false,
    };
  }

  const tonic = view.role === 'tonic';
  const fill = o.colourMode ? noteColour(view, o) : tonic ? skin.tonicFill : skin.markerFill;
  return {
    visible: true,
    fill,
    stroke: tonic ? skin.tonicStroke : PLAIN_MARKER.stroke,
    strokeWidth: tonic ? 2.2 : 1,
    text: textOn(fill),
    opacity: 1,
    scale: shrink * (tonic ? TONIC_GROW : 1),
    ring,
    dashed: o.colourMode && view.variant,
  };
}
