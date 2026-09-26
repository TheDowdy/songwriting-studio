import { Note } from 'tonal';
import { buildChord, chordKey, chordName, diatonicChord, diatonicChords, secondaryNumeral, withInversion } from './chords';
import { numeralFor } from './numerals';
import { HV, RULES } from './rules';
import { chroma, fmt, scaleNotes } from './scales';
import type { ChordRef, Key, Suggestion } from './types';

const MAX_SUGGESTIONS = 10;
const MIN_SUGGESTIONS = 6;
const SUSTAIN_SCORE = 0.12;
const LOOP_BOOST = 0.2;

/** The chord for a rule node: a diatonic degree 0–6, or HV (major V borrowed from harmonic minor). */
function nodeChord(key: Key, node: number, inversion = 0): ChordRef {
  if (node === HV) {
    const root = scaleNotes(key)[4];
    return buildChord({ root, quality: 'maj', seventh: 'dom7', origin: 'borrowed' }, key);
  }
  const chord = diatonicChord(key, node);
  return inversion ? withInversion(chord, inversion, key) : chord;
}

/**
 * Which rule node a chord plays, judged by its root and quality (flavor and inversion never
 * change function). A chord that merely shares a root with a diatonic degree but has a different
 * quality — a borrowed or secondary chord — is not that degree, so this returns null for it.
 */
function identify(chord: ChordRef, key: Key): number | null {
  const degree = scaleNotes(key).findIndex((n) => chroma(n) === chroma(chord.root));
  if (degree < 0) return null;
  if (key.mode === 'minor' && degree === 4 && chord.quality === 'maj') return HV;
  return diatonicChord(key, degree).quality === chord.quality ? degree : null;
}

/** The chord's numeral as a plain triad in root position, for reading in reasons. */
function plainNumeral(chord: ChordRef, key: Key): string {
  return numeralFor({ ...chord, flavor: 'triad' }, key, 0);
}

const fill = (template: string, from: string, to: string) =>
  template.replace('{from}', from).replace('{to}', to);

/** Score for diatonic chords the rules don't mention: a low, root-motion-based guess. */
function fallbackScore(from: ChordRef, to: ChordRef): number {
  const up = (chroma(to.root) - chroma(from.root) + 12) % 12;
  if (up === 5) return 0.28; // root rises a fourth (falls a fifth)
  if (up === 7) return 0.25;
  if (up === 1 || up === 2 || up === 10 || up === 11) return 0.22;
  if (up === 3 || up === 4 || up === 8 || up === 9) return 0.2;
  return 0.15;
}

const shapeKey = (c: ChordRef) => `${chroma(c.root)}|${c.quality}`;

// --- Layer D: borrowed chords (modal mixture) ------------------------------------------------

/** The chord on `degree` of the parallel `mode` (same tonic), relabelled and marked borrowed. */
function parallelBorrow(key: Key, mode: Key['mode'], degree: number): ChordRef {
  const chord = diatonicChord({ tonic: key.tonic, mode }, degree);
  return { ...chord, origin: 'borrowed' };
}

/** Borrowed chords offered for the key, by numeral: [score, reason]. Only major and minor borrow this way. */
function borrowedChords(key: Key): { chord: ChordRef; score: number; reason: string }[] {
  if (key.mode === 'major') {
    const table: [degree: number, score: number, reason: string][] = [
      [1, 0.3, 'borrowed from minor: a dark, tense passing chord'],
      [2, 0.35, 'borrowed from minor: a moody, unexpected lift'],
      [3, 0.45, 'borrowed from minor: a bittersweet twist before I'],
      [5, 0.4, 'borrowed from minor: dramatic, cinematic colour'],
      [6, 0.5, 'rock/Mixolydian sound, often goes to IV or I'],
    ];
    return table.map(([degree, score, reason]) => {
      const chord = parallelBorrow(key, 'minor', degree);
      return { chord, score, reason: chord.numeral === '♭VII' ? `${chord.numeral}: ${reason}` : `${chord.numeral} (${reason})` };
    });
  }
  if (key.mode === 'minor') {
    const chord = parallelBorrow(key, 'dorian', 3);
    return [{ chord, score: 0.5, reason: `${chord.numeral} (borrowed from Dorian): a brighter twist on iv` }];
  }
  return [];
}

// --- Layer E: secondary dominants -------------------------------------------------------------

/** V/X for scale degree `degree` (1–6): a major triad a fifth above X, labelled relative to X. */
function secondaryDominant(key: Key, degree: number): ChordRef | null {
  const target = diatonicChord(key, degree);
  if (target.quality !== 'maj' && target.quality !== 'min') return null;
  const root = Note.transpose(target.root, '5P');
  return buildChord({ root, quality: 'maj', seventh: 'dom7', origin: 'secondary' }, key);
}

/** If `chord` is a secondary dominant of some diatonic degree, that degree's chord. */
function secondaryTarget(chord: ChordRef, key: Key): ChordRef | null {
  if (!secondaryNumeral(chord, key)) return null;
  const candidateRoot = Note.transpose(chord.root, '-5P');
  for (let degree = 1; degree < 7; degree++) {
    const target = diatonicChord(key, degree);
    if ((target.quality === 'maj' || target.quality === 'min') && chroma(target.root) === chroma(candidateRoot)) return target;
  }
  return null;
}

