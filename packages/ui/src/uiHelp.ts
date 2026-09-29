import type { HelpEntry } from './help';

/** Help for the shared components (`ChordBuilderChips`, `VariantDialog`) — they show up inside
 *  both modules, so the wording lives here once. */
export const UI_HELP: HelpEntry[] = [
  // The chord builder's chips, by group. An unavailable chip says why in its own tooltip.
  { selector: '.chip', name: /^(Major|Minor|Diminished|Augmented|Sus2|Sus4|Power \(5\))$/, text: 'Set the basic type of the chord.' },
  { selector: '.chip', name: /^(None|6|7 \(♭7\)|Major 7)$/, text: 'Add a sixth or a seventh to the chord, or none.' },
  { selector: '.chip', name: /^(6\/9|9|11|13)$/, text: 'Extend the chord with a higher note, such as a 9th, 11th or 13th.' },
  { selector: '.chip', name: /^[♭♯]\d+$/, text: 'Raise or lower one note of the chord by a semitone.' },
  { selector: '.chip', name: /^add\d+$/, text: 'Add a note to the chord without the notes in between.' },
  { selector: '.chip', name: /^no[35]$/, text: 'Leave one note out of the chord.' },
  { selector: '.variant-dialog-close', text: 'Close without making a variant.' },
  { selector: '[data-testid="variant-generators"] .chip', text: 'Choose how the variant voices each chord. The preview below shows the result.' },
  { selector: '.variant-dialog .field', text: 'Adjust this option for the chosen way of voicing the chords.' },
  { selector: '.variant-preview', text: 'A preview of the shapes the variant will use, chord by chord.' },
  { selector: '.variant-dialog .button.primary', text: 'Create the variant as a new section that follows the original.' },
  { selector: '.variant-dialog .button', text: 'Close without making a variant.' },
];
