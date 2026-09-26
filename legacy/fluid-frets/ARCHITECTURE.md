# Fluid Frets architecture

Fluid Frets is a client-only single-page app: **Vite + React 18 + TypeScript (strict) + Zustand**, the
fretboard drawn in **SVG**, sound made by a **physical-model string synth** on the Web Audio API.
There is no backend. This document says where things live and how to extend them.

```
src/
  theory/       pure TypeScript — notes, tunings, scales, chords, voicings, identification, strumming
  audio/        the sound engine and the Instrument interface (synth now, samples possible later)
  state/        the Zustand store, and the actions that combine store + audio
  hooks/        small React hooks that turn state into what components draw
  components/   Fretboard/ (the SVG neck), Panels/ (Scales, Chords, Identify), Toolbar/, TuningPeg/
tests/          Vitest unit tests (mostly src/theory)
scripts/        browser checks (Playwright driving Chrome) — see "Testing"
docker/, Dockerfile, docker-compose.yml, netlify.toml, vercel.json   deployment
public/         manifest, icons, service worker, theme-init.js
```

## Layers and the rules between them

1. **`src/theory/` depends on nothing** — no React, no audio, no DOM. Everything musical is decided
   here and unit-tested (over 90 % coverage of this folder). Components never hard-code a note name:
   they go through the spelling functions (`chromaticSpelling`, `scaleSpelling`, `describeChord`…).
2. **`src/audio/`** knows nothing of React or the store. It exposes `audioEngine` (a singleton) and
   the `Instrument` interface.
3. **`src/state/`** is the only place that combines the two: the store holds settings and
   transient state, and the `*Actions.ts` / `playing.ts` files turn a user intent ("tap this fret",
   "strum", "send to chord mode") into store updates plus sound.
4. **`src/hooks/` and `src/components/`** read the store and draw. Long-lived listeners and timers
   sit in hooks; components stay declarative.

## The important modules

**Theory** — `notes.ts` (MIDI ↔ pitch class ↔ spelled names), `tunings.ts` (presets, range limits),
`scales.ts` (data-driven scale definitions), `chords.ts` (formula builder: `ChordSpec` →
`resolveTones` → spelling → name, plus `validateChord`), `voicings.ts` (depth-first search with
pruning + scoring; weights in `DEFAULT_WEIGHTS`), `identify.ts` (a template library *generated from
the chord builder*, so it recognises everything the builder can make), `strum.ts` (gesture maths),
`scalePlayback.ts` (fingering of a scale run), `overlays.ts`, `scaleColors.ts`.

**Audio** — `engine.ts` owns the `AudioContext`, master gain and limiter, and unlocks on the first
gesture. `synth/stringDsp.ts` is the pure Karplus–Strong string bank (runs in Node for tests);
`synth/string-worklet.ts` wraps it as an AudioWorklet, and `SynthInstrument.ts` falls back to a
`ScriptProcessorNode` running the same bank where AudioWorklet is missing (plain-http pages).
`synth/presets.ts` holds the six sounds as data; `effects.ts` builds each preset's EQ / drive /
cab / reverb chain. `scheduler.ts` plays note sequences on the audio clock (lookahead) and reports
each note when it is *heard*, which is what keeps highlights in sync with sound.

**State** — `store.ts` is the single Zustand store. Persisted: tuning, saved tunings, settings,
mode, scale/chord/voicing settings, guitar model, theme. Everything read from storage is sanitised
(`sanitize*` functions) because storage is untrusted. Two pieces of state deserve a note:
`tuning` is the committed tuning (whole semitones) while `liveTuning` is the *drawn* pitch of each
string (fractional during a peg drag or preset slide); a note's marker sits at fret = midi − live
pitch, which is why labels slide smoothly.

**Rendering** — `Fretboard.tsx` composes `Neck` (headstock, board, body), `Inlays`, `Frets`,
`Strings`, `NoteMarkers`, and the pegs. Layout maths is in `geometry.ts` (viewBox units; the SVG
scales to its container). Left-handed mode flips the *graphics* group; text is placed with mirrored
coordinates so it never appears mirrored. `NoteMarkers` styles each marker from a `DisplayModel`
(`hooks/useScaleView`, `useChordView`, `useIdentifyView`) — one per pitch class — so a peg drag
re-renders only the dragged string.

