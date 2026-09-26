/**
 * Voicing search (PLAN.md §11.1): every playable way to finger a chord in a tuning, scored so
 * the most natural shape comes first. Pure; results are memoised per tuning + chord + rules.
 */
import type { ChordInfo } from './chords';
import { pitchClass } from './notes';

export interface VoicingRules {
  /** Widest span between the lowest and highest fretted note (open strings don't count). */
  maxStretch: number;
  /** Most fretting fingers; a barre counts as one. */
  maxFingers: number;
  /** Fewest sounding strings, or 'auto' (3, or 4 for seventh chords and larger). */
  minStrings: number | 'auto';
  includeOpen: boolean;
  /** Only shapes whose lowest note is the chord's root (or slash bass). */
  rootInBass: boolean;
  /** No muted string between two sounding ones. */
  noInnerMutes: boolean;
}

export const DEFAULT_VOICING_RULES: VoicingRules = {
  maxStretch: 4,
  maxFingers: 4,
  minStrings: 'auto',
  includeOpen: true,
  rootInBass: false,
  noInnerMutes: false,
};

/** Weights for `score`: lower total = better voicing. */
export interface ScoreWeights {
  stretch: number;
  finger: number;
  edgeMute: number;
  innerMute: number;
  /** Per fret of the lowest fretted note: lower on the neck is slightly preferred. */
  position: number;
  /** Per open string (negative = bonus) while the fretting hand is low on the neck. */
  open: number;
  /** Per open string when the hand is high on the neck (an open string then means a jump). */
  openHigh: number;
  rootInBass: number;
  /** Per string a shape sounds fewer than four: thin voicings are the fallback, not the default. */
  thin: number;
  /** A wide barre (three or more strings' width) is harder than the same fingers left open. */
  barre: number;
  /** Every string sounding open, no fingers: in an open tuning that strum is the chord. */
  allOpen: number;
  /** An inversion (any note but the root in the bass) is a little less settled than root position. */
  inversion: number;
  doubledThird: number;
  fullChord: number;
  /** Per sounding string (negative = bonus): fuller shapes win ties. */
  sounding: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  stretch: 1,
  finger: 1,
  edgeMute: 0.7,
  innerMute: 3,
  position: 0.3,
  open: -0.6,
  openHigh: 2,
  rootInBass: -1.5,
  thin: 1,
  barre: 1.5,
  allOpen: -2,
  inversion: 1.5,
  doubledThird: 1,
  fullChord: -1.5,
  sounding: -0.9,
};

/** Above this fret the hand is too far up the neck for open strings to be convenient. */
const HIGH_POSITION = 3;

export interface Voicing {
  /** Per string, 0 = lowest: fret number, or null when muted. */
  frets: (number | null)[];
  score: number;
  /** Lowest fretted fret (0 when only open strings sound): the shape's place on the neck. */
  position: number;
  /** Highest − lowest fretted fret. */
  stretch: number;
  fingers: number;
  /** Fret of the barre, if one finger covers several strings. */
  barre: number | null;
  sounding: number;
  /** Pitch class of the lowest sounding note. */
  bassPc: number;
  rootInBass: boolean;
  /** Every chord tone (including optional ones) is present. */
  complete: boolean;
}

/** What to search for: the chord tones by pitch class. */
export interface VoicingTarget {
  rootPc: number;
  tones: readonly { pc: number; required: boolean; third: boolean }[];
  /** Slash bass: the lowest sounding note must be this. */
  bassPc: number | null;
}

/** The search target for a described chord. */
export function targetFromChord(info: ChordInfo): VoicingTarget {
  return {
    rootPc: info.spec.rootPc,
    tones: info.tones.map((t) => ({
      pc: t.pc,
      required: t.required,
      third: t.kind === 'third',
    })),
    bassPc: info.spec.bassPc,
  };
}

const popcount = (n: number) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
};

interface Option {
  fret: number;
  tone: number;
}

/**
 * Fingers needed for a set of frets (null = muted), and the barre fret if the lowest fret is held
 * across several strings by one finger. Beyond the barre, adjacent strings at the same fret can be
 * flattened under one finger.
 */