/** If the last chords are one short pattern played twice (e.g. I–V–vi–IV ×2), return its chords. */
function detectLoop(current: ChordRef, previous: ChordRef[]): Set<string> | null {
  const seq = [...previous, current].map(shapeKey);
  for (const n of [2, 3, 4]) {
    if (seq.length < 2 * n) continue;
    const a = seq.slice(-n);
    const b = seq.slice(-2 * n, -n);
    if (a.every((x, i) => x === b[i])) return new Set(a);
  }
  return null;
}

/**
 * Suggest where to go next from `current` in `key`. `previous` is the chords played before
 * `current` (oldest first); it is only used to notice a loop that is worth breaking.
 * Deterministic: same input, same output. Sorted by score, highest first.
 */
export function suggestNext(current: ChordRef, key: Key, previous: ChordRef[] = []): Suggestion[] {
  const node = identify(current, key);
  const from = plainNumeral(current, key);
  const found = new Map<string, Suggestion>();

  const add = (chord: ChordRef, score: number, reason: string) => {
    const id = chordKey(chord);
    const clamped = Math.max(0, Math.min(1, score));
    const existing = found.get(id);
    if (existing && existing.score >= clamped) return;
    found.set(id, { chord, score: clamped, reason, origin: chord.origin });
  };

  if (node !== null) {
    for (const [ruleFrom, to, score, reason, inversion] of RULES[key.mode]) {
      if (ruleFrom !== node) continue;
      const chord = nodeChord(key, to, inversion);
      add(chord, score, fill(reason, from, chord.numeral));
    }
  }

  // A suspended chord wants to settle onto its plain triad.
  if (current.flavor === 'sus2' || current.flavor === 'sus4') {
    const settled: ChordRef = { ...current, flavor: 'triad', bass: undefined };
    settled.numeral = numeralFor(settled, key, 0);
    add(settled, 0.85, `${chordName(current)} → ${chordName(settled)}: the held note settles`);
  }

  // Layer E (reverse): a secondary dominant resolves strongly to the chord it targets.
  if (node === null) {
    const target = secondaryTarget(current, key);
    if (target) add(target, 1, `${current.numeral} → ${target.numeral}: the borrowed dominant resolves home`);
  }

  // Layer D: borrowed chords (modal mixture), offered as general colour options.
  for (const { chord, score, reason } of borrowedChords(key)) {
    if (chordKey(chord) !== chordKey(current)) add(chord, score, reason);
  }

  // Layer E (forward): secondary dominants, when `current` already leads well to their target
  // (this covers "after I" too, since I is itself a strong predecessor of most chords).
  // Scored below the direct move it detours from, so V/X never outranks going straight to X.
  if (node !== null) {
    for (const [ruleFrom, to, ruleScore] of RULES[key.mode]) {
      if (ruleFrom !== node || to === 0 || to >= 7 || ruleScore < 0.5) continue;
      const sec = secondaryDominant(key, to);
      if (!sec || chordKey(sec) === chordKey(current)) continue;
      const target = diatonicChord(key, to);
      add(sec, Math.max(0.3, ruleScore * 0.6), `${sec.numeral}: borrows a dominant, pulling toward ${fmt(target.root)}`);
    }
  }

  // Fill out the list with the remaining in-key chords at low scores.
  for (const chord of diatonicChords(key)) {
    if (found.size >= MIN_SUGGESTIONS) break;
    if (found.has(chordKey(chord)) || chordKey(chord) === chordKey(current)) continue;
    add(chord, fallbackScore(current, chord), fill('{from} → {to}: less common, but stays in key', from, chord.numeral));
  }

  // Repeating the current chord is allowed, but only as a low "sustain" option.
  add(current, SUSTAIN_SCORE, `Repeat ${chordName(current)}: let it ring longer`);

  // Stuck in a loop? Favour chords the loop hasn't used.
  const loop = detectLoop(current, previous);
  if (loop) {
    for (const s of found.values()) {
      if (s.score >= 0.3 && !loop.has(shapeKey(s.chord)) && s.chord !== current) {
        s.score = Math.min(1, s.score + LOOP_BOOST);
        s.reason = `Break the loop: ${s.chord.numeral} adds something fresh`;
      }
    }
  }

  return [...found.values()]
    .map((s, order) => ({ s, order }))
    .sort((a, b) => b.s.score - a.s.score || a.order - b.order)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ s }) => s);
}

/** The chords shown in the ring before anything is picked; the first is the tonic ("start here"). */
export function startChords(key: Key): ChordRef[] {
  return diatonicChords(key);
}

/** A short note about the key itself, where the mode needs a warning. */
export function keyNote(key: Key): string | null {
  return key.mode === 'locrian'
    ? 'Locrian is advanced: its home chord is diminished, so nothing ever feels fully settled.'
    : null;
}