**Input** — `useStrumGestures` (pointer: tap vs strum, per-string crossing), `useFretKeyboard`
(keyboard cursor over the neck), `TuningPeg` (drag / wheel / arrows), and `state/tap.ts`, which
decides what a tap means in the current tab.

## Adding things

**A sound preset** — add an entry to `SOUND_PRESETS` in `audio/synth/presets.ts` (string voicing,
EQ filters, optional drive/cab/reverb) and its id to `SoundPresetId` in `audio/instrument.ts`.
`check:audio` renders every preset offline and checks pitch, level and clipping.

**A guitar model** — add an object to `GUITAR_MODELS` in `components/Fretboard/guitarSkins.ts`: a
headstock outline (drawn in a 150 × 224 box, nut on the right), a body edge (a box whose left edge
is the last fret wire), wood, inlay style, strings, default sound and fret count. No component
changes. Keep it an original design; a test rejects brand names.

**A scale or tuning preset** — add to `SCALES` (`theory/scales.ts`) or the preset groups
(`theory/tunings.ts`); the UI lists them automatically.

**A chord option** — extend the types and `resolveTones` / `validateChord` / `chordSuffix` in
`theory/chords.ts`; identification and voicings pick it up because they are built on those.

### Adding a sample-based instrument

The UI talks to sound only through the `Instrument` interface (`audio/instrument.ts`):

```ts
interface Instrument {
  pluck(string: number, midi: number, opts?: PluckOptions): VoiceHandle;
  setPitch(voice: VoiceHandle, midi: number, rampMs?: number): void; // legato glide while a peg turns
  damp(voice: VoiceHandle, when?: number): void;
  setPreset(id: SoundPresetId): void;
}
```

To add samples:

1. Write `audio/samples/SampleInstrument.ts` implementing `Instrument`. Load per-string multisamples
   (say every third fret) into `AudioBuffer`s; on `pluck`, pick the nearest sample and play it through
   an `AudioBufferSourceNode` with `playbackRate = 2 ** ((midi − sampleMidi) / 12)`, scheduled at
   `opts.when`, with gain from `opts.velocity`. Keep one voice per string: fade out the previous
   voice on the same string (that is how a real guitar behaves, and `VoiceHandle.string` gives you it).
2. `setPitch` ramps the source's `playbackRate.linearRampToValueAtTime` to the new pitch over
   `rampMs`; `damp` ramps its gain to zero (at `when`).
3. Route its output into the same destination the synth uses (`engine.ts` passes the master bus and
   the per-preset effect chain), so volume, mute, limiter and effects still apply.
4. Construct it in `AudioEngine.create()` in place of (or chosen alongside) `SynthInstrument`, and
   expose the choice as a setting if both should exist. Nothing else in the app needs to change:
   `audioEngine.pluck`, `pluckMany`, `setPitch` and `damp` already forward to whichever instrument
   is active, and `SequencePlayer` schedules against the audio clock regardless.
5. Add a check like `scripts/audio-check.mjs` that renders it offline and verifies pitch and level.

## Testing

`npm test` runs the Vitest unit tests. The browser checks drive real Chrome with `playwright-core`
against the dev server (port 5199) or a production build (port 5198, add `?debug` to the URL, which
exposes `window.__fluidfrets = { audioEngine, store }`): `check:app`, `check:pegs`, `check:strum`,
`check:scales`, `check:chords`, `check:identify`, `check:guitars`, `check:fallback`, `check:a11y`
(axe-core + keyboard), `check:perf` (frame times under CPU throttling), and `check:deploy` (the built
app served from a sub-path with the production security headers, offline via the service worker).

## Performance notes

- A peg drag updates only the dragged string's markers (each string selects its own live pitch and
  the marker components are memoised); the tuning animation is `requestAnimationFrame`-driven state,
  not a library. `check:perf` holds 60 fps under a 6× CPU slowdown.
- Voicing search takes a few milliseconds even for 13th chords at 24 frets and is memoised per
  tuning + chord + rules; the voicing strip renders its diagrams lazily.
- Stroke/wobble/pulse feedback is driven imperatively (`pluckEvents.ts`) so a strum doesn't cost
  six React renders per frame.
