# Chord Progression Builder — Build Plan

This is a build plan for Claude Code. Read it fully before writing any code. Build in the three phases described at the end, and stop after each phase so the owner can test it and give feedback.

## 1. Purpose

The owner writes songs but has limited music theory. This app helps them build chord progressions by picking a key, picking a chord, and seeing where they could go next. Each suggestion is labeled with the chord name, its Roman numeral in the key, and a short reason. The app then plays the progression back at any tempo and time signature, with a choice of instrument and playing pattern.

It is a learning tool as much as a generator. Explanations should be short, plain-English, and correct.

## 2. Requirements summary (from the owner interview)

| Area | Decision |
|---|---|
| Platform | Web app, run locally in the browser. Must work well on both phone and desktop (responsive). |
| Keys / scales | Major, natural minor, and the modes: Dorian, Phrygian, Lydian, Mixolydian, Locrian. Any root note. |
| Chord richness | Triads, 7ths, sus2, sus4, add9, and inversions (slash chords). |
| Suggestions | In-key (diatonic) chords, plus common "outside" chords: borrowed chords and secondary dominants. Outside chords are clearly marked. |
| Suggestion view | Node map: the current chord in the center, with arrows to suggested next chords. |
| Explanations | A short reason on every suggestion, e.g. "V → I: resolves home". |
| Timeline | Named sections (Verse, Chorus, Bridge…), where each chord can last any number of beats. |
| Time signatures | Fully custom, e.g. 4/4, 6/8, 7/8, 11/16. |
| Playback | Choose the instrument and pattern (block, strum, arpeggio, etc.), with tempo control and loop. |
| Chord display | Names by default. Expanding a chord shows a piano keyboard or guitar diagram (switchable). |
| Output | Save progressions in the app, and export MIDI for use in a DAW. |

## 3. Tech stack

- **Vite + React + TypeScript**
- **Tailwind CSS** for styling
- **tonal** (`tonal` npm package) for note, scale, and chord spelling. Don't hand-roll enharmonic spelling.
- **Tone.js** for audio scheduling and instruments
- **@tonejs/midi** for MIDI export
- **zustand** for app state
- **@dnd-kit** for drag-to-reorder in the timeline
- **vitest** for unit tests (the theory and suggestion engines must be well tested)
- Persistence via `localStorage` (wrapped in try/catch)

The node map should be custom SVG with a radial layout, not a heavy graph library. The layout is simple, since there is always one center node and a ring of suggestions.

## 4. Architecture

```
src/
  theory/          # pure functions, no React, no audio
    scales.ts      # scale/mode construction
    chords.ts      # chord building, flavors, inversions, naming
    numerals.ts    # Roman numeral labeling
    suggestions.ts # next-chord scoring + reasons
    voicings.ts    # piano voicings + guitar shape generation
  audio/
    engine.ts      # Tone.js setup, transport, instruments
    patterns.ts    # block/strum/arpeggio renderers
  export/
    midi.ts
  state/
    store.ts       # zustand store
    persistence.ts
  components/
    KeyPicker, NodeMap, ChordNode, FlavorPicker,
    Timeline, Section, ChordSlot, TransportBar,
    ChordDetail (PianoKeyboard, GuitarDiagram), SavedSongs
```

The `theory/` folder must be pure and fully unit-tested. The UI and audio layers only consume it.

## 5. Data model

```ts
type Mode = 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian';

interface Key { tonic: string; mode: Mode }           // e.g. { tonic: 'D', mode: 'dorian' }

type Flavor = 'triad' | '7' | 'sus2' | 'sus4' | 'add9';

interface ChordRef {
  root: string;          // spelled note, e.g. 'F#'
  quality: string;       // 'maj' | 'min' | 'dim' | 'aug' | 'dom7' | 'maj7' | 'min7' | 'm7b5' ...
  flavor: Flavor;
  bass?: string;         // for inversions / slash chords
  numeral: string;       // e.g. 'IV', 'bVII', 'V/V', 'ii°'
  origin: 'diatonic' | 'borrowed' | 'secondary';
}

interface ChordEvent { id: string; chord: ChordRef; beats: number }

interface Section { id: string; name: string; events: ChordEvent[]; repeat: number }

interface Song {
  id: string; title: string; key: Key;
  timeSig: { beats: number; unit: 1 | 2 | 4 | 8 | 16 };
  bpm: number;                 // beats of `unit` per minute
  instrument: InstrumentId; pattern: PatternId;
  sections: Section[];
  arrangement: string[];       // ordered section ids (sections can repeat)
  updatedAt: number;
}
```

