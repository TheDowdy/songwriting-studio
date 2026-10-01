/**
 * The user guide, as data. Written to the Google developer documentation style guide: second
 * person, present tense, active voice, sentence-case headings, numbered lists for procedures,
 * and **bold** for the names of buttons and controls as they appear on screen.
 * `GuideDialog` renders it; keep each section short and self-contained.
 */
export type GuideBlock =
  | { p: string }
  | { h3: string }
  | { ol: string[] }
  | { ul: string[] }
  | { note: string };

export interface GuideSection {
  id: string;
  title: string;
  blocks: GuideBlock[];
}

export const GUIDE: GuideSection[] = [
  {
    id: 'overview',
    title: 'About Songwriting Studio',
    blocks: [
      { p: 'Songwriting Studio helps you write a chord progression and work out how to play it on guitar. The app has two parts, which share the same song:' },
      {
        ul: [
          '**Progression** suggests chords that fit your key, and lets you arrange them into sections and play them back.',
          '**Guitar** shows your chords on a guitar neck, recommends voicings, and lets you change the tuning or capo.',
        ],
      },
      { p: 'The app saves your work automatically on this device. It also works offline after your first visit.' },
    ],
  },
  {
    id: 'start',
    title: 'Create your first song',
    blocks: [
      {
        ol: [
          'On the home screen, select **New song**.',
          'In the **Progression** tab, choose the key of your song.',
          'In the chord map, select a chord to hear it.',
          'Select **+ Add** to add the chord to your progression.',
          'Repeat steps 3 and 4 to build the progression. The map suggests chords that usually follow the one you selected.',
          'Select **Play** to hear the progression.',
        ],
      },
      { note: 'If you don’t hear anything, select **Tap to enable sound** at the top of the screen. Browsers keep sound off until you interact with the page.' },
    ],
  },
  {
    id: 'library',
    title: 'Manage your songs',
    blocks: [
      { p: 'The home screen lists your songs, newest first.' },
      {
        ul: [
          'To open a song, select its name.',
          'To delete a song, select **Delete** next to it, and then confirm.',
          'To add a song from a file, select **Import JSON…**, and then choose a file that you exported earlier.',
          'To open the guitar neck without a song, select **Guitar** under **Tools**.',
        ],
      },
      { p: 'To return to the home screen from a song, select the back arrow at the top left.' },
    ],
  },
  {
    id: 'progression',
    title: 'Build a progression',
    blocks: [
      { h3: 'Choose a key' },
      { p: 'Use the key controls to set the key of the song. If your song already has chords, the app asks whether to **Transpose them** to the new key, or to **Keep chords, relabel numerals**.' },
      { p: 'To change key partway through a song, add a section for the new part. Then, above the key controls, select **Only** and the section’s name, and choose the new key. That section shows its key next to its name. Select **Back to the song’s key** to undo it.' },
      { h3: 'Add chords from the map' },
      { p: 'The chord map shows the chord you’re building from at the center, with the chords that usually follow it around the edge. The colors show where each chord comes from: the key, another key, or a secondary chord.' },
      {
        ol: [
          'Select a chord in the map to hear it.',
          'Select **+ Add** to add it to the end of the progression.',
        ],
      },
      { p: 'To make a chord major or minor without changing the key, select it and then select **Make minor** or **Make major**. The chord keeps its root and type. For example, in C major, F becomes Fm, a chord borrowed from the parallel minor.' },
      { h3: 'Use the circle of fifths' },
      { p: 'Above the map, select **Circle of fifths** to see every chord at once instead of suggestions. Major chords are on the outside, their relative minor chords in the middle, and the diminished chord of each key inside. The shading shows each chord’s place in your key: the key chord is solid, the other chords of the key are tinted, chords borrowed from the parallel key are amber, and the rest are plain. You can pick any of them, so it’s a way to reach unusual or discordant chords. Select a chord to hear it, and then select **+ Add**. Select **Use as key** to shift the key of the section you’re editing to that chord. Select **Suggestions** to go back to the map.' },
      { h3: 'Edit a chord' },
      { p: 'Select a chord in the timeline, and then use the buttons below it:' },
      {
        ul: [
          '**Strum pattern** chooses how this chord is played: a built-in pattern or one you made, or the same as the section and song.',
          '**Flavor** changes the chord type, such as 7th or sus4.',
          '**Piano / guitar** shows the chord on a keyboard or as a guitar diagram.',
          '**Replace** swaps the chord for one you choose from the map.',
          '**Duplicate** copies the chord. **Remove** deletes it.',
          'The **Beats** field sets how long the chord lasts. A chord shows one slash for each beat.',
        ],
      },
      { p: 'To reorder chords, press and hold a chord, and then drag it to a new position.' },
      { h3: 'Organize sections' },
      { p: 'A song is made of sections, such as a verse and a chorus. Add a section with the buttons below the timeline, for example **+ Verse**. In the arrangement, add sections in the order you want them played. A section can appear more than once.' },
      { p: 'Use **–** and **+** next to a section’s name to set how many times it repeats. **Duplicate section** copies a section, and **Clear** removes its chords.' },
      { h3: 'Build your own strum patterns' },
      { p: 'A strum pattern is a rhythm of down and up strums. To make one, select **Strum patterns** next to **More ▾** in the playback bar. In **New pattern from**, choose **Blank** or a common rhythm to start from.' },
      {
        ul: [
          'Each box is one step. Select a step to change it: first a down strum (↓), then an up strum (↑), then a rest (·).',
          'With a step selected, choose **All strings**, **Low strings** or **High strings** for a full or partial strum, and select **Accent** to make it louder.',
          'Use **Length in beats** and **Steps in each beat** to change how long the pattern is and how finely it divides each beat. Strokes you’ve already placed stay at the same moment where they still fit. Shortening a pattern removes the steps past its end.',
          'Select **▶ Preview** to hear it on the selected chord.',
        ],
      },
      { p: 'A pattern repeats to fill a longer chord, and a chord shorter than the pattern plays the start of it. To use a pattern, select one of **Selected chord**, **Rest of section** (the selected chord and the ones after it), **Whole section** or **Entire song**. A chord’s own choice wins over its section’s, and a section’s wins over the song’s. You can also pick a pattern for one chord with **Strum pattern** under the timeline. A chord with a pattern of your own shows its strokes as arrows in its block, and a small ≋ if it has a choice of its own. Select **Delete pattern** to remove it; anything that used it goes back to the next level up.' },
      { h3: 'Play the progression' },
      {
        ul: [
          'Select **Play** or **Stop** to start or stop playback. On a computer, you can also press the space bar.',
          'Turn on **Loop** to repeat playback. Choose **Whole song** or **This section**.',
          'Set the tempo with the slider, or select **Tap** repeatedly in time.',
          'Select **More playback settings** to change the time signature, instrument, pattern, metronome, and volume.',
        ],
      },
    ],
  },
  {
    id: 'guitar',
    title: 'Play the progression on guitar',
    blocks: [
      { p: 'Select the **Guitar** tab to see your song on a guitar neck. Your chords appear in a strip above the neck.' },
      { h3: 'Show a chord on the neck' },
      { p: 'Select a chord in the strip. The neck shows the recommended shape for it, and you hear it play. Each chord shows one slash for every beat it lasts, as on a lead sheet.' },
      { h3: 'Choose a voicing' },
      { p: 'A voicing is one way to play a chord on the neck. To choose one:' },
      {
        ol: [
          'Select a chord in the strip.',
          'In the **Chords** panel below the neck, select **Next ▶** or **◀ Prev** to browse voicings. You can also select any voicing in the list.',
          'Select **Use this voicing** to save it on the chord.',
        ],
      },
      { p: 'A chord with a saved voicing shows a small diagram in the strip. A chord without one has a dashed border, and plays the recommended shape. To go back to the recommended shape, select **Remove voicing**.' },
      { p: 'Use **Root in bass only**, **Max stretch (frets)**, and the other rules under **Voicing rules & filters** to narrow the voicings that the app offers.' },
      { h3: 'Edit chords from the guitar tab' },
      { p: 'With a chord selected, the toolbar above the neck lets you change it without leaving the Guitar tab: **Flavour**, **Inversion**, **Replace**, **Beats**, **Duplicate**, **Remove**, and **+ Add after**.' },
      { h3: 'Strum patterns on guitar' },
      { p: 'Select **Strum patterns** in the strip to build and place your own strum patterns, the same way as in the Progression tab. With a pattern, **▶ Play song** strums each chord as the pattern says: down strums go from the low strings to the high ones, up strums from high to low, and partial strums use only the low or high strings. A chord with no custom pattern is strummed once at the start of each bar. The **Strum pattern** list in the toolbar above the neck sets the pattern for the selected chord.' },
      { h3: 'Play the song' },
      { p: 'Select **▶ Play song** to hear every chord, or **▶ Play section** to hear the section of the selected chord. The neck and strip follow the chord that’s playing. On a computer, press the space bar to start or stop playback. Select **↶ Undo** to reverse your last change.' },
      { h3: 'Change the tuning or capo' },
      {
        ol: [
          'Choose a tuning from **Tuning**, or a capo position from **Capo**.',
          'If chords have saved voicings, the app asks you to confirm. Select **Change tuning** or **Change capo**. Select **Cancel** to keep things as they were.',
          'The affected chords show a warning. Select **⚠ Re-voice** to open the re-voicing panel.',
          'For each chord, select one of the suggested shapes, or select **Re-voice all** to let the app choose the smoothest set.',
        ],
      },
      { p: 'To make your own tuning, drag a string’s peg up or down on the neck, and then select **Save tuning**.' },
      { h3: 'Make a variant of a section' },
      { p: 'A variant is a copy of a section with the chords voiced in a different place on the neck.' },
      {
        ol: [
          'Select **Make a variant of** on the section. In the **Progression** tab, the button is **Make variant**.',
          'Choose how to voice the chords, such as **Open position** or **Smoothest movement**. The preview shows the result.',
          'Select the button that creates the variant.',
        ],
      },
      { h3: 'Add a chord you built on the neck' },
      { p: 'You can add any chord you build or identify on the neck to your song. In the **Chords** tab, build the chord and choose a voicing, then select **Add to progression**. In the **Identify** tab, select the notes, then select **Add to progression** once the chord is named. The chord goes after the chord that’s selected in the strip, or at the end of the song if none is, and it keeps the shape you chose as its voicing. Select **Progression** to see suggestions for what could come next.' },
      { h3: 'Explore scales and identify chords' },
      {
        ul: [
          'In the **Scales** tab, choose a key and a scale to show it on the neck, and select **▶ Play** to hear it.',
          'In the **Identify** tab, select notes on the neck to find out which chord they make.',
        ],
      },
    ],
  },
  {
    id: 'share',
    title: 'Save, export, and print',
    blocks: [
      { p: 'The app saves your song automatically. To back it up, or to move it to another device:' },
      {
        ol: [
          'In the **Progression** tab, select **Save, load and export**.',
          'Select **Export JSON** to download a file, **Export MIDI** to use the chords in other music software, or **Sheet music** to open a printable chord sheet.',
        ],
      },
      { p: 'To restore a song from a file, select **Import JSON** here, or **Import JSON…** on the home screen.' },
    ],
  },
  {
    id: 'help',
    title: 'Get help in the app',
    blocks: [
      { p: 'You can find out what any control does without using it.' },
      {
        ul: [
          '**With a mouse:** point at a control and wait a moment. A short description appears.',
          '**On a phone or tablet:** select the **Help** button (the question mark) at the top of the screen to turn on help mode. The screen dims. Select any control to read what it does. Nothing is changed while help mode is on. Select **Done** to leave help mode.',
          '**With a keyboard:** move focus to a control to see its description. In help mode, press Enter on a control to read about it, and press Escape to leave.',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Change settings',
    blocks: [
      { p: 'Select the gear icon at the top of the screen to open **Settings**.' },
      {
        ul: [
          '**Theme** switches between light and dark, or matches your device.',
          '**Master volume** and **Mute** control the sound of the whole app.',
          '**Open the user guide** opens this guide.',
        ],
      },
      { p: 'The Guitar tab has its own **Settings** button for saved tunings, a larger neck for touch screens, and colors for color-blind users.' },
    ],
  },
  {
    id: 'trouble',
    title: 'Troubleshoot',
    blocks: [
      { h3: 'You can’t hear anything' },
      {
        ul: [
          'Select **Tap to enable sound** if it appears.',
          'Check that **Mute** is off in **Settings**, and that your device volume is up.',
          'On an iPhone, check that the silent switch is off.',
        ],
      },
      { h3: 'A chord shows a warning' },
      { p: 'The saved voicing no longer fits the chord, the tuning, or the capo. Select the chord, and then select **Re-fit** to find the nearest shape that works.' },
      { h3: 'Your songs are missing' },
      { p: 'Songs are stored in your browser on this device. Clearing your browser data deletes them. Export songs that you want to keep.' },
    ],
  },
];