export function fingering(frets: readonly (number | null)[]): {
  fingers: number;
  barre: number | null;
  /** Strings from one end of the barre to the other, 0 without one. */
  barreSpan: number;
} {
  const fretted: number[] = [];
  frets.forEach((f, s) => {
    if (f !== null && f > 0) fretted.push(s);
  });
  if (fretted.length === 0) return { fingers: 0, barre: null, barreSpan: 0 };
  const low = Math.min(...fretted.map((s) => frets[s] as number));
  const onLow = fretted.filter((s) => frets[s] === low);
  let barre: number | null = null;
  let barreSpan = 0;
  const covered = new Set<number>();
  if (onLow.length >= 2) {
    const first = onLow[0] as number;
    const last = onLow[onLow.length - 1] as number;
    // A barre can't cover an open or muted string lying between its ends.
    let clear = true;
    for (let s = first + 1; s < last; s++) {
      const f = frets[s];
      if (f === null || f === undefined || f === 0) clear = false;
    }
    // Two strings side by side are just a flat finger; a barre is three or more, or a wide reach.
    if (clear && (onLow.length >= 3 || last - first >= 3)) {
      barre = low;
      barreSpan = last - first;
      onLow.forEach((s) => covered.add(s));
    }
  }
  let fingers = barre === null ? 0 : 1;
  for (let i = 0; i < fretted.length; i++) {
    const s = fretted[i] as number;
    if (covered.has(s)) continue;
    // A run of adjacent strings at one fret shares a finger.
    const fret = frets[s];
    let end = s;
    while (frets[end + 1] === fret) end++;
    for (let t = s; t <= end; t++) covered.add(t);
    fingers++;
  }
  return { fingers, barre, barreSpan };
}

/**
 * All voicings of `target` on `tuning` (open-string MIDI notes, lowest string first) that satisfy
 * `rules`, sorted by position on the neck (then best score). Depth-first over the strings with
 * pruning on stretch and on required tones that can no longer be reached.
 */
export function searchVoicings(
  tuning: readonly number[],
  fretCount: number,
  target: VoicingTarget,
  rules: VoicingRules = DEFAULT_VOICING_RULES,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): Voicing[] {
  const strings = tuning.length;
  const toneOfPc = new Array<number>(12).fill(-1);
  target.tones.forEach((t, i) => {
    const existing = toneOfPc[t.pc] as number;
    if (existing === -1 || (t.required && !target.tones[existing]?.required)) toneOfPc[t.pc] = i;
  });
  let requiredMask = 0;
  let allMask = 0;
  target.tones.forEach((t, i) => {
    if (toneOfPc[t.pc] !== i) return;
    allMask |= 1 << i;
    if (t.required) requiredMask |= 1 << i;
  });
  const minStrings =
    rules.minStrings === 'auto' ? (popcount(allMask) >= 4 ? 4 : 3) : rules.minStrings;
  const thirdMask = target.tones.reduce(
    (m, t, i) => (t.third && toneOfPc[t.pc] === i ? m | (1 << i) : m),
    0,
  );

  // Per string: the frets whose note is a chord tone.
  const options: Option[][] = tuning.map((open) => {
    const list: Option[] = [];
    for (let fret = rules.includeOpen ? 0 : 1; fret <= fretCount; fret++) {
      const tone = toneOfPc[pitchClass(open + fret)] as number;
      if (tone >= 0) list.push({ fret, tone });
    }
    return list;
  });

  const frets: (number | null)[] = new Array<number | null>(strings).fill(null);
  const toneAt: number[] = new Array<number>(strings).fill(-1);
  const results: Voicing[] = [];

  const finish = (mask: number, sounding: number, minF: number, maxF: number): void => {
    if (sounding < minStrings) return;
    if ((mask & requiredMask) !== requiredMask) return;

    let lowest = 0;
    while (frets[lowest] === null) lowest++;
    let highest = strings - 1;
    while (frets[highest] === null) highest--;
    const bassPc = pitchClass((tuning[lowest] as number) + (frets[lowest] as number));
    const wantBass = target.bassPc ?? target.rootPc;
    if (target.bassPc !== null && bassPc !== target.bassPc) return;
    const rootInBass = bassPc === wantBass;
    if (rules.rootInBass && !rootInBass) return;

    let inner = 0;
    for (let s = lowest + 1; s < highest; s++) if (frets[s] === null) inner++;
    if (rules.noInnerMutes && inner > 0) return;

    const { fingers, barre, barreSpan } = fingering(frets);
    if (fingers > rules.maxFingers) return;

    let opens = 0;
    let thirds = 0;
    for (let s = lowest; s <= highest; s++) {
      if (frets[s] === 0) opens++;
      if (frets[s] !== null && (thirdMask & (1 << (toneAt[s] as number))) !== 0) thirds++;
    }
    const stretch = minF === Infinity ? 0 : maxF - minF;
    const edge = lowest + (strings - 1 - highest);
    const complete = (mask & allMask) === allMask;
    const score =
      weights.stretch * stretch +
      weights.finger * fingers +
      (barre !== null && barreSpan >= 3 ? weights.barre : 0) +
      (opens === strings && fingers === 0 ? weights.allOpen : 0) +
      weights.edgeMute * edge +
      weights.innerMute * inner +
      weights.position * (minF === Infinity ? 0 : minF) +
      (minF !== Infinity && minF > HIGH_POSITION ? weights.openHigh : weights.open) * opens +
      (rootInBass ? 0 : weights.inversion) +
      (rootInBass ? weights.rootInBass : 0) +
      weights.doubledThird * Math.max(0, thirds - 1) +
      (complete ? weights.fullChord : 0) +
      weights.thin * Math.max(0, 4 - sounding) +
      weights.sounding * sounding;

    results.push({
      frets: frets.slice(),
      score,
      position: minF === Infinity ? 0 : minF,
      stretch,
      fingers,
      barre,
      sounding,
      bassPc,
      rootInBass,
      complete,
    });
  };

  const dfs = (s: number, minF: number, maxF: number, mask: number, sounding: number): void => {
    if (s === strings) {
      finish(mask, sounding, minF, maxF);
      return;
    }
    // Tones still missing must each come from one of the strings left (this one included).
    const remaining = strings - s;
    // Muted.
    frets[s] = null;
    toneAt[s] = -1;
    if (popcount(requiredMask & ~mask) <= remaining - 1) dfs(s + 1, minF, maxF, mask, sounding);
    for (const { fret, tone } of options[s] as Option[]) {
      let nMin = minF;
      let nMax = maxF;
      if (fret > 0) {
        nMin = Math.min(minF, fret);
        nMax = Math.max(maxF, fret);
        if (nMax - nMin > rules.maxStretch) continue;
      }
      const nMask = mask | (1 << tone);
      if (popcount(requiredMask & ~nMask) > remaining - 1) continue;
      frets[s] = fret;
      toneAt[s] = tone;
      dfs(s + 1, nMin, nMax, nMask, sounding + 1);
    }
    frets[s] = null;
    toneAt[s] = -1;
  };
  dfs(0, Infinity, -1, 0, 0);

  return results.sort((a, b) => a.position - b.position || a.score - b.score);
}

