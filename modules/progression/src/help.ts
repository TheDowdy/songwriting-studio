/**
 * What each control in the progression module does, for hover tips and help mode. Entries are
 * matched by a control's name (its label or visible text) and scoped to this module's root, so a
 * name shared with the guitar module (both have "Duplicate") can mean something different in each.
 */
import type { HelpEntry } from '@sw/ui';

const S = '.mod-progression';
const p = (name: string | RegExp, text: string): HelpEntry => ({ name, scope: S, text });
const sel = (selector: string, text: string): HelpEntry => ({ selector, scope: S, text });

export const PROGRESSION_HELP: HelpEntry[] = [
  // Song panel.
  p('Song title', 'Type a name for the song.'),
  p('Save, load and export', 'Show or hide the options to start a new song, save a copy, export, import and print.'),
  p('Sheet music', 'Open a printable chord sheet for this song.'),
  p('New song', 'Start a new, empty song. Your current song is saved first.'),
  p('Save a copy', 'Save a copy of this song under a new name.'),
  p('Export JSON', 'Download the song as a file you can back up or import later.'),
  p('Import JSON', 'Add a song from a file you exported earlier.'),
  p('Export MIDI', 'Download the song as a MIDI file for use in other music software.'),
  p('Open', 'Open this song.'),
  p('Rename', 'Change this song’s name.'),
  p('Duplicate', 'Make a copy of this song.'),
  p('Delete', 'Delete this song. You’ll be asked to confirm.'),
  p('Back to editor', 'Close the chord sheet and go back to the song.'),
  p('Print / Save as PDF', 'Print the chord sheet, or save it as a PDF from the print dialog.'),
  p(/numerals/i, 'Show Roman numerals above the chords on the sheet.'),

  // Key.
  sel('[aria-label="Key"] [aria-pressed]', 'Choose the key of the song. Chords suggested in the map are chosen to fit it.'),
  sel('[aria-label="Spelling"] button', 'Choose whether notes in this key are spelled with sharps or flats.'),
  sel('[aria-label="Key applies to"] button[aria-pressed]', 'Choose whether the key you pick applies to the whole song, or only to the section you’re editing, so a section can change key.'),
  p('Back to the song’s key', 'Return this section to the song’s key.'),
  p('Scale / mode', 'Choose the scale of the key, such as major, minor or a mode.'),
  p('Transpose them', 'Move every chord to the new key.'),
  p('Keep chords, relabel numerals', 'Keep the same chords, and change only their Roman numerals to match the new key.'),
  p('Cancel', 'Close this without changing anything.'),

  // Chord map.
  p(/^Current chord /, 'The chord you’re building from. Select it to hear it; the chords around it are good places to go next.'),
  p(/^Key: /, 'Show or hide the key controls: the root note, the scale or mode, and whether the key applies to the whole song or one section.'),
  p(/^Key /, 'The key of the song. Select it to hear the tonic chord.'),
  p(/^Add another .+ to the progression/, 'Add another copy of this chord to the end of the progression.'),
  p(/^Add .+ to progression$/, 'Add this chord to the end of the progression.'),
  sel('.map-node', 'A suggested next chord, with its Roman numeral. Select it to hear it, then select + to add it.'),
  p('Suggestions', 'Show the chord map: chords that fit well after the one you’re on.'),
  p('Circle of fifths', 'Show every chord on the circle of fifths. The ones in your key are shaded, but you can pick any of them.'),
  sel('[aria-label="Circle of fifths"] .map-node', 'A chord on the circle. Select it to hear it, then select + to add it. Shading shows how it relates to the key.'),
  p('Use as key', 'Make this chord’s key the key of this section, so you can shift key partway through the song.'),
  p('Make minor', 'Switch this chord from major to minor, keeping the key.'),
  p('Make major', 'Switch this chord from minor to major, keeping the key.'),
  p('Change flavor or inversion', 'Change the chord type (such as 7th or sus4) or which note is in the bass.'),
  p('Expand: piano keyboard or guitar diagram', 'Show this chord on a piano keyboard or as a guitar diagram.'),
  p('+ Add', 'Add the chord to the end of the progression.'),
  p('Replace', 'Replace the selected chord in the timeline with this one.'),
  p('Cancel replace', 'Stop replacing and keep the original chord.'),
  sel('[aria-label="Legend"]', 'What the colours mean: chords in the key, borrowed from another key, or secondary chords.'),

  // Flavour picker and chord detail.
  p('Close flavor picker', 'Close this panel.'),
  sel('[aria-label="Flavour"] button', 'Change the type of the chord, such as major, 7th or sus4.'),
  sel('[aria-label="Inversion"] button', 'Choose which note of the chord is in the bass.'),
  p('More…', 'Show more chord types, such as 6, 9, 11, 13, added notes and altered notes.'),
  p('Close chord detail', 'Close this panel.'),
  sel('[aria-label="View"] button', 'Switch between the piano keyboard, the guitar diagram and the notes of the chord.'),
  p('Explore guitar voicings →', 'Open this chord in the Guitar tab to browse shapes for it.'),

  // Timeline.
  p('One beat shorter', 'Make the selected chord one beat shorter.'),
  p('One beat longer', 'Make the selected chord one beat longer.'),
  p('Beats for selected chord', 'How many beats the selected chord lasts.'),
  p('Flavour', 'Change the type of the selected chord, such as 7th or sus4.'),
  p('Piano / guitar', 'Show the selected chord on a piano keyboard or as a guitar diagram.'),
  p('Explore guitar voicings', 'Open the selected chord in the Guitar tab to browse shapes and save one.'),
  p('Remove', 'Delete the selected chord.'),

];

/** The chords workspace's own playback settings, which the shell shows in its transport row. */
const T = '[aria-label="Playback"]';
const t = (name: string | RegExp, text: string): HelpEntry => ({ name, scope: T, text });
export const PROGRESSION_TRANSPORT_HELP: HelpEntry[] = [
  t('More playback settings', 'Show the time signature, instrument, metronome and volume.'),
  t('Beats per bar', 'Set how many beats are in each bar.'),
  t('Beat unit', 'Set which note length counts as one beat.'),
  t('Time signature', 'Set the number of beats in a bar and the note length of a beat.'),
  t('Instrument', 'Choose the instrument sound used for playback.'),
  t(/Metronome/, 'Play a click on every beat during playback.'),
  t('Volume', 'Set the volume of playback.'),
];
