# Fluid Frets — Alternate Tuning Explorer: Build Plan for Claude Code

> **How to use this file:** Put it in an empty project folder, open Claude Code there, and say:
> *"Read PLAN.md. Implement Phase 0 and Phase 1, run the tests, and stop for my review."*
> Then continue phase by phase. Each phase has acceptance criteria; don't move on until they pass.

---

## 0. Assumed decisions (edit these before handing over)

These were not fully specified; the plan uses the defaults below. Change any line and Claude Code will follow your version.

| Topic | Default used in this plan |
|---|---|
| Octaves | The tuning selectors show note **and octave** (E2, A2 …). Fret labels on the neck show note names only — no octave numbers anywhere else. |
| Tuning range per string | Each string may go **7 semitones below and 5 above** its standard pitch (keeps things realistic while covering Drop B through Nashville-style ideas). A "Unlimited range" toggle in settings removes the limit (±24). |
| Strumming with nothing selected | Strums the **open strings** of the current tuning. If a chord voicing or an open-selection is active, strums **that** instead. Muted strings are **silent**. Strum direction matters (order of notes, slightly brighter on upstrokes). |
| Voicing rules | Max stretch **4 frets** (open strings don't count), open strings allowed, max **4 fretting fingers** (a barre counts as one), inversions allowed, root need not be in the bass. For 9th/11th/13th chords the 5th (and the 11th in 13th chords) may be omitted. All adjustable in a "Voicing rules" panel. |
| Note spelling | Correct spelling for the selected key/chord (B♭ in F major, not A♯). In chromatic mode, a **♯ / ♭ toggle** (default ♯). |
| Chord naming ambiguity | Show **one best name** large, with alternatives listed below (e.g. "C6 — also: Am7/C"). |
| Left-handed mode | Included as a toggle (mirrors the neck; nut on the right). |
| Visual style | Realistic wood, frets and inlays drawn in SVG (no image files), with a selectable **guitar model** that changes the visible headstock, fretboard, inlays, strings and body edge. All models are original designs (see §4a). |
| Scale playback | Tempo control (40–240 BPM), ascending / descending / both, 1 octave / 2 octaves / whole neck. |
| Sound engine | Pure synthesis now (physical-model strings), behind an interface so recorded samples can be added later. |
| Devices | Desktop, tablet and phone (touch-first input; phones prefer landscape). |
| Hosting | Static site: runs locally (`npm run dev`), deployable to Vercel/Netlify, and a Docker image for a Synology NAS. |

---

## 1. Product summary

A single-page web app showing a full guitar neck (nut → last fret) with six strings, where every fret position displays the note it produces in the current tuning. The user can retune each string with a scroll-wheel "tuning peg" left of the nut (hearing the pitch glide as they drag), pick preset or saved tunings, click or strum to hear notes, overlay keys/scales/triads with optional rainbow degree colouring, play scales, build any chord and browse its playable voicings in the current tuning, and identify arbitrary chord shapes.

The core purpose: **finding and hearing chords and scales in alternate tunings.** Every feature should update instantly when the tuning changes.

---

## 2. Tech stack

- **Vite + React 18 + TypeScript** (strict mode).
- **Zustand** for app state (with `persist` middleware for settings and saved tunings in `localStorage`).
- **SVG** for the fretboard (crisp at any size, easy hit-testing, easy animation). React renders the SVG; animation via `requestAnimationFrame`-driven state or CSS transforms (not a heavy animation library).
- **Web Audio API** directly, with an **AudioWorklet** for the string model. No Tone.js (we need low-level control of the string model).
- **Vitest** for unit tests (music theory and voicing logic must be heavily tested). **Playwright** optional for a smoke test.
- **vite-plugin-pwa** (optional, Phase 9) so it can be installed on tablet/phone home screens and work offline.
- No backend. Everything is client-side.

### Folder structure

```
src/
  theory/            # pure TS, no React, no audio — fully unit tested
    notes.ts         # pitch classes, MIDI, spelling, enharmonics
    tunings.ts       # preset tunings, validation, range limits
    scales.ts        # scale definitions + degree metadata
    chords.ts        # chord formula builder + naming
    identify.ts      # notes → chord name(s)
    voicings.ts      # voicing search + scoring
    fretboard.ts     # (tuning, fretCount) → grid of positions
  audio/
    engine.ts        # AudioContext, master chain, unlock on gesture
    instrument.ts    # Instrument interface (synth now, samples later)
    synth/
      string-worklet.ts   # Karplus-Strong AudioWorkletProcessor
      SynthInstrument.ts
      presets.ts     # steel, nylon, clean, crunch, high-gain, jazz
    effects.ts       # body resonance, pickup EQ, distortion, cab sim, reverb
    scheduler.ts     # scale/chord/strum timing
  state/
    store.ts         # Zustand store
  components/
    Fretboard/       # Neck.tsx, Strings.tsx, Frets.tsx, NoteMarkers.tsx, Inlays.tsx
    TuningPeg/       # the scroll-wheel selector
    Toolbar/         # tuning dropdown, save, fret count, sound, volume
    Panels/          # ScalePanel, ChordPanel, IdentifyPanel, SettingsPanel
  hooks/
  styles/
  App.tsx
tests/
Dockerfile
docker-compose.yml
nginx.conf
```

---

## 3. Core data model

```ts
type MidiNote = number;              // 40 = E2, 45 = A2, … (A4 = 69 = 440 Hz)
type PitchClass = 0|1|2|3|4|5|6|7|8|9|10|11;   // 0 = C

interface Tuning {
  id: string;
  name: string;
  strings: MidiNote[];   // index 0 = 6th (lowest) string … index 5 = 1st string
  builtIn: boolean;
}

interface FretPosition { string: number; fret: number; }   // fret 0 = open

interface Voicing {
  frets: (number | null)[];   // per string, null = muted
}
```

State (Zustand) holds: `tuning`, `liveTuning` (fractional MIDI values during a peg drag — see §5), `fretCount` (18–24), `guitarModel`, `soundPreset`, `volume`, `muted`, `leftHanded`, `accidentalPref`, `mode` (`explore | scale | chord | identify`), scale settings, chord settings, current voicing, open-selection state, saved tunings.

---

## 4. Fretboard rendering

**Layout (right-handed default):** nut on the left, highest fret on the right. String 6 (lowest) at the **bottom** of the screen, string 1 at the top — as the player sees it looking down.

- **Fret spacing:** realistic rule — distance from nut to fret *n* = `L × (1 − 2^(−n/12))`, scaled so the last fret fits the available width. Provide a settings toggle **"Even fret spacing"** because on phones the high frets get cramped. Default: realistic on screens ≥ 900 px wide, even spacing below that.
- **Headstock/body:** show a sliver of headstock left of the nut (where the tuning pegs live) and a hint of the body after the last fret, cropped by the frame. Their appearance comes from the selected guitar model (§4a).
- **Strings:** 6 lines with thickness decreasing from string 6 to string 1; wound look (subtle dashed pattern) on 4–6. When a string is plucked, draw a brief vibration (a small sine-wave wobble on that string that decays with the sound).
- **Frets & inlays:** nickel fret wires; dot inlays at 3, 5, 7, 9, 15, 17, 19, 21; double dots at 12 and 24. Fret numbers shown below the neck.
- **Note markers:** a circle + label centred in each fret space (between fret wires), and one for the open string placed **behind the nut** (between nut and pegs). Markers are sized to the smaller of fret width / string gap so they never overlap.
- **Responsiveness:** the SVG uses a `viewBox` and scales to the container. On phones in portrait, show a gentle "rotate for the full neck" hint and allow horizontal scrolling of the neck; landscape shows it all.
- **Left-handed toggle:** mirror horizontally (nut on the right); text must stay unmirrored.

### Note label positions (important for the tuning animation)

Compute each label's x-position from **pitch, not fret index**:
for a note of MIDI value `m` on a string whose current (possibly fractional) pitch is `p`, its fret position is `f = m − p`. Map `f` to an x-coordinate by interpolating between fret-space centres (with fret −1…0 mapping to the behind-the-nut slot). Render labels for every note `m` where `−0.5 ≤ f ≤ fretCount + 0.5`, fading at the edges.

This means that when `p` changes continuously during a peg drag, every label on that string **slides smoothly along the neck** and new labels slide in from the edges. When the drag ends, `p` snaps to the nearest semitone and labels settle exactly into fret centres (animate the snap over ~120 ms).

---

## 4a. Guitar models (visual skins)

A **Guitar** selector in the toolbar changes the look of everything visible in the frame. Each model is a data file ("skin") consumed by the SVG renderer, so adding models later needs no code changes. A skin defines:

- **Headstock** (only the part near the nut is visible, cropped by the frame): silhouette, tuner layout (3+3, six-in-line, or slotted with rollers), nut material/colour.
- **Fretboard:** wood (rosewood, maple, ebony — with subtle SVG grain via gradients/noise filters), binding on/off, inlay style (dots, blocks, none with side dots only), fret-wire colour.
- **Strings:** wound vs plain per string; nylon models draw clear/white trebles and silk-wound basses; steel/electric draw nickel or bronze.
- **Body edge** after the last fret (cropped): acoustic top with soundhole edge and rosette; electric body edge with the neck pickup visible; hollow-body edge with a sound-hole hint. The body is always drawn **after** the last fret so it never covers note markers.
- **Finish colour** and an optional default fret count and default sound preset.

**Models to ship** (generic names):
- **Steel-string acoustic**
- **Classical (nylon)**
- **Solid-body electric, double cutaway**
- **Solid-body electric, single cutaway**
- **Hollow-body electric**

**Originality rule (important):** every silhouette, headstock, pickguard, inlay pattern and colour scheme must be designed from scratch. Do **not** trace, copy or approximate any manufacturer's body shape, headstock outline or signature design details, and use no brand names, model names or logos anywhere. Many guitar headstock and body shapes are protected as trademarks/trade dress, so the models should read as "an acoustic" or "a single-cut electric", never as a specific branded guitar.

**Extras:** a "Customise" popover (fretboard wood, inlay style, finish colour) and a **"Match sound to guitar"** toggle (on by default): choosing a model also selects its natural sound preset (e.g. Classical → nylon), which the user can still override. Choosing a model also sets its default fret count (e.g. Classical → 19) unless the user has changed the fret count themselves.

---

## 5. Tuning pegs (scroll-wheel selectors)

One vertical "drum roller" per string, just left of the nut, aligned with its string.

- Shows the current note + octave in the centre (e.g. **D2**), with the neighbouring semitones above and below, faded, like a slot-machine reel. Accidentals follow the ♯/♭ preference.
- **Interaction (pointer events, works for mouse and touch):**
  1. `pointerdown` → **pluck** that string at its open pitch (full velocity), capture the pointer.
  2. `pointermove` (vertical drag; dragging **up raises pitch**) → the pitch changes **continuously** (e.g. 24 px per semitone). Update `liveTuning[string]` as a fractional MIDI value every frame. Send the continuous pitch to the audio engine so the ringing note **glides (legato)** — do **not** re-pluck. The note keeps decaying naturally, so a long drag fades out like a real string being turned.
  3. `pointerup` → snap to the nearest semitone, commit to `tuning`. Tuning dropdown switches to "Custom" (unless the result matches a preset, in which case select that preset's name).
- Mouse wheel over a peg: step one semitone per notch, with a short pluck on each step.
- Keyboard: focusable; ↑/↓ step a semitone (with pluck). Provide `aria-label`s like "String 6 tuning, D2".
- Enforce the range limits from §0 (clamp with a small rubber-band effect at the limit).

---

## 6. Tunings: presets, custom, saving

Dropdown in the toolbar, grouped:

**Standard & lowered:** Standard (E2 A2 D3 G3 B3 E4) · Half-step down (E♭2 A♭2 D♭3 G♭3 B♭3 E♭4) · Whole-step down / D standard (D2 G2 C3 F3 A3 D4) · C standard (C2 F2 B♭2 E♭3 G3 C4) · B standard (B1 E2 A2 D3 F♯3 B3)

**Drop:** Drop D (D2 A2 D3 G3 B3 E4) · Double drop D (D2 A2 D3 G3 B3 D4) · Drop C♯ (C♯2 G♯2 C♯3 F♯3 A♯3 D♯4) · Drop C (C2 G2 C3 F3 A3 D4) · Drop B (B1 F♯2 B2 E3 G♯3 C♯4)

**Open:** Open D (D2 A2 D3 F♯3 A3 D4) · Open D minor (D2 A2 D3 F3 A3 D4) · Open G (D2 G2 D3 G3 B3 D4) · Open G minor (D2 G2 D3 G3 B♭3 D4) · Open E (E2 B2 E3 G♯3 B3 E4) · Open A (E2 A2 E3 A3 C♯4 E4) · Open C (C2 G2 C3 G3 C4 E4) · Open C6 (C2 A2 C3 G3 C4 E4)

**Modal & other:** DADGAD (D2 A2 D3 G3 A3 D4) · All fourths (E2 A2 D3 G3 C4 F4) · New Standard Tuning (C2 G2 D3 A3 E4 G4) · Nashville / high-strung (E3 A3 D4 G4 B3 E4)

**My tunings:** user-saved, listed at the bottom.

(Note: the range limits in §0 must allow every built-in preset; Nashville's strings are an octave up, so presets bypass the drag limits.)

- **Save** button → modal asking for a name, pre-filled with the notes (e.g. "C G D G B D"). Stored in `localStorage`. Duplicate names get a confirm-overwrite prompt.
- **Manage** (in settings): rename, delete, and **Export / Import JSON** (so tunings survive clearing the browser or move between devices).
- Selecting a preset animates each string's labels sliding to their new positions (reuse the continuous-pitch mechanism, ~300 ms), and plays a quick soft strum of the new open strings (setting to disable).

---

## 7. Playing: clicks and strums

- **Tap/click a fret position** → pluck that note. Tapping behind the nut plays the open string.
- **One voice per string** (like a real guitar): a new note on a string stops the previous one on that string with a short damp.
- **Strum:** a pointer drag that crosses **two or more strings** is a strum. Detect the moment the pointer crosses each string's line and trigger that string immediately (so strum speed = drag speed). Velocity scales with drag speed. What each string plays: the active voicing or open selection if there is one, otherwise the open strings. **Muted strings stay silent.** Direction matters: a downstroke (pointer crosses string 6 first) sounds the strings low → high; an upstroke (string 1 first) sounds them high → low, slightly lighter and brighter.
- **Distinguish tap vs strum:** a pointer movement of < 8 px is a tap; otherwise treat as strum and don't fire the tap.
- Visual feedback: the marker pulses and the string wobbles while it sounds.

---

## 8. Audio engine

### 8.1 Architecture

```
[String voices (AudioWorklet)] → [per-preset body/pickup filters] → [drive/distortion] → [cab sim] → [reverb send] → [master gain] → destination
```

- `AudioContext` created lazily and **resumed on the first user gesture** (required on iOS/Safari). Show a small "Tap to enable sound" banner if the context is suspended. Note in the help text that iPhones in silent mode may mute web audio.
- Define an `Instrument` interface so samples can be dropped in later without touching the UI:

```ts
interface Instrument {
  pluck(string: number, midi: number, opts?: { velocity?: number; when?: number }): VoiceHandle;
  setPitch(voice: VoiceHandle, midi: number /* fractional */, rampMs?: number): void;
  damp(voice: VoiceHandle, when?: number): void;
  setPreset(id: SoundPresetId): void;
}
```

### 8.2 String synthesis (SynthInstrument)

Implement an **extended Karplus-Strong** physical model in an `AudioWorkletProcessor`:

- Excitation: a short noise burst shaped per preset (filtered by pick position — comb filter at the pluck point; softer/lowpassed for nylon & fingerstyle; brighter and sharper for steel and electric).
- Delay line with **fractional delay** (Lagrange or all-pass interpolation) so the pitch can be changed **continuously** without clicks — this is what makes the tuning-peg glide sound natural: the string keeps ringing and bends in pitch as the delay length changes.
- Loop filter (one-pole low-pass) controlling brightness decay; loss factor controlling sustain; both per preset and pitch-dependent (low strings sustain longer).
- Slight random detune and stereo spread per string for realism; optional dual-polarisation (two slightly detuned loops) for a richer tone.
- Use one worklet node per active voice (max 6 string voices + a small pool for fast passages), or a single polyphonic worklet — Claude Code's choice, but it must support per-voice continuous pitch.

### 8.3 Sound presets

| Preset | Character / signal chain |
|---|---|
| Acoustic (steel) | Bright excitation, long sustain, body resonance (several peaking biquads ~100 Hz, ~200 Hz, ~ 400 Hz, gentle air shelf), light room reverb |
| Classical (nylon) | Soft, low-passed excitation, shorter brightness decay, warm body EQ, a little reverb |
| Clean electric | Medium excitation, pickup EQ (resonant peak ~2.5–4 kHz, less body), subtle chorus optional |
| Jazz electric | Neck-pickup tone: darker loop filter, rolled-off highs |
| Crunch | Clean electric → soft-clip waveshaper (moderate drive) → cab sim (low-pass ~5 kHz + mid bump) |
| High-gain distortion | Heavy asymmetrical waveshaper with pre/post EQ, cab sim, noise-gate-like tail cutoff |

All effect parameters live in `presets.ts` as data so they're easy to tweak.

### 8.4 Volume

Toolbar slider (0–100 %, perceptual/log curve) plus a mute button. Persisted. A soft limiter (DynamicsCompressor) on the master bus prevents clipping on big strums with distortion.

### 8.5 Future samples (not now — just keep the door open)

A later `SampleInstrument` would load per-string multisamples (e.g. every 3rd fret) and pitch-shift via `playbackRate`, gliding via `playbackRate.linearRampToValueAtTime`. Nothing in the UI should depend on the synth specifically.

---

## 9. Music theory engine (`src/theory/`)

Pure, framework-free, heavily unit-tested.

### 9.1 Notes & spelling
- MIDI ↔ pitch class ↔ name conversions; frequency = `440 × 2^((m − 69)/12)`.
- **Spelling:** given a key or chord root and its interval formula, spell each note with correct letter names (each scale degree uses the next letter; allow double sharps/flats only where theory requires them, e.g. G♯ harmonic minor has F𝄪). In chromatic mode, use the ♯/♭ preference.

### 9.2 Scales (data-driven: interval list + degree names)
Major (Ionian), Natural minor (Aeolian), Dorian, Phrygian, Lydian, Mixolydian, Locrian, Harmonic minor, Melodic minor (ascending), Phrygian dominant, Harmonic major, Major pentatonic, Minor pentatonic, Blues (minor), Major blues, Whole tone, Diminished (half-whole), Diminished (whole-half), Hungarian minor, Double harmonic, Chromatic.

Each scale records its **degree numbers relative to the major scale** (e.g. minor pentatonic = 1, ♭3, 4, 5, ♭7) — this drives the colour mode.

### 9.3 Chord formula builder
Build a chord from:
- **Root** (12 roots, spelled by preference)
- **Triad / base quality:** major, minor, diminished, augmented, sus2, sus4, power (5)
- **Seventh / sixth:** none, 6, 7 (♭7), maj7, dim7 (only with dim), 6/9
- **Extension:** none, 9, 11, 13 (implies the lower extensions as appropriate)
- **Alterations (multi-select):** ♭5, ♯5, ♭9, ♯9, ♯11, ♭13
- **Added tones:** add9, add11, add13 (only when no seventh)
- **Omissions:** no3, no5
- **Bass note** (slash chord): none or any of 12 notes

Output: interval set, spelled notes, and a canonical name (e.g. `C7♯9`, `Fmaj7♯11`, `Dm7♭5`, `A7sus4`, `G/B`, `E5`). Invalid combinations are disabled in the UI with a tooltip explaining why. Show the formula (1 3 5 ♭7 ♯9) and spelled notes next to the chord name.

### 9.4 Chord identification (`identify.ts`)
Input: sounding notes (with the bass = lowest sounding note).
1. Reduce to a pitch-class set.
2. For every pitch class in the set as a candidate root, compute intervals and match against a template library covering everything the builder can produce (including omitted-5th forms).
3. Score candidates: exact match > match with omitted 5th > added/altered tones; root in bass bonus; common chords (triads, 7ths) preferred over exotic readings; slash names when bass ≠ root.
4. Return best + alternatives (e.g. `C6` / `Am7/C`). Two notes → interval name or power chord; one note → note name.

### 9.5 Fretboard map
`buildFretboard(tuning, fretCount)` → for each string and fret: MIDI, pitch class, spelled name, and (when a scale/chord is active) role (tonic, degree, chord tone, out-of-scale).

---

## 10. Scale / key mode (the "fret mode" panel)

- **Mode:** Chromatic (all notes equal) or Key.
- **Key:** root selector (12) + **Scale** selector (§9.2).
- **Display:**
  - In-scale notes: full opacity, filled marker.
  - Out-of-scale notes: greyed out (≈30 % opacity, outline only); toggle "Hide out-of-scale notes" to remove them entirely.
  - Tonic: distinct highlight colour and slightly larger marker.
- **Overlay layer** (second, optional): show an additional structure **as a coloured ring** around matching markers, so it combines cleanly with the scale fill. Options:
  - Diatonic triad of any scale degree (I, ii, iii, IV, V, vi, vii°) or diatonic seventh chords
  - Any other scale on the same root (e.g. minor pentatonic inside natural minor, blues notes)
  - Any chord from the chord builder
- **Scale colour mode (toggle):** colour each note by its scale degree:
  1 = red, 2 = orange, 3 = yellow, 4 = green, 5 = blue, 6 = indigo, 7 = violet.
  Scales with fewer notes use the colour of their **degree number** (minor pentatonic: 1 red, ♭3 yellow, 4 green, 5 blue, ♭7 violet), so colours stay consistent between related scales. When two notes share a degree number (e.g. blues 4 and ♭5, diminished scales), the altered one gets the same hue with a striped or dashed-ring variant. Chromatic scale: 12-hue wheel starting at red. Colours must keep label text readable (auto black/white text by luminance) and should have a colour-blind-friendly alternative palette in settings.
- **Legend** below the neck showing degree → note → colour.

### Scale playback (§ requirement 9)
- **Play scale** button with tempo (BPM), direction (up / down / up-and-down), range (1 octave / 2 octaves / whole neck), and a **position** selector (fret window, e.g. "Position: frets 5–9", or "Auto").
- Fingering choice: for each note in pitch order, pick the string/fret inside the chosen window (prefer the lowest string that keeps you in the window; fall back to the nearest position). "Whole neck" plays every scale note from the lowest available pitch to the highest.
- Each note lights up and plucks as it's played; a stop button cancels. Timing via the audio clock (schedule-ahead), not `setTimeout` alone.

---

## 11. Chord mode

1. User builds a chord with the dropdowns (§9.3) and clicks **Show chord**.
2. **All chord tones** across the neck light up (root emphasised; other tones coloured by function — 3rd, 5th, 7th, extensions — with a small interval label option, e.g. "R, 3, 5, ♭7").
3. The app computes **all playable voicings** in the current tuning (§11.1) and **highlights the best one** by default (in standard tuning, E major → the open shape 0-2-2-1-0-0, i.e. E B E G♯ B E).
4. **Choosing voicings:**
   - **Click any lit root note** → select the best voicing that has its root at that position (the lowest sounding root there, or containing that root note on that string).
   - **Prev / Next** buttons (and swipe on touch) step through the voicing list, sorted by neck position; a small list/grid of mini chord diagrams below lets the user jump directly.
   - Filters: "Root in bass only", "No muted inner strings", "Include open strings", "Max stretch", "Min strings sounding".
5. **Manual editing:** in the voicing, click any lit chord tone on a string to move that string's note there; click the active note again to mute the string; click the ✕/○ marker behind the nut to toggle mute/open. The chord name updates live using the identifier — if the edited shape becomes a different chord, show it ("now: E/G♯", "now: Esus4").
6. **Play** (strum, with a direction toggle and strum speed) and **Arpeggiate** buttons.
7. Voicing shown as a standard **chord diagram** too (vertical box with fret numbers, fingers optional) that can be copied/downloaded as an image — nice-to-have.

### 11.1 Voicing search algorithm (`voicings.ts`)
- For each string, candidate options = muted, or any fret 0…fretCount where the note is a chord tone.
- Depth-first search over the 6 strings with pruning:
  - fretted notes (fret > 0) must fit within `maxStretch` frets;
  - fingers needed ≤ 4 (detect barres: the lowest fret used by multiple strings, with no lower fret in between them, can be one finger);
  - at least `minStrings` sounding (default 3; 4 for 7th chords and larger);
  - all **required** tones present (root, 3rd or sus tone, 7th/6th, altered tones, and the highest extension); optional tones (5th, and lower extensions of 11/13 chords) may be omitted;
  - if the chord has a slash bass, the lowest sounding note must be that bass.
- **Score** (lower = better, weights configurable): stretch, number of fingers, muted strings (interior mutes cost more than edge mutes), neck position (lower slightly preferred), open strings (bonus), root in bass (bonus), doubled root/5th fine, doubled 3rd slight penalty, full chord (all tones present) bonus.
- Deduplicate, sort by position, and return. Must run in < 50 ms for 24 frets (memoise per `tuning + chord + rules`).

---

## 12. Open selection / identify mode (requirement 11)

- Toggle **Identify** mode. Clicking a fret position selects it (max **one note per string**; clicking another fret on the same string moves the selection; clicking the selected one deselects).
- Behind the nut on each string: a toggle cycling **– (unused) → ○ open → ✕ muted**.
- **Find chord** button → shows best name + alternatives (§9.4), the spelled notes, intervals from the root, and plays the chord (strum). Also auto-updates the name live as notes are toggled (the button then mainly plays it).
- **Send to Chord mode** button: loads the identified chord into the chord builder with this shape as the active voicing.
- **Clear** button.

---

## 13. UI layout

- **Top toolbar:** app name · Tuning dropdown · Save tuning · Frets (18–24 selector) · Guitar model · Sound preset · Volume slider + mute · Settings (gear).
- **Centre:** the neck (tuning pegs on the left), fret numbers underneath, legend under that.
- **Bottom panel with tabs:** Explore (chromatic) · Scales · Chords · Identify. On phones this becomes a pull-up drawer so the neck keeps maximum space.
- **Settings:** ♯/♭ preference, left-handed, even vs realistic fret spacing, unlimited tuning range, colour-blind palette, auto-strum on preset change, voicing rules, manage/export/import tunings.
- Dark theme by default with a light theme option; follow `prefers-color-scheme` initially.
- Persist all settings and the last-used tuning/fret count/preset.
- Touch targets ≥ 40 px; everything reachable by keyboard; visible focus states.

---

## 14. Build phases

Work in order. After each phase: run `npm run test` and `npm run build`, fix issues, commit with a clear message, and summarise what was done.

**Phase 0 — Scaffold.** Vite + React + TS strict, Zustand, Vitest, ESLint/Prettier, folder structure from §2, README with run instructions.
*Accept:* `npm run dev` shows a placeholder; tests run.

**Phase 1 — Theory core.** `notes.ts`, `tunings.ts` (all presets from §6), `fretboard.ts`, `scales.ts`, spelling.
*Accept:* tests pass, including: standard tuning string 6 frets 0–3 = E F F♯ G; Drop D string 6 fret 0 = D, fret 2 = E; F major spelled with B♭; G♯ harmonic minor contains F𝄪; every preset has 6 valid MIDI notes.

**Phase 2 — Static fretboard.** SVG neck, strings, frets, inlays, fret numbers, labels behind the nut and in each fret; fret count selector; responsive scaling; left-handed mirror; tuning dropdown switching presets.
*Accept:* 18 and 24 frets both fit the viewport; labels change correctly with presets; phone landscape looks right.

**Phase 3 — Audio engine.** AudioContext unlock, string worklet with fractional delay, all six presets, master volume/mute/limiter, tap-to-play notes, one-voice-per-string.
*Accept:* tapping plays the correct pitch (verify A string open = 110 Hz); presets sound clearly different; no clicks or clipping on fast repeated taps; works on iOS Safari after first tap.

**Phase 4 — Tuning pegs.** Drum-roller component, pluck on press, continuous glide while dragging, snap on release, sliding labels along the neck (§4), wheel + keyboard support, range limits, "Custom"/preset-match detection, save/manage/export/import tunings, animated preset transitions.
*Accept:* dragging the A peg down to F♯ glides audibly and the labels slide smoothly; release lands exactly on semitones; saved tunings appear under "My tunings" after reload.

**Phase 5 — Strumming.** Crossing detection, velocity from speed, direction, tap-vs-strum threshold, string wobble animation, muted strings silent.
*Accept:* a quick drag across all strings sounds like a strum in the right order both directions, on mouse and touch; muted strings in a voicing make no sound.

**Phase 6 — Scales & colour mode.** Scale panel, dim/hide out-of-scale notes, tonic highlight, overlay rings, rainbow degree colours + colour-blind palette, legend, scale playback with tempo/direction/range/position.
*Accept:* E minor pentatonic in standard tuning shows the familiar box at frets 0–3 and 12–15; colours match the degree rules; playback highlights in sync with sound.

**Phase 7 — Chord builder & voicings.** Chord formula builder with validation and naming, chord tone display, voicing search/scoring, root-click selection, prev/next list with mini diagrams, filters, manual editing with live renaming, play/arpeggiate.
*Accept (standard tuning unless stated):* E major default voicing = 0-2-2-1-0-0; C major includes x-3-2-0-1-0; A minor includes x-0-2-2-1-0; G7 includes 3-2-0-0-0-1; in Open G tuning, G major default = 0-0-0-0-0-0; search completes < 50 ms at 24 frets.

**Phase 8 — Identify mode.** Selection rules, open/mute toggles, identification with alternatives, play, send-to-chord-mode.
*Accept (tests):* x-3-2-0-1-0 → C; 0-2-2-1-0-0 → E; x-0-2-2-1-0 → Am; x-3-2-2-1-0 → C6 with Am7/C as an alternative; 0-2-2-1-0-0 with string 6 muted → E/B; x-x-0-2-3-2 → D; 3-x-0-0-0-x → G5 or G(no3); x-0-2-0-2-0 → A6 / F♯m7/A.

**Phase 9 — Guitar models.** Model data files and renderer per §4a (headstock, board, inlays, strings, body edge), customise options, "match sound to guitar" link, left-handed mirroring for every model.
*Accept:* switching model changes the look instantly without moving note markers or breaking hit-testing; every model works at 18 and 24 frets and in left-handed mode; no model resembles a specific manufacturer's design or carries a brand name.

**Phase 10 — Polish & deploy.** Settings persistence, themes, accessibility pass, performance (no dropped frames during peg drags on a mid-range phone), optional PWA, Dockerfile + compose + nginx config, deployment docs.
*Accept:* Lighthouse performance and accessibility ≥ 90; Docker image serves the app on port 8080.

---

## 15. Deployment

The app builds to static files (`npm run build` → `dist/`), so it can be hosted anywhere.

- **Local:** `npm install && npm run dev` (dev) or `npm run build && npm run preview`.
- **Vercel / Netlify:** connect the Git repo; build command `npm run build`, output `dist`. Both have free tiers for personal projects; no server-side code is needed.
- **Docker (Synology NAS):** multi-stage `Dockerfile` — `node:20-alpine` builds, `nginx:alpine` serves `dist/` with a small `nginx.conf` (gzip, long cache headers for hashed assets, SPA fallback to `index.html`). Include `docker-compose.yml` exposing port 8080 so it can be imported directly in Synology **Container Manager → Project**. Build for `linux/amd64` and `linux/arm64` (`docker buildx`) since Synology models vary.
- **Note:** AudioWorklets require a secure context. `localhost` is fine, but when opening the NAS-hosted app from another device via `http://<nas-ip>:8080`, audio worklets may be blocked. Document two fixes: use Synology's reverse proxy with HTTPS (DSM → Login Portal → Reverse Proxy, with a Let's Encrypt certificate), **or** provide a fallback in the audio engine that runs the string model with a `ScriptProcessorNode` when `audioWorklet` is unavailable. Implement the fallback.

---

## 16. Quality bar and conventions

- The theory engine has no dependency on React or audio; >90 % test coverage there.
- No hard-coded note names in components — always go through the spelling functions.
- All timing of musical events uses the AudioContext clock.
- Keep 60 fps during peg drags: update only the dragged string's labels; memoise the rest.
- Keep sound preset and scale/chord definitions as data files so they're easy to extend.
- Write a short `ARCHITECTURE.md` at the end describing the modules and how to add a sample-based instrument.
