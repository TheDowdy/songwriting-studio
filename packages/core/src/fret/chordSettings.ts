import { DEFAULT_VOICING_RULES, type VoicingRules } from './voicings';

/** How the chord's tones are drawn on the neck. */
export interface ChordDisplaySettings {
  /** Show interval labels (R, 3, 5, ♭7) instead of note names. */
  showIntervals: boolean;
  /** Colour each tone by its function; off = root highlighted, other tones plain. */
  colourByFunction: boolean;
  /** Hide every note that isn't a chord tone. */
  hideOthers: boolean;
}

export interface ChordPlaySettings {
  /** A downstroke sounds the strings low → high, an upstroke high → low. */
  direction: 'down' | 'up';
  /** Time between strings in a strum. */
  speedMs: number;
}

export const DEFAULT_CHORD_DISPLAY: ChordDisplaySettings = {
  showIntervals: false,
  colourByFunction: true,
  hideOthers: false,
};

export const MIN_STRUM_MS = 8;
export const MAX_STRUM_MS = 150;
export const DEFAULT_CHORD_PLAY: ChordPlaySettings = { direction: 'down', speedMs: 35 };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);
const int = (x: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(x);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
};

export function sanitizeChordDisplay(x: unknown): ChordDisplaySettings {
  const d = DEFAULT_CHORD_DISPLAY;
  if (!isRecord(x)) return d;
  return {
    showIntervals: bool(x['showIntervals'], d.showIntervals),
    colourByFunction: bool(x['colourByFunction'], d.colourByFunction),
    hideOthers: bool(x['hideOthers'], d.hideOthers),
  };
}

export function sanitizeChordPlay(x: unknown): ChordPlaySettings {
  const d = DEFAULT_CHORD_PLAY;
  if (!isRecord(x)) return d;
  const speed = Number(x['speedMs']);
  return {
    direction: x['direction'] === 'up' ? 'up' : 'down',
    speedMs: Number.isFinite(speed)
      ? Math.min(MAX_STRUM_MS, Math.max(MIN_STRUM_MS, Math.round(speed)))
      : d.speedMs,
  };
}

export function sanitizeVoicingRules(x: unknown): VoicingRules {
  const d = DEFAULT_VOICING_RULES;
  if (!isRecord(x)) return d;
  return {
    maxStretch: int(x['maxStretch'], 2, 7, d.maxStretch),
    maxFingers: int(x['maxFingers'], 1, 4, d.maxFingers),
    minStrings: x['minStrings'] === 'auto' ? 'auto' : int(x['minStrings'], 2, 6, 0) || 'auto',
    includeOpen: bool(x['includeOpen'], d.includeOpen),
    rootInBass: bool(x['rootInBass'], d.rootInBass),
    noInnerMutes: bool(x['noInnerMutes'], d.noInnerMutes),
  };
}
