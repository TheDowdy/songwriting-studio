import { NO_OVERLAY, type Overlay } from './overlays';
import type { PaletteId } from './scaleColors';
import { SCALES } from './scales';

export interface ScaleSettings {
  /** Tonic pitch class 0–11 (the spelling follows the scale, see `bestRootSpelling`). */
  rootPc: number;
  scaleId: string;
  hideOutOfScale: boolean;
  /** Colour notes by scale degree instead of one fill for all in-scale notes. */
  colourMode: boolean;
  overlay: Overlay;
}

export type PlaybackDirection = 'up' | 'down' | 'updown';
export type PlaybackRange = 'octave' | 'two-octaves' | 'neck';

export interface PlaybackSettings {
  /** Beats per minute; the scale is played in eighth notes. */
  tempo: number;
  direction: PlaybackDirection;
  range: PlaybackRange;
  /** First fret of the five-fret hand window, or 'auto'. */
  position: 'auto' | number;
}

export const MIN_TEMPO = 40;
export const MAX_TEMPO = 240;

export const DEFAULT_SCALE_SETTINGS: ScaleSettings = {
  rootPc: 0,
  scaleId: 'major',
  hideOutOfScale: false,
  colourMode: false,
  overlay: NO_OVERLAY,
};

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  tempo: 100,
  direction: 'up',
  range: 'octave',
  position: 'auto',
};

export const DEFAULT_PALETTE: PaletteId = 'rainbow';

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const oneOf = <T extends string>(x: unknown, values: readonly T[], fallback: T): T =>
  values.includes(x as T) ? (x as T) : fallback;

export function sanitizeOverlay(x: unknown): Overlay {
  if (!isRecord(x)) return NO_OVERLAY;
  if (x['kind'] === 'chord') return { kind: 'chord' };
  if (x['kind'] === 'scale' && SCALES.some((s) => s.id === x['scaleId'])) {
    return { kind: 'scale', scaleId: x['scaleId'] as string };
  }
  const degree = Number(x['degree']);
  if ((x['kind'] === 'triad' || x['kind'] === 'seventh') && Number.isInteger(degree)) {
    return degree >= 0 && degree < 7 ? { kind: x['kind'], degree } : NO_OVERLAY;
  }
  return NO_OVERLAY;
}

/** Storage is untrusted: fall back to defaults field by field. */
export function sanitizeScaleSettings(x: unknown): ScaleSettings {
  const d = DEFAULT_SCALE_SETTINGS;
  if (!isRecord(x)) return d;
  const rootPc = Number(x['rootPc']);
  return {
    rootPc: Number.isInteger(rootPc) && rootPc >= 0 && rootPc < 12 ? rootPc : d.rootPc,
    scaleId: SCALES.some((s) => s.id === x['scaleId']) ? (x['scaleId'] as string) : d.scaleId,
    hideOutOfScale:
      typeof x['hideOutOfScale'] === 'boolean' ? x['hideOutOfScale'] : d.hideOutOfScale,
    colourMode: typeof x['colourMode'] === 'boolean' ? x['colourMode'] : d.colourMode,
    overlay: sanitizeOverlay(x['overlay']),
  };
}

export function sanitizePlayback(x: unknown): PlaybackSettings {
  const d = DEFAULT_PLAYBACK;
  if (!isRecord(x)) return d;
  const tempo = Number(x['tempo']);
  const position = Number(x['position']);
  return {
    tempo: Number.isFinite(tempo)
      ? Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempo)))
      : d.tempo,
    direction: oneOf(x['direction'], ['up', 'down', 'updown'], d.direction),
    range: oneOf(x['range'], ['octave', 'two-octaves', 'neck'], d.range),
    position:
      x['position'] !== 'auto' && Number.isInteger(position) && position >= 0 ? position : 'auto',
  };
}

export function sanitizePalette(x: unknown): PaletteId {
  return oneOf(x, ['rainbow', 'colourblind'], DEFAULT_PALETTE);
}
