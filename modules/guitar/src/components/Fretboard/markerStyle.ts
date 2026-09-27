import { chromaticColour, degreeColour, textOn, type PaletteId } from '@sw/core/fret/scaleColors';
import type { PitchView } from '@sw/core/fret/scaleView';
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
  /** Multiplier on the ring's radius/width — bigger for an emphasised root (§7 Phase 3 item 3). */
  ringScale: number;
  /** Draw the dashed inner ring that marks an altered degree sharing another note's hue. */
  dashed: boolean;
  /** Drawn as a rounded square rather than a circle: roots, so they read by shape alone. */
  square: boolean;
}

export interface ScaleStyleOptions {
  colourMode: boolean;
  palette: PaletteId;
  hideOutOfScale: boolean;
  /** The chromatic scale is coloured by a 12-hue wheel rather than by degree number. */
  chromatic: boolean;
  /** Root markers grow further and their outline/ring is heavier: the guitar module's
   *  "Progression chord" mode (§7 Phase 3 item 3), so a chord's root reads at a glance. */
  strongRoot?: boolean;
}

/** Room for the overlay ring beside neighbouring strings' markers. */
const RING_SHRINK = 0.84;
const TONIC_GROW = 1.08;
const STRONG_TONIC_GROW = 1.18;
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
  ringScale: 1,
  dashed: false,
  square: false,
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
  /** A note in the shown fingering: never hidden, even if it's outside the scale/chord. */
  inShape = false,
): MarkerStyle {
  const style = baseMarkerStyle(view, o, inShape);
  if (!lightBoard || !style.visible) return style;
  // On a pale board the cream outlines and white rings would vanish: outline everything darkly.
  const dark = skin.markerFillOnLight;
  return style.fill === 'transparent'
    ? { ...style, stroke: dark, text: dark }
    : { ...style, stroke: dark, strokeWidth: Math.max(style.strokeWidth, 1.5) };
}

function baseMarkerStyle(view: PitchView | undefined, o: ScaleStyleOptions | null, inShape: boolean): MarkerStyle {
  if (!view || !o) return PLAIN_MARKER;
  const ring = view.overlay;
  const shrink = ring ? RING_SHRINK : 1;

  if (view.role === 'out') {
    if (!ring && !inShape && o.hideOutOfScale) return { ...PLAIN_MARKER, visible: false };
    // A chord note outside the scale (a chord laid over the scale, or a note in the fingering) is
    // drawn solid at full strength, so it's as easy to spot as the chord's in-scale notes.
    if (inShape) return { ...PLAIN_MARKER, strokeWidth: 1.4 };
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
      ringScale: 1,
      dashed: false,
      square: false,
    };
  }

  const tonic = view.role === 'tonic';
  const strongRoot = tonic && !!o.strongRoot;
  const fill = o.colourMode ? noteColour(view, o) : tonic ? skin.tonicFill : skin.markerFill;
  // Roots are squares with the ordinary dark outline: the shape marks them, not a heavy white box.
  return {
    visible: true,
    fill,
    stroke: PLAIN_MARKER.stroke,
    strokeWidth: tonic ? 1.4 : 1,
    text: textOn(fill),
    opacity: 1,
    scale: shrink * (strongRoot ? STRONG_TONIC_GROW : tonic ? TONIC_GROW : 1),
    ring,
    ringScale: strongRoot && ring ? 1.6 : 1,
    dashed: o.colourMode && view.variant,
    square: tonic,
  };
}