## 6. Theory engine

### 6.1 Scales and modes
Build the seven-note scale for any tonic and mode using `tonal`, with correct spelling (e.g. F♯ major contains E♯, not F).

### 6.2 Diatonic chords
Stack thirds on each degree to get triads and 7ths. Qualities must come from the actual scale notes, not a hard-coded table, so all modes work automatically.

### 6.3 Roman numerals
Label each chord relative to the key's tonic. Use uppercase for major, lowercase for minor, ° for diminished, ø7 for half-diminished, and + for augmented. When a chord's root is not in the parallel major scale, prefix it with ♭ or ♯ relative to that major scale. For example, in D Dorian the chords are `i, ii, ♭III, IV, v, vi°, ♭VII`, and in C Mixolydian the ♭VII chord is B♭.

Add 7th and flavor suffixes, e.g. `V7`, `IVmaj7`, `Isus4`, `vi(add9)`. Write inversions as figured bass or a slash, e.g. `I/3` → display "C/E (I⁶)". Pick one convention and use it consistently. The recommended format is the chord name plus the slash, with the numeral shown as `I⁶` / `I⁶₄`.

### 6.4 Flavors
Provide these flavors for any chord: triad, 7th (diatonic 7th quality), sus2, sus4, and add9. Also provide first, second, and (for 7ths) third inversion. A flavor never changes the chord's harmonic function, so the suggestions for `Gsus4` match those for `G`, plus the reason noted in 6.5.

### 6.5 Suggestion engine

`suggestNext(current: ChordRef, key: Key, previous?: ChordRef[]): Suggestion[]`

```ts
interface Suggestion { chord: ChordRef; score: number /*0–1*/; reason: string; origin: ChordRef['origin'] }
```

Return about 6–10 suggestions, sorted by score. Build them from these layers.

**A. Diatonic function rules (major key; adapt for the others).** Encode these as a data table, not if-statements:

| From | Strong next (≈0.8–1.0) | Good next (≈0.5–0.7) | Occasional (≈0.2–0.4) |
|---|---|---|---|
| I | IV, V | vi, ii | iii |
| ii | V | IV, vii° | I⁶₄ |
| iii | vi | IV | ii |
| IV | V, I | ii | vi, iv (borrowed) |
| V | I | vi (deceptive) | IV |
| vi | IV, ii | V | iii |
| vii° | I | iii | vi |

Example reasons:
- "V → I: the strongest pull home"
- "V → vi: deceptive cadence, sounds like home but sadder"
- "ii → V: the classic setup before resolving"
- "IV → I: plagal 'amen' cadence, gentle resolution"

**B. Minor key.** Use the natural minor degrees `i, ii°, III, iv, v, VI, VII`, plus a harmonic-minor `V`/`V7` scored above `v` when heading to `i`. Reasons should mention it, e.g. "Major V borrows from harmonic minor for a stronger pull to i".

**C. Modes.** Favor moves that show off each mode's characteristic chord, and state that in the reason:

| Mode | Characteristic moves |
|---|---|
| Dorian | i ↔ IV (major IV is the Dorian flavor) |
| Phrygian | i ↔ ♭II |
| Lydian | I ↔ II (major II) |
| Mixolydian | I ↔ ♭VII, ♭VII → IV → I |
| Locrian | Treat as advanced. Allow it, but note that the tonic chord is diminished and unstable. |

**D. Borrowed chords (modal mixture).** In major keys, offer these borrowed from the parallel minor: `iv`, `♭VI`, `♭VII`, `♭III`, `ii°`. In minor keys, offer `IV` (Dorian) and the major `V`. Score them at roughly 0.3–0.6, and mark them `origin: 'borrowed'`. Example reasons:
- "iv (borrowed from minor): bittersweet twist before I"
- "♭VII: rock/Mixolydian sound, often goes to IV or I"

