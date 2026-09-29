import type { HelpEntry } from '@sw/ui';

/** Help for the shell's own controls: the header, the library, settings and the guide. */
export const SHELL_HELP: HelpEntry[] = [
  { name: 'Back to library', text: 'Go back to your list of songs. Your song is saved automatically.' },
  { name: 'Song title', text: 'Type a new name for the song, then press Enter.' },
  { name: 'Rename song', text: 'Select to rename the song.' },
  { name: 'Progression', selector: '[role="tab"]', text: 'Build the chord progression: pick chords, arrange sections and play them.' },
  { name: 'Guitar', selector: '[role="tab"]', text: 'See the chords on a guitar neck, choose voicings and change the tuning or capo.' },
  { name: 'Help', text: 'Turn on help mode. Then select any part of the screen to see what it does, instead of using it.' },
  { name: 'Preferences', text: 'Open settings for the theme and volume, and the user guide.' },
  { name: 'Match system', text: 'Use the same light or dark theme as your device.' },
  { name: 'Light', text: 'Always use the light theme.' },
  { name: 'Dark', text: 'Always use the dark theme.' },
  { name: 'Master volume', text: 'Set the volume of the whole app. It applies on top of each module’s own volume.' },
  { name: 'Mute', text: 'Silence all sound in the app.' },
  { name: 'Open the user guide', text: 'Read step-by-step instructions for using the app.' },
  { name: 'Close', text: 'Close this window.' },
  { name: 'Done', text: 'Close this and keep your changes.' },
  { name: 'New song', text: 'Start a new, empty song and open it.' },
  { name: 'Import JSON…', text: 'Add a song from a file you exported earlier.' },
  { name: 'Import a song file', text: 'Choose a song file to import.' },
  { name: 'Delete', text: 'Delete this song. You’ll be asked to confirm.' },
  { name: 'Tap to enable sound', text: 'Your browser keeps sound off until you interact with the page. Select this to turn it on.' },
  { selector: 'main ul li > button:first-child', text: 'Open this song.' },
  { name: 'Guitar', text: 'Open the guitar neck without a song, to explore scales, chords and tunings.' },
];
