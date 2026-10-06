/**
 * What each control in the guitar module does, for hover tips and help mode. Entries are matched by
 * a control's name (its label or visible text) and scoped to this module's root, so a name shared
 * with the progression module (both have "Duplicate") can mean something different in each.
 */
import type { HelpEntry } from '@sw/ui';

const S = '.mod-guitar';
const g = (name: string | RegExp, text: string): HelpEntry => ({ name, scope: S, text });
const sel = (selector: string, text: string): HelpEntry => ({ selector, scope: S, text });

export const GUITAR_HELP: HelpEntry[] = [
  // The song strip: the progression across the top, with playback and editing.
  g('▶ Play song', 'Play every chord in the song, in order, at the song’s tempo.'),
  g('▶ Play section', 'Play the section that contains the selected chord.'),
  g('■ Stop', 'Stop playback.'),
  g('Loop', 'Repeat playback until you stop it.'),
  g(/^↶ Undo/, 'Undo your last change in this module.'),
  g(/^⚠ Re-voice/, 'Open the re-voicing panel to fix voicings that no longer fit the tuning or capo.'),
  g(/^Chord: /, 'Select this chord to show it on the neck and hear it. Its width shows how many beats it lasts. Press and hold, then drag, to reorder it within its section.'),
  g('Section name', 'Type a new name for this section, then press Enter.'),
  sel('.strip-section-name', 'Select to rename this section.'),
  g(/^Duplicate .+/, 'Copy this section and place the copy after it.'),
  g(/^Make a variant of /, 'Create a copy of this section with the chords voiced in a different position on the neck.'),
  sel('.strip-variant-link', 'Scroll to the section this variant was made from.'),
  g('+ Add chord', 'Choose the first chord for this empty section.'),
  g('+ Section', 'Add a new, empty section to the end of the song.'),

  // Editing the selected chord.
  g('Flavour', 'Change the type of the selected chord, such as major 7th, add 9 or sus4.'),
  g('Inversion', 'Choose which note of the selected chord is in the bass.'),
  g('Replace', 'Swap the selected chord for a different one. Suggestions are ranked for the key.'),
  g('Beats', 'How many beats the selected chord lasts. Use − and + to change it.'),
  g('One beat shorter', 'Make the selected chord one beat shorter.'),
  g('One beat longer', 'Make the selected chord one beat longer.'),
  g('Duplicate', 'Copy the selected chord and place the copy after it.'),
  g('Remove', 'Delete the selected chord from the song.'),
  g('+ Add after', 'Choose a chord to insert after the selected one.'),
  sel('.choice-chip', 'Use this chord. The colour shows whether it belongs to the key, is borrowed from another key, or is a secondary chord.'),
  g('Build any chord…', 'Choose any root and chord type, even if it isn’t in the key.'),
  g(/^Use .+/, 'Use the chord you built.'),
  g('Cancel', 'Close this without changing anything.'),

  // Tuning, capo and the options disclosure above the neck.
  g('Guitar tuning and options', 'Show or hide the less-used neck settings: saving tunings, frets, spacing, accidentals, guitar look, sound and left-handed.'),
  g('Tuning', 'Choose how the strings are tuned. Changing it in a song asks first, because voicings you saved for the old tuning need re-voicing.'),
  g('Save tuning', 'Save the current tuning, including any peg changes, to your list of tunings.'),
  g('Frets', 'Choose how many frets the neck shows.'),
  g('Capo', 'Choose the fret where the capo sits. Chord shapes are then shown relative to the capo.'),
  g('Spacing', 'Choose how the frets are spaced: Even, Realistic (closer together up the neck), or Auto.'),
  g('Accidentals', 'Choose whether notes are named with sharps or flats.'),
  g('Left-handed', 'Flip the neck for left-handed players.'),
  g('Settings', 'Open the guitar settings: saved tunings, colour options and reset.'),
  g('Sound', 'Choose the instrument sound used for playback.'),
  g('Volume', 'Set the volume of this module’s sound.'),
  g(/^(Mute|Unmute)$/, 'Silence or restore this module’s sound.'),
  g('Guitar', 'Choose the look of the guitar neck.'),
  g('Customise', 'Change the wood, inlay markers or finish of the guitar neck.'),
  g('Match sound to guitar', 'Play back with a sound that suits the guitar you chose.'),
  g(/^(Rosewood|Maple|Ebony|Paper)$/, 'Change the wood of the neck, or choose paper for an engraved look.'),
  g(/^(Dots|Blocks|Side dots only)$/, 'Change the style of the inlay markers on the neck.'),
  g(/^Reset to /, 'Go back to the chosen guitar’s original wood, inlays and finish.'),

  // The neck.
  sel('[data-string][data-fret]', 'Select a note to hear it. In Identify mode, select notes to build a chord shape.'),
  g(/^String \d+ tuning/, 'Drag up or down to retune this string. The note name updates as you drag.'),
  sel('.fretboard', 'The guitar neck. Select a note to hear it.'),

  // Mode tabs and panel.
  g('Scales', 'Show a scale on the neck and play it back.'),
  g('Chords', 'Pick a chord, browse its voicings and play them.'),
  g('Identify', 'Select notes on the neck to find out which chord they make.'),
  g(/^(▲ Show panel|▼ Hide panel)$/, 'Show or hide the panel below the neck to give the neck more room.'),

  // Chords panel.
  g('Root', 'Choose the root note of the chord.'),
  g('Bass note (slash chord)', 'Choose a bass note that differs from the root, as in C/E.'),
  g('Show intervals (R, 3, 5, ♭7)', 'Label each note on the neck with its interval from the root.'),
  g('Colour by function', 'Colour each note by its role in the chord.'),
  g('Hide other notes', 'Show only the notes in the current voicing.'),
  g(/^Voicing \d+:/, 'Select this voicing to show it on the neck and hear it.'),
  g('◀ Prev', 'Go to the previous voicing.'),
  g('Next ▶', 'Go to the next voicing.'),
  g('Best voicing', 'Go back to the voicing the app recommends for this chord.'),
  g('Add to progression', 'Add this chord to your song, after the chord in focus, with this shape as its voicing. Then switch to Progression to see what could come next.'),
  g('Use this voicing', 'Save this voicing on the chord in your song, so it plays this exact shape.'),
  g('Remove voicing', 'Forget the saved voicing. The chord goes back to the recommended shape.'),
  g('Re-fit', 'Find the nearest shape that fits the current chord, tuning and capo.'),
  g('▶ Play', 'Strum the current shape.'),
  g('Arpeggiate', 'Play the notes of the current shape one at a time.'),
  g(/^Tempo/, 'Set how fast the scale plays, in beats per minute.'),
  g(/^Strum speed/, 'Set how quickly the strings are strummed. A lower number is faster.'),
  g('Root in bass only', 'Only show voicings that have the root note as their lowest note.'),
  g('No muted inner strings', 'Hide voicings that mute a string between two sounding strings.'),
  g('Include open strings', 'Allow voicings that use open strings.'),
  g('Max stretch (frets)', 'Hide voicings that need a wider stretch than this.'),
  g('Max fingers', 'Hide voicings that need more fingers than this.'),
  g('Min strings sounding', 'Hide voicings that sound fewer strings than this.'),
  sel('summary', 'Show or hide the rules that filter which voicings are offered.'),
  sel('[data-testid="voicing-list"]', 'Every voicing of this chord, from the nut up the neck. Scroll sideways to see more.'),
  sel('.bass-control .chip', 'Choose which chord note is lowest: the root, an inversion, or any.'),

  // Scales panel.
  g('Key', 'Choose the root note of the scale.'),
  g('Scale', 'Choose the scale to show on the neck.'),
  g('Overlay rings', 'Mark a second set of notes, such as a chord, with rings.'),
  g('Colour by degree', 'Colour each note by its position in the scale.'),
  g('Hide out-of-scale notes', 'Show only the notes in the scale.'),
  g('Direction', 'Choose whether the scale plays ascending, descending, or up and down.'),
  g('Range', 'Choose how far the scale playback reaches: one octave, two octaves or the whole neck.'),
  g('Position', 'Limit the scale to one position on the neck.'),

  // Identify panel.
  g('▶ Find chord', 'Play the notes you selected together.'),
  g('Send to Chord mode', 'Open the identified chord in Chords mode, with this shape as its voicing.'),
  g('Clear', 'Deselect every note.'),

  // Guitar settings dialog.
  g(/^Rename /, 'Type a new name for this saved tuning.'),
  g('Use', 'Switch the neck to this saved tuning.'),
  g(/^Delete /, 'Delete this saved tuning.'),
  g('Export JSON', 'Download your saved tunings as a file.'),
  g('Import JSON…', 'Add tunings from a file you exported earlier.'),
  g('Import tunings file', 'Choose a tunings file to import.'),
  g('Reset all settings…', 'Forget every guitar setting and saved tuning on this device. You’ll be asked to confirm.'),
  g('Yes, reset everything', 'Confirm the reset. This can’t be undone.'),
  g('Done', 'Close this and keep your changes.'),
  g(/^Large neck for touch/, 'Make the neck wider so it’s easier to tap. It scrolls sideways.'),
  g(/^Unlimited tuning range/, 'Let each string be tuned as far as you like, instead of 7 semitones down and 5 up.'),
  g(/^Strum the open strings/, 'Play the open strings whenever you choose a tuning, so you can hear it.'),
  g(/^Colour-blind-friendly/, 'Use scale colours that are easier to tell apart.'),
  g('Name', 'Type a name for this tuning.'),

  // Confirmation and re-voicing panel.
  g('Change tuning', 'Change the tuning. Voicings saved for the old tuning stay, marked to re-voice.'),
  g('Change capo', 'Change the capo. Voicings saved for the old capo stay, marked to re-voice.'),
  g('Re-voice all', 'Pick the smoothest set of new voicings for all flagged chords at once.'),
  g('Close', 'Close the re-voicing panel.'),
  g(/^Use [\dx-]+ for /, 'Save this shape as the chord’s voicing.'),
  sel('.banner', 'Sound is off until you tap. Select this to turn it on.'),
];