**E. Secondary dominants.** For each diatonic major or minor chord X other than I, offer `V/X` (or `V7/X`) when the current chord could reasonably lead to it. The main case is showing `V/X` right after a chord that precedes X, or after I. Its own top suggestion should be X, e.g. "V/V (D major in C): borrows a dominant to push toward G". Mark these `origin: 'secondary'`.

**F. Adjustments.**
- Slightly penalize repeating the current chord, and suggest it only as a low "sustain" option.
- If `previous` shows a recent loop (e.g. I–V–vi–IV already twice), you may boost a cadence or a contrasting chord, with a reason like "break the loop".
- Keep all scores deterministic. There's no randomness.

**Tests:** cover C major, A minor, D Dorian, and F♯ major (spelling), checking at least the top suggestion and its numeral for every diatonic chord, plus the borrowed and secondary outputs.

## 7. UI

### 7.1 Layout
- **Desktop:** The key picker and transport are on top, the node map in the upper-center, and the timeline across the bottom. The chord detail is a side panel.
- **Phone:** Stack the key picker, then the node map (square, full width), then the timeline (horizontal scroll per section). The chord detail is a bottom sheet, and the transport bar is sticky at the bottom.
- Support light and dark themes (`prefers-color-scheme`).

### 7.2 Key picker
- Choose a root from 12 notes. Let the user pick the enharmonic spelling (e.g. G♭ vs F♯).
- Show the mode dropdown with a one-line description of each mode's mood.
- Changing the key asks whether to transpose the existing song or keep the chords as-is and relabel them.

### 7.3 Starting state
With no chord selected, the map shows all diatonic chords of the key in a ring, with I/i highlighted as "start here".

### 7.4 Node map
- The center node is the currently selected chord, showing its name and numeral.
- Arrange the suggestions radially. Arrow thickness and opacity reflect the score, and the highest score goes at the top.
- Color-code by origin: diatonic is neutral or primary, borrowed is one accent color, and secondary is another. Include a small legend.
- Each node shows its name (e.g. "B♭") with the numeral beneath (e.g. "♭VII").
- **Tap a node** to play a preview and show its reason in a tooltip or caption.
- **The node's "+" button (or double-tap)** adds it to the end of the current section and makes it the new center.
- **Long-press or the expand icon** opens the flavor picker (triad / 7 / sus2 / sus4 / add9, plus inversion). Each option can be previewed.
- Animate the transition when the center changes.

### 7.5 Timeline
- The timeline holds sections, each with an editable name, a repeat count, and delete and duplicate buttons. There are quick-add buttons for Verse, Chorus, Bridge, and Custom.
- Each chord slot's width is proportional to its beat length. Show beat ticks and bar lines computed from the time signature.
- Drag to reorder chords within and between sections, and drag to reorder sections.
- Tapping a slot selects it, so the map re-centers on that chord and suggestions now insert after it. The slot's controls are beats (– / +, or type a number), change flavor, replace, and delete.
- Include an arrangement row showing section order, since sections can appear multiple times (Verse, Chorus, Verse, Chorus, Bridge, Chorus).

### 7.6 Chord detail
- By default, chords show only their names.
- An expand control on any chord (in the map or the timeline) opens the detail view. It has a toggle between **Piano** (a keyboard spanning about 2 octaves with the voicing highlighted and note names) and **Guitar** (a chord diagram).
- The toggle choice is remembered.

### 7.7 Transport bar
- Play / Stop / Loop controls, with a loop scope of the whole song or the selected section.
- BPM, from 30 to 300, with a tap-tempo button.
- A custom time signature, with a numerator from 1 to 32 and a denominator of 1, 2, 4, 8, or 16.
- Instrument and pattern dropdowns, a metronome toggle, and volume.
- During playback, highlight the current chord in the timeline and center it in the map.

## 8. Audio

### 8.1 Timing
Use `Tone.Transport` with the time signature set. BPM counts the denominator note value (in 6/8 at 120 BPM, there are 120 eighth notes per minute). Add an optional "dotted feel" toggle so compound meters can count in dotted quarters.

