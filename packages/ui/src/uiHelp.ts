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
  // The strum pattern builder.
  { name: 'Pattern to edit', text: 'Choose which of your strum patterns to edit.' },
  { name: 'New pattern from', text: 'Start a new strum pattern from a blank grid or from a common rhythm.' },
  { name: 'Duplicate pattern', text: 'Make a copy of this pattern to change without losing the original.' },
  { name: 'Delete pattern', text: 'Delete this pattern. Anything using it goes back to the song default.' },
  { name: 'Pattern name', text: 'Give the pattern a name.' },
  { name: 'Length in beats', text: 'How many beats the pattern lasts before it repeats. It repeats to fill a longer chord.' },
  { name: 'Steps in each beat', text: 'How finely each beat is divided: quarter notes, eighth notes or sixteenth notes.' },
  { name: /^Step \d+ of \d+/, text: 'Tap to change this step: rest, then down strum, then up strum, then rest again.' },
  { name: 'All strings', text: 'The selected step strums every string.' },
  { name: 'Low strings', text: 'The selected step strums only the lower strings, for a partial strum.' },
  { name: 'High strings', text: 'The selected step strums only the higher strings, for a partial strum.' },
  { name: 'Accent', text: 'Make the selected step louder.' },
  { name: '▶ Preview', text: 'Hear the pattern once through on the selected block’s chord.' },
  { name: 'Clear steps', text: 'Turn every step into a rest, so you can start the rhythm again.' },
  { name: 'Selected chord', text: 'Use this pattern for the selected chord only.' },
  { name: 'Rest of section', text: 'Use this pattern for the selected chord and every chord after it in its section.' },
  { name: 'Whole section', text: 'Use this pattern for every chord in the section.' },
  { name: 'Entire song', text: 'Use this pattern for every chord in the song, replacing any other choices.' },
  { name: 'Strum pattern', text: 'Choose the strum pattern for this chord, or the song default.' },
  { selector: '.variant-dialog-close', text: 'Close without making a variant.' },
  { selector: '[data-testid="variant-generators"] .chip', text: 'Choose how the variant voices each chord. The preview below shows the result.' },
  { selector: '.variant-dialog .field', text: 'Adjust this option for the chosen way of voicing the chords.' },
  { selector: '.variant-preview', text: 'A preview of the shapes the variant will use, chord by chord.' },
  { selector: '.variant-dialog .button.primary', text: 'Create the variant as a new section that follows the original.' },
  { selector: '.variant-dialog .button', text: 'Close without making a variant.' },
];
