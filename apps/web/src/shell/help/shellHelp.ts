import type { HelpEntry } from '@sw/ui';
import { TIMELINE_HELP } from '@sw/timeline';

const PLAYBACK = '[aria-label="Playback"]';

/** Help for the shell's own controls: the header, the library, settings and the guide. */
export const SHELL_HELP: HelpEntry[] = [
  ...TIMELINE_HELP,
  { name: 'Back to library', text: 'Go back to your list of songs. Your song is saved automatically.' },
  { name: 'Song title', text: 'Type a new name for the song, then press Enter.' },
  { name: 'Rename song', text: 'Select to rename the song.' },
  { name: 'Chords', selector: '[role="tab"]', text: 'Build the chord progression: pick chords, arrange sections and play them.' },
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

  { selector: '.sw-order-chip', text: 'Scroll to this section. Playback highlights the section that is playing.' },

  // The transport, shared by every workspace in a song.
  { name: /^(Play|Stop)$/, scope: PLAYBACK, text: 'Play the song from the start, or stop it. The space bar does the same.' },
  { name: 'Loop', scope: PLAYBACK, text: 'Repeat playback until you stop it.' },
  { selector: '[aria-label="What to play"] button', scope: PLAYBACK, text: 'Choose what to play and repeat: the whole song, or just the section of the selected chord.' },
  { name: 'Tempo', scope: PLAYBACK, text: 'Set the tempo in beats per minute.' },
  { name: 'Tempo slider', scope: PLAYBACK, text: 'Set the tempo in beats per minute.' },
  { name: 'Tap tempo', scope: PLAYBACK, text: 'Tap this repeatedly in time to set the tempo.' },
];
