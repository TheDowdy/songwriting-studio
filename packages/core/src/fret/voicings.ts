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
  /** Per fret of stretch beyond three, on top of `stretch`: a four- or five-fret reach is a real
   *  stretch for most hands (the owner's Fmaj7 call ruled out 1-0-2-5-5-0). */
  wideStretch: number;
  finger: number;
  /** Per muted string below the lowest sounding one: cheap, you just don't strum it. */
  bassMute: number;
  /** Per muted string above the highest sounding one: the fretting hand has to damp it. */
  trebleMute: number;
  /** A fret whose notes need two or more separate fingers in an unplayable-feeling arrangement
   *  — see `awkwardSplits`. */
  splitFret: number;
  /** Per muted string with no fretted neighbour to damp it (an inner string between open ones, or
   *  the top string above an open one) — hard to keep silent. */
  looseMute: number;
  /** Per fret beyond two that a lower-fretted note on a higher string reaches back across a
   *  higher-fretted one (the hand fanning out; C's x-3-2-0-1-0 reaches two frets and is fine). */
  crossReach: number;
  /** A sus chord's 2nd/4th sounding right above the bass (the owner's call after Phase 4: Esus4
   *  0-2-2-2-0-0 over 0-0-2-2-0-0, Asus4 x-0-2-2-3-0 over x-0-0-2-3-0) — the fuller, clearer shape,
   *  root then 5th at the bottom, reads as the chord; the sus note that low muddies it. */
  lowSus: number;
  /** Per hand position the fingers physically block: a finger held flat across three or more
   *  strings with a higher-fretted note beyond it on a higher string, a finger held flat with the
   *  string just below it fretted higher, or an index barre that stops short of the top string
   *  with that string ringing open right above it. */
  blocked: number;
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
  wideStretch: 2,
  finger: 1,
  bassMute: 0.3,
  trebleMute: 1.5,
  splitFret: 4,
  looseMute: 3,
  crossReach: 1,
  blocked: 2,
  lowSus: 3,
  innerMute: 3,
  position: 0.5,
  open: -0.6,
  openHigh: 2,
  rootInBass: -1.5,
  thin: 1,
  barre: 0.5,
  allOpen: -4,
  inversion: 3,
  doubledThird: 1,
  fullChord: -0.8,
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
  tones: readonly { pc: number; required: boolean; third: boolean; sus?: boolean }[];
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
      sus: t.kind === 'sus',
    })),
    bassPc: info.spec.bassPc,
  };
}

/**
 * The search target for a plain set of pitch classes with a known root (e.g. a diatonic triad or
 * seventh chord built on a scale degree, PLAN.md chord-header addendum): every pitch class is
 * required, and one a third or a tenth above the root is flagged so the scorer can still penalise
 * a doubled third.
 */
