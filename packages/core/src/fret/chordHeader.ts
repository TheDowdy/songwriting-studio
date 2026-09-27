/**
 * The chord-focus header shown above the neck: whatever chord is currently in focus in the
 * Chords, Scales or Identify tab, described as a name, an optional secondary label, and its
 * notes with interval labels — plus a voicing-search target for the small diagram. One shared
 * shape (`ChordHeaderChord`) for every source, so the component that renders it doesn't need to
 * know which tab or overlay produced it. Pure: no store, no React.
 */
import { describeChord, intervalLabel, toneShortLabel, type ChordInfo } from './chords';
import type { Identified, SoundingNote } from './identify';
import { pitchClass, type NoteName, type Spelling } from './notes';
import type { DiatonicChord } from './overlays';
import { targetFromChord, targetFromPcs, type VoicingTarget } from './voicings';

export interface ChordHeaderTone {
  note: NoteName;
  /** e.g. "R", "3", "♭7". */
  interval: string;
  pc: number;
}

export interface ChordHeaderChord {
  /** e.g. "B♭", "G7". */
  name: string;
  /** A degree/numeral, "from the progression: V7", or null when none is known. */
  label: string | null;
  tones: ChordHeaderTone[];
  /** What to search voicings for, on whatever tuning/capo/rules apply. */
  target: VoicingTarget;
}

/**
 * From a fully described chord: the Chords tab's own chord (tool mode or the progression chord),
 * an Identify reading's chord, or the Scales tab's "Chord from the Chords tab" overlay — every
 * consumer of `describeChord` shares this.
 */
export function chordHeaderFromInfo(info: ChordInfo, label: string | null = null): ChordHeaderChord {
  return {
    name: info.name,
    label,
    tones: info.tones.map((t) => ({ note: t.name, interval: toneShortLabel(t), pc: t.pc })),
    target: targetFromChord(info),
  };
}

/**
 * From a diatonic triad/seventh built on a scale degree (the Scales tab's overlay): spelled with
 * the scale's own spelling, since these are exactly the scale's notes stacked in thirds, and
 * labelled with the numeral ("V", "vii°") as the overlay picker shows it.
 */
export function chordHeaderFromDiatonic(chord: DiatonicChord, spelling: Spelling): ChordHeaderChord {
  const rootPc = chord.pcs[0] as number;
  return {
    name: chord.name,
    label: chord.numeral,
    tones: chord.pcs.map((pc) => ({
      note: spelling[pc] as NoteName,
      interval: intervalLabel(pc - rootPc),
      pc,
    })),
    target: targetFromPcs(rootPc, chord.pcs),
  };
}

/**
 * From an Identify reading: only when the picked notes name a chord (`best.spec` present — a
 * power chord counts), null otherwise (nothing picked, or no chord fits). The notes are the
 * actual sounding notes (one per picked string, lowest first), matching what the Identify panel
 * already lists below the neck.
 */
export function chordHeaderFromIdentified(
  best: Identified | undefined,
  notes: readonly SoundingNote[],
): ChordHeaderChord | null {
  if (!best?.spec) return null;
  return {
    name: best.name,
    label: null,
    tones: notes.map((n) => ({ note: n.name, interval: n.interval, pc: pitchClass(n.midi) })),
    target: targetFromChord(describeChord(best.spec)),
  };
}
