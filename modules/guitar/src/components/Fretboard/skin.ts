/**
 * Visual constants that don't depend on the guitar model: how note markers, rings and highlights
 * look. The guitar itself (headstock, board, inlays, strings, body) comes from `guitarSkins.ts`.
 */
export const skin = {
  markerFill: '#f2ead3',
  markerText: '#221710',
  /** Marker outline and label on a pale (maple) board, where the cream ones would vanish. */
  markerFillOnLight: '#3a2718',
  /** Tonic marker when notes aren't coloured by degree. */
  tonicFill: '#f2a93b',
  tonicStroke: '#ffffff',
  /** Overlay ring: light line over a dark halo so it reads on both wood and coloured markers. */
  ring: '#ffffff',
  ringHalo: 'rgba(0,0,0,0.7)',
  /** The ✕ shown behind the nut for a muted string. */
  mutedMark: '#e8e6e1',
  /** Outline of the marker being sounded by scale playback. */
  playhead: '#ffd23f',
  fretNumber: 'currentColor',
  /** Dark wood behind the legend's swatches, so they look as they do on the neck. */
  legendBacking: '#3b241a',
  /** Drum-roller tuning pegs. */
  drum: ['#1b1b1e', '#3a3a40'],
} as const;