/**
 * Ordinary chords have well over a thousand playable voicings (many are the same shape an
 * octave apart) and a 13th with optional tones has thousands more. The list shown keeps the
 * best-scoring 2,000, still ordered by position.
 */
export const MAX_LISTED_VOICINGS = 2000;

const cache = new Map<string, Voicing[]>();
const CACHE_LIMIT = 32;

/** `searchVoicings` limited to the best `MAX_LISTED_VOICINGS`, memoised per tuning + chord + rules. */
export function findVoicings(
  tuning: readonly number[],
  fretCount: number,
  target: VoicingTarget,
  rules: VoicingRules = DEFAULT_VOICING_RULES,
): Voicing[] {
  const key = JSON.stringify([tuning, fretCount, target, rules]);
  const hit = cache.get(key);
  if (hit) return hit;
  const all = searchVoicings(tuning, fretCount, target, rules);
  const result =
    all.length <= MAX_LISTED_VOICINGS
      ? all
      : [...all]
          .sort((a, b) => a.score - b.score)
          .slice(0, MAX_LISTED_VOICINGS)
          .sort((a, b) => a.position - b.position || a.score - b.score);
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return result;
}

/** Index of the lowest-scoring voicing (the best shape), or -1 when there are none. */
export function bestVoicingIndex(voicings: readonly Voicing[]): number {
  let best = -1;
  voicings.forEach((v, i) => {
    if (best === -1 || v.score < (voicings[best] as Voicing).score) best = i;
  });
  return best;
}

/** Index of the voicing with exactly these frets, or -1. */
export function indexOfShape(
  voicings: readonly Voicing[],
  frets: readonly (number | null)[],
): number {
  return voicings.findIndex((v) => v.frets.every((f, s) => f === frets[s]));
}

/**
 * The best voicing that has `fret` on `string`, for clicking a root note on the neck. Prefers
 * voicings where that string is the lowest sounding one (so the clicked root is the bass).
 */
export function bestVoicingWith(
  voicings: readonly Voicing[],
  string: number,
  fret: number,
): number {
  let best = -1;
  let bestKey = Infinity;
  voicings.forEach((v, i) => {
    if (v.frets[string] !== fret) return;
    const lowest = v.frets.findIndex((f) => f !== null);
    const key = v.score + (lowest === string ? 0 : 100);
    if (key < bestKey) {
      best = i;
      bestKey = key;
    }
  });
  return best;
}

/** "x-3-2-0-1-0" style text for a set of frets. */
export function shapeText(frets: readonly (number | null)[]): string {
  return frets.map((f) => (f === null ? 'x' : String(f))).join('-');
}

/** The sounding MIDI notes of a shape on a tuning, lowest string first. */
export function shapeNotes(
  tuning: readonly number[],
  frets: readonly (number | null)[],
): { string: number; fret: number; midi: number }[] {
  const notes: { string: number; fret: number; midi: number }[] = [];
  frets.forEach((fret, string) => {
    if (fret !== null) notes.push({ string, fret, midi: (tuning[string] as number) + fret });
  });
  return notes;
}
