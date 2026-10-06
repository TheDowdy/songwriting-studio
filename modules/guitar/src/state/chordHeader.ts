/**
 * Which chord (if any) the chord-focus header above the neck shows, per tab (owner request: list
 * the notes of whatever chord is selected, above the fretboard). The Chords tab always has a
 * chord in focus (the free builder, or the progression chord in song context); the Scales tab
 * only when its overlay names a chord; the Identify tab only once the picked notes name one.
 * Pure — no store, no React — so it's unit-tested without a DOM.
 */
import type { ChordRef } from '@sw/core';
import { chordHeaderFromDiatonic, chordHeaderFromInfo, type ChordHeaderChord } from '@sw/core/fret/chordHeader';
import { describeChord, type ChordSpec } from '@sw/core/fret/chords';
import { diatonicChords, type Overlay } from '@sw/core/fret/overlays';
import type { AccidentalPref, NoteName, Spelling } from '@sw/core/fret/notes';
import type { ScaleDef } from '@sw/core/fret/scales';

/**
 * The Chords tab's header chord: the free builder's chord in tool mode, or the same chord (§7
 * Phase 3's "Progression chord" mode already sets `chordSpec` to `toChordSpec(progressionChord)`)
 * with the progression's numeral as a secondary label in song context.
 */
export function chordTabHeaderChord(
  chordSpec: ChordSpec,
  pref: AccidentalPref,
  progressionChord: ChordRef | null,
): ChordHeaderChord {
  const label = progressionChord ? `from the progression: ${progressionChord.numeral}` : null;
  return chordHeaderFromInfo(describeChord(chordSpec, pref), label);
}

/**
 * The Scales tab's header chord: only when the overlay names one — a diatonic triad/seventh on a
 * scale degree, or "Chord from the Voicings tab" — null for no overlay or a scale-on-scale overlay
 * (§10's other overlay kind, which isn't a chord).
 */
export function scaleTabHeaderChord(
  overlay: Overlay,
  root: NoteName,
  def: ScaleDef,
  spelling: Spelling,
  pref: AccidentalPref,
  chordSpec: ChordSpec,
): ChordHeaderChord | null {
  if (overlay.kind === 'chord') return chordHeaderFromInfo(describeChord(chordSpec, pref));
  if (overlay.kind !== 'triad' && overlay.kind !== 'seventh') return null;
  const chord = diatonicChords(root, def, overlay.kind, pref)?.[overlay.degree];
  return chord ? chordHeaderFromDiatonic(chord, spelling) : null;
}
