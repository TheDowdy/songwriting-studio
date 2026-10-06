/**
 * What each control in the shell's song strip does, for hover tips and help mode (matched by name,
 * scoped to the strip, so the same words can mean something else elsewhere).
 */
import type { HelpEntry } from '@sw/ui';

const S = '.sw-strip';
const h = (name: string | RegExp, text: string): HelpEntry => ({ name, scope: S, text });
const sel = (selector: string, text: string): HelpEntry => ({ selector, scope: S, text });

export const TIMELINE_HELP: HelpEntry[] = [
  // The view controls and the Song order row.
  h('Compact', 'Draw the chords narrower, so more of the song fits on screen.'),
  h('Strum lane', 'Show or hide the strum pattern under each chord. Hidden, a chord’s own strokes show inside it.'),
  h('Hide the song strip', 'Fold the song strip away to give the rest of the screen more room.'),
  h(/^Show the song strip/, 'Show the song strip again.'),
  sel('.sw-order-chip', 'Scroll to this section. Playback highlights the section that is playing. Drag a chip to move it in the song’s order, where you can edit it.'),
  h(/^Remove .+ from arrangement/, 'Take this section out of the song’s order. The section itself stays.'),
  sel('[aria-label="Add to the song order"] button', 'Add this section to the song’s order. Select it again to repeat it later in the song.'),

  // Chords.
  h(/^Chord: /, 'Select this chord to hear it and edit it. Its width shows how many beats it lasts. Press and hold, then drag, to move it within or between sections.'),
  h(/^Length of .+ in beats/, 'Drag, or use the arrow keys, to change how many beats this chord lasts.'),
  sel('.block-stale', 'The guitar voicing saved for this chord no longer fits. Open the Guitar tab to re-fit it.'),

  // Sections.
  sel('[aria-label^="Section:"]', 'A section of the song. Select it to make it the one that new chords are added to.'),
  h('Section name', 'Type a new name for this section.'),
  h('Fewer repeats', 'Repeat this section one time fewer.'),
  h('More repeats', 'Repeat this section one time more.'),
  h(/^Section actions for /, 'Show or hide the actions for this section: duplicate, make a variant, clear and delete.'),
  h('Duplicate section', 'Copy this section. The copy is placed after it.'),
  h('Make variant', 'Create a copy of this section with the chords voiced in a different position on the neck.'),
  h('Clear', 'Remove every chord from this section.'),
  h(/^Delete .+/, 'Delete this section and its chords.'),
  h(/^\+ .+ section$|^\+ (Verse|Chorus|Bridge|Intro|Outro|Pre-chorus|Section)$/, 'Add a new section.'),
  sel('.timeline-block-source, .variant-source', 'Scroll to the section this variant was made from.'),

  // The strum pattern lane and its block.
  h(/^Pattern for /, 'The strum pattern lane. Select a block to change its pattern, how many chords it covers, or where else it plays.'),
  h(/^Chords in .+ block$/, 'Drag, or use the arrow keys, to make this pattern block cover more or fewer chords.'),
  h('Block pattern', 'Choose what this block plays: a built-in pattern, one of yours, or a new one.'),
  h('Edit pattern', 'Show or hide the editor for this block’s strum pattern.'),
  h('− Shorter block', 'Make the block cover one chord fewer.'),
  h('+ Longer block', 'Make the block cover one chord more.'),
  h('Just this chord', 'Keep this pattern on the selected chord only. The rest of the block goes back to the song default.'),
  h('Whole section', 'Use this pattern for every chord in the section.'),
  { name: 'Whole song', selector: '[aria-label="Use this pattern for"] button', scope: S, text: 'Make this the song’s default pattern and clear every other block.' },
  h('Remove pattern', 'Remove this block. Its chords go back to the song default.'),
  h('Song default', 'Choose the pattern for every chord that has no block of its own.'),
  h('Close pattern block', 'Close the block’s options.'),
];