### 8.2 Instruments
Initially provide:
- **Piano:** `Tone.Sampler` with piano samples. Download a small free sample set (e.g. the Salamander Grand subset used in Tone.js examples) into `public/samples/`, so the app works offline.
- **Electric piano:** an FM synth.
- **Pad:** a PolySynth with a slow attack and long release.
- **Guitar:** plucked, either with `Tone.PluckSynth` per string or samples if available.

### 8.3 Patterns
Each pattern is a function that takes the chord voicing, its beat length, and the time signature, and returns note events.
- **Block:** the whole chord, held for the full duration.
- **Pulse:** the chord re-struck on every beat.
- **Strum down / down-up:** a 15–30 ms stagger between notes, on each beat (down-up alternates on subdivisions).
- **Arpeggio up / up-down / broken:** eighth- or sixteenth-note arpeggiation, looping through the voicing.
- **Bass + chord:** the root on beat 1, and the chord on the remaining beats.

### 8.4 Voicings
- Voice-lead between consecutive chords by choosing the inversion or octave that minimizes total movement, while respecting any inversion the user explicitly chose.
- Keep piano voicings in a sensible range, around C3–C5 plus a bass note.

### 8.5 Mobile
The audio context must start on the first user tap.

## 9. Guitar diagrams
- Keep a curated table of common open and barre shapes (maj, min, 7, maj7, m7, sus2, sus4, add9) as movable shapes, E-shape and A-shape based.
- For chords not covered (inversions, rarer qualities), generate a playable shape algorithmically: search frets 0–12, allowing up to 4 fretted fingers and a maximum span of 4 frets, with the required bass note on the lowest sounding string. Prefer shapes near the open position.
- Label generated shapes as "generated voicing".

## 10. Save and export
- **Save:** songs go in `localStorage` under `chordbuilder:songs`, with autosave (debounced) plus explicit "Save as…". The saved-songs list supports rename, duplicate, and delete. Guard every storage call with try/catch, and handle empty or corrupt data by starting fresh.
- **Import/export JSON** of a song as a backup, which is cheap to add.
- **MIDI export:** use `@tonejs/midi` to export the whole arrangement. Use one track for chords, played with the selected pattern (the notes as heard), and an optional second track with block chords. Set the tempo and time signature in the MIDI header. The filename is `<song-title>.mid`.

## 11. Build phases

Stop after each phase, summarize what was built, and list how to test it.

### Phase 1: Core loop
- Scaffold the project (Vite, React, TS, Tailwind, vitest).
- Complete the theory engine for all modes (scales, diatonic triads and 7ths, numerals) with tests.
- Build the suggestion engine layers A–C (diatonic plus minor plus modes) with reasons and tests.
- Add the key picker, node map (with preview on tap, add to progression), and a single-section timeline with fixed 4-beat chords.
- Implement piano block-chord playback in 4/4 with BPM control and loop.

**Done when:** you can pick D Dorian, build a 4-chord loop from the map, hear it, and every chord shows the correct name and numeral.

### Phase 2: Full composition
- Add layers D and E (borrowed and secondary dominants) with color coding and a legend.
- Add the flavor picker (sus, add9, 7ths, inversions).
- Support flexible beat lengths, custom time signatures, bar lines, and multiple sections with the arrangement row, plus drag-reorder.
- Add all instruments and patterns, voice leading, the metronome, and tap tempo.

**Done when:** you can write a Verse and Chorus in 7/8 with mixed chord lengths, including a ♭VII and a V/V, and hear it strummed on guitar.

### Phase 3: Learning and output
- Build the chord detail panel with a piano keyboard and guitar diagrams (curated plus generated).
- Add save/load, autosave, and JSON import/export.
- Add MIDI export.
- Polish the mobile layout, dark mode, and animations.

**Done when:** a saved song survives a reload, the MIDI opens in a DAW with the correct tempo and meter, and guitar diagrams show for all chords in the song.

## 12. Quality bar
- The theory engine must never mis-spell a chord or mislabel a numeral. When unsure, test it against known references.
- Keep every reason under about 60 characters and free of unexplained jargon. If a term like "cadence" appears, the reason should itself make the meaning clear.
- Performance: the map re-renders instantly, and playback must not drift over a 5-minute loop.
- No backend and no accounts. `npm install && npm run dev` must be all that's needed.