export function targetFromPcs(rootPc: number, pcs: readonly number[]): VoicingTarget {
  return {
    rootPc,
    tones: pcs.map((pc) => {
      const semitones = pitchClass(pc - rootPc);
      return { pc, required: true, third: semitones === 3 || semitones === 4 };
    }),
    bassPc: null,
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
    let second = lowest + 1;
    while (second < strings && frets[second] === null) second++;
    const lowSus = second < strings && target.tones[toneAt[second] as number]?.sus === true;
    const bassMutes = lowest;
    const trebleMutes = strings - 1 - highest;
    const complete = (mask & allMask) === allMask;
    const score =
      weights.stretch * stretch +
      weights.wideStretch * Math.max(0, stretch - 3) +
      weights.finger * fingers +
      (barre !== null && barreSpan >= 3 ? weights.barre : 0) +
      (opens === strings && fingers === 0 ? weights.allOpen : 0) +
      weights.bassMute * bassMutes +
      weights.trebleMute * trebleMutes +
      weights.splitFret * awkwardSplits(frets, barre) +
      weights.looseMute * looseMutes(frets) +
      weights.crossReach * crossReach(frets) +
      weights.blocked * blockedPositions(frets, barre) +
      (lowSus ? weights.lowSus : 0) +
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

/**
 * How many frets of a shape ask the hand for something awkward (the owner's B♭ report: the scorer
 * picked x-1-0-3-3-1, whose fret-1 notes sit either side of an open D string with fret-3 notes in
 * between — no barre can cover them, and no finger can reach them apart). A fret counts when its
 * notes need two or more separate fingers (not one flattened finger or one barre) and, between the
 * outermost of them:
 *  - a note sits two or more frets away (the hand would have to fan across it), or
 *  - it's the shape's lowest fret, and there is both an open string and a higher-fretted note
 *    (the index can't barre over the open string, and a second finger at that fret would have to
 *    cross the others to reach it).
 * Ordinary open shapes (D, G, A7, C…) never count: their split frets have only neighbouring
 * frets or open strings in between.
 */
export function awkwardSplits(frets: readonly (number | null)[], barre: number | null): number {
  // Plain loops, no allocation: this runs for every candidate the search completes.
  const n = frets.length;
  let lowest = Infinity;
  for (let s = 0; s < n; s++) {
    const f = frets[s];
    if (f !== null && f !== undefined && f > 0 && f < lowest) lowest = f;
  }
  if (lowest === Infinity) return 0;
  let count = 0;
  for (let s = 0; s < n; s++) {
    const f = frets[s];
    if (f === null || f === undefined || f <= 0 || f === barre) continue;
    // Handle each fret once, from its first (lowest) string.
    let seen = false;
    for (let t = 0; t < s; t++) if (frets[t] === f) seen = true;
    if (seen) continue;
    const first = s;
    let last = s;
    let groups = 1;
    let prev = s;
    for (let t = s + 1; t < n; t++) {
      if (frets[t] !== f) continue;
      // Runs of adjacent strings at this fret share a (flattened) finger.
      if (t !== prev + 1) groups++;
      prev = t;
      last = t;
    }
    if (groups < 2) continue;
    let farNote = false;
    let open = false;
    let higher = false;
    for (let t = first + 1; t < last; t++) {
      const x = frets[t];
      if (x === f || x === null || x === undefined) continue;
      if (x === 0) open = true;
      else {
        if (Math.abs(x - f) >= 2) farNote = true;
        if (x > f) higher = true;
      }
    }
    if (farNote || (f === lowest && open && higher)) count++;
  }
  return count;
}

/** Muted strings nothing can damp: an inner one with no fretted neighbour, or the top string
 *  muted right above an open one. See `ScoreWeights.looseMute`. */
export function looseMutes(frets: readonly (number | null)[]): number {
  const n = frets.length;
  let low = -1;
  let high = -1;
  for (let s = 0; s < n; s++) {
    if (frets[s] === null) continue;
    if (low === -1) low = s;
    high = s;
  }
  if (low === -1) return 0;
  const fretted = (s: number) => {
    const f = frets[s];
    return f !== null && f !== undefined && f > 0;
  };
  let count = 0;
  for (let s = low + 1; s < high; s++) if (frets[s] === null && !fretted(s - 1) && !fretted(s + 1)) count++;
  if (high < n - 1 && frets[high] === 0) count++;
  return count;
}

/** How far the hand fans: see `ScoreWeights.crossReach`. */
export function crossReach(frets: readonly (number | null)[]): number {
  let total = 0;
  for (let sa = 0; sa < frets.length; sa++) {
    const a = frets[sa];
    if (a === null || a === undefined || a === 0) continue;
    for (let sb = 0; sb < sa; sb++) {
      const b = frets[sb];
      // `a` is on a higher string than `b`; reaching back matters only when it's lower-fretted.
      if (b !== null && b !== undefined && b !== 0 && b - a > 2) total += b - a - 2;
    }
  }
  return total;
}

/** See `ScoreWeights.blocked`. */
export function blockedPositions(frets: readonly (number | null)[], barre: number | null): number {
  let count = 0;
  const higherFretAbove = (from: number, fret: number) => {
    for (let t = from + 1; t < frets.length; t++) {
      const f = frets[t];
      if (f !== null && f !== undefined && f > fret) return true;
    }
    return false;
  };
  let s = 0;
  while (s < frets.length) {
    const f = frets[s];
    let end = s;
    while (f !== null && f !== undefined && f > 0 && frets[end + 1] === f) end++;
    if (f !== null && f !== undefined && f > 0 && f !== barre && end - s + 1 >= 3 && higherFretAbove(end, f)) count++;
    // A finger flattened across two or more strings with the string just below it fretted higher:
    // that finger has to tuck in behind the flat one (the barre Fmaj7 1-3-2-2-1-1, owner's call).
    const below = frets[s - 1];
    if (f !== null && f !== undefined && f > 0 && f !== barre && end > s && below !== null && below !== undefined && below > f) count++;
    s = end + 1;
  }
  if (barre !== null) {
    let top = -1;
    for (let i = 0; i < frets.length; i++) if (frets[i] === barre) top = i;
    if (top >= 0 && top < frets.length - 1 && frets[top + 1] === 0) count++;
  }
  return count;
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

// ------------------------------------------------------------------ re-fit (Songwriting Studio Phase 4 item 5)

/** Toggling a string between muted and fretted counts as further apart than any same-position
 *  slide, but not so far that it swamps a comparison between two shapes that differ only in which
 *  strings sound (each of those is already this far apart on every such string). */
const MUTE_TOGGLE_DISTANCE = 4;

/** How far two shapes are from each other: the sum of each string's fret distance (0 when both
 *  muted, `MUTE_TOGGLE_DISTANCE` when only one is). Shorter arrays are padded with mutes, so a
 *  shape for a different string count still compares (rare — tunings share the string count). */
export function shapeDistance(
  a: readonly (number | null)[],
  b: readonly (number | null)[],
): number {
  const length = Math.max(a.length, b.length);
  let distance = 0;
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? null;
    const y = b[i] ?? null;
    if (x === null && y === null) continue;
    distance += x === null || y === null ? MUTE_TOGGLE_DISTANCE : Math.abs(x - y);
  }
  return distance;
}

/**
 * The best replacement for a voicing that's gone stale (§3.2, Phase 4 item 5) — a chord edit that
 * changed which notes are needed, or a tuning/capo change: the valid voicing nearest the old shape
 * (minimising `shapeDistance`), ties broken by score. Null only when `voicings` is empty.
 */
export function nearestVoicing(
  oldFrets: readonly (number | null)[],
  voicings: readonly Voicing[],
): Voicing | null {
  let best: Voicing | null = null;
  let bestDistance = Infinity;
  for (const v of voicings) {
    const distance = shapeDistance(oldFrets, v.frets);
    if (distance < bestDistance || (distance === bestDistance && best !== null && v.score < best.score)) {
      best = v;
      bestDistance = distance;
    }
  }
  return best;
}

// ------------------------------------------------------------------ re-voicing (Songwriting Studio Phase 7)

/**
 * A shape's frets re-expressed relative to a different capo, so shapes committed under one capo
 * compare by where the hand actually is on the neck: fret `f` above capo `from` is fret
 * `f + from − to` above capo `to` (possibly below it, or negative — only distances matter).
 */
export function shiftCapo(frets: readonly (number | null)[], from: number, to: number): (number | null)[] {
  return frets.map((f) => (f === null ? null : f + from - to));
}

/** Strings that sound in one shape and not the other. */
export function stringSetDifference(a: readonly (number | null)[], b: readonly (number | null)[]): number {
  let d = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (((a[i] ?? null) === null) !== ((b[i] ?? null) === null)) d++;
  return d;
}

/** How much each part of `revoiceCost` weighs: position first, then the shape's own score, then
 *  keeping the same strings sounding (Phase 7 item 2's (a), (b), (c)). */
const REVOICE_SCORE_WEIGHT = 0.3;
const REVOICE_STRING_WEIGHT = 0.5;

/** How good `v` is as a replacement for an old shape (lower is better): see `revoiceCandidates`. */
export function revoiceCost(oldFrets: readonly (number | null)[], oldCapo: number, v: Voicing, newCapo: number): number {
  const old = shiftCapo(oldFrets, oldCapo, newCapo);
  return shapeDistance(old, v.frets) + REVOICE_SCORE_WEIGHT * v.score + REVOICE_STRING_WEIGHT * stringSetDifference(old, v.frets);
}

/**
 * The best replacements for a voicing that no longer fits (Phase 7 item 2), best first: near
 * where the hand was on the neck (the old shape moved to the new capo), then a good shape by the
 * usual score, then the same strings sounding. `voicings` is the chord's search in the new setup.
 */
export function revoiceCandidates(
  oldFrets: readonly (number | null)[],
  oldCapo: number,
  voicings: readonly Voicing[],
  newCapo: number,
  count = 3,
): { voicing: Voicing; cost: number }[] {
  return voicings
    .map((voicing) => ({ voicing, cost: revoiceCost(oldFrets, oldCapo, voicing, newCapo) }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, count);
}

/**
 * The smoothest choice through a sequence (Phase 7 "Re-voice all"): one option per position,
 * minimising the options' own costs plus `transition` between neighbours (Viterbi). Returns the
 * chosen index at each position; an empty position is skipped over (its neighbours still connect).
 */
export function smoothestChoice<T>(
  options: readonly (readonly { item: T; cost: number }[])[],
  transition: (a: T, b: T) => number,
): number[] {
  const picks: number[] = options.map(() => -1);
  const positions = options.map((_, i) => i).filter((i) => (options[i] as unknown[]).length > 0);
  if (positions.length === 0) return picks;
  // best[k][j]: cheapest path ending at option j of the k-th non-empty position.
  const best: number[][] = [];
  const from: number[][] = [];
  positions.forEach((pos, k) => {
    const here = options[pos] as { item: T; cost: number }[];
    if (k === 0) {
      best.push(here.map((o) => o.cost));
      from.push(here.map(() => -1));
      return;
    }
    const prev = options[positions[k - 1] as number] as { item: T; cost: number }[];
    const row: number[] = [];
    const back: number[] = [];
    here.forEach((o) => {
      let min = Infinity;
      let arg = 0;
      prev.forEach((p, pj) => {
        const c = (best[k - 1] as number[])[pj] as number + transition(p.item, o.item);
        if (c < min) {
          min = c;
          arg = pj;
        }
      });
      row.push(min + o.cost);
      back.push(arg);
    });
    best.push(row);
    from.push(back);
  });
  const last = best[best.length - 1] as number[];
  let j = last.indexOf(Math.min(...last));
  for (let k = positions.length - 1; k >= 0; k--) {
    picks[positions[k] as number] = j;
    j = (from[k] as number[])[j] as number;
  }
  return picks;
}
