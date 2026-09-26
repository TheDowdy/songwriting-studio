# Songwriting App: Build Plan

> **For the implementing agent.** Work one phase at a time. At the end of each phase: run every
> check listed for it, commit, then **stop** and report to the owner (what changed, how to test it
> by hand, anything uncertain). Do not start the next phase until told to. Do not create a GitHub
> repository, push, or touch the two source repos' remotes. The owner will do that.
>
> Working title: **Songwriting App** (folder `songwriting-app`). Keep the display name in one
> constant (`APP_NAME` in `apps/web/src/shell/appInfo.ts`) so it can be renamed later.

---

## 1. What we are building

Two existing apps become **modules of one songwriting app**. More modules will be added over
time (lyrics, piano voicings, recording ideas…), so the structure must make adding a module a
local change.

- **Progression Builder** (source: `../chord-progression-app`, branch `main`): React 19, TS 7,
  Tailwind 4, Zustand 5, Tone.js 15, `tonal`, dnd-kit, VexFlow, @tonejs/midi. Builds chord
  progressions with key-aware suggestions, sections, arrangement, playback, JSON/MIDI export and
  sheet music.
- **Fluid Frets** (source: `../Alternate tuning explorer app`, branch `main`): React 18, TS 5.9,
  plain CSS, Zustand 5 with `persist`, its own theory engine with no dependencies, a
  physical-model string synth (AudioWorklet), Playwright browser checks. Shows notes on a guitar
  neck in any tuning, scales, a rich chord builder with voicing search, and chord identification.

### Owner's requirements (decided, do not re-ask)

1. One monorepo, one app, built from modules. Keep git history from both repos.
2. From a progression the user chooses **Explore guitar voicings** and lands in the guitar module
   with the same song open. It is the same song in the same store, not a copy.
3. Clicking a chord in the progression shows only that chord's notes on the neck. Roots are
   emphasised and every other note is hidden.
4. Tapping a root on the neck shows a **recommended voicing**. The user can override it by
   picking another voicing or editing notes by hand.
5. Inversions can be chosen in the guitar module even if the progression didn't use them.
6. The user can **commit** a voicing to a chord. That chord's block then shows a small chord
   diagram, **in both modules**: voicings flow back to the progression module.
7. **Do not assign finger numbers.** A diagram shows dots, open (○) and muted (✕) markers, barres
   and the fret position. If a shape is hard to play, the user edits it or picks a different
   chord flavour.
8. The progression can be developed inside the guitar module: change flavour using the **full
   rich chord vocabulary** (6, 6/9, 9, 11, 13, alterations, added tones, omit, power chords),
   replace chords, add, remove and reorder them.
9. **Variants:** copy a section and re-voice it (for example "up the neck"). Variants are plain
   copies and do not follow later edits to the original.
10. **One tuning per song, plus a capo.** When the tuning or capo changes, committed voicings are
    flagged, not deleted, and the app helps find new ones.
11. Piano voicings are a later, separate module. Leave room for it but don't build it.

---

## 2. Target architecture

```
songwriting-app/
  package.json              npm workspaces: ["packages/*", "modules/*", "apps/*"]
  tsconfig.base.json
  PLAN.md  ARCHITECTURE.md  CLAUDE.md  README.md
  apps/
    web/                    the only Vite app: shell, router, module registry, song library
  packages/
    core/                   pure TS, no React/DOM/audio: theory, song model, operations, schema
    song-store/             vanilla Zustand store for the song library + current song (React-free)
    audio/                  one shared AudioContext + unlock; Tone.js bound to it
    ui/                     design tokens (CSS), shared React components (ChordDiagram, Button…)
  modules/
    progression/            the Progression Builder UI (was chord-progression-app/src)
    guitar/                 the Fluid Frets UI (was Alternate tuning explorer app/src)
  legacy/                   (Phase 0 only; deleted by the end of Phase 2)
```

Package names use the scope `@sw/`: `@sw/core`, `@sw/song-store`, `@sw/audio`, `@sw/ui`,
`@sw/module-progression`, `@sw/module-guitar`, `@sw/web`. Workspaces link them. Packages are
consumed **as TypeScript source** (`"exports": { ".": "./src/index.ts" }`, with sub-path exports
where useful). There is no per-package build step, and Vite and Vitest compile them.

### Dependency rules (enforce with an ESLint `no-restricted-imports` rule or a test)

- `core` depends on nothing but `tonal`.
- `song-store` depends on `core` (and `zustand`).
- `audio` depends on `tone` only.
- `ui` depends on `core` and React.
- A module may depend on `core`, `song-store`, `audio` and `ui`. **A module never imports another
  module.** It moves between modules only through the shell's `navigate()` (see §4).
- `apps/web` imports modules only through their `index.ts` (their `ModuleDefinition`).

### Stack decisions

- **React 19** everywhere (upgrade the guitar code; fix any typing fallout).
- **TypeScript:** use PB's `typescript@^7` for `tsc -b`. If `typescript-eslint` doesn't work with
  TS 7, keep ESLint to non-type-aware rules. Don't downgrade TS to satisfy the linter. Say what
  you did in the phase report.
- **Vitest 5** at the root, with one `vitest.workspace`/`projects` config covering every package.
  Environment `node` unless a test needs `jsdom` (PB's `NodeMap.test.tsx` does; keep whatever it
  uses now).
- **Tailwind 4** is used by the shell and the progression module. The guitar module keeps its own
  plain CSS (see §6 for scoping). Don't convert the guitar CSS to Tailwind.
- **Routing:** hash-based, so the app works from any path, a NAS, or `file://`-style static
  hosting with `base: './'`. Use `wouter` with `useHashLocation`, the only new runtime
  dependency allowed without asking.
- Keep Prettier (the FF config) and apply it to new files. Don't reformat moved legacy files wholesale in
  the same commit as a move (history readability): formatting-only commits are fine separately.

---

## 3. Data model (`packages/core`)

### 3.1 Chords

Keep PB's `ChordRef` as the progression's chord identity (the suggestion engine, numerals and
key changes depend on it) and **add an optional `colour`** for the extras only the rich
vocabulary can express:

```ts
export interface ChordColour {
  /** 6 or 6/9 in place of a 7th. Only with flavor 'triad'. */
  sixth?: '6' | '6/9';
  /** 9 / 11 / 13 stacked on the 7th. Only with flavor '7'. */
  extension?: '9' | '11' | '13';
  alterations?: Array<'b5' | '#5' | 'b9' | '#9' | '#11' | 'b13'>;
  /** add11 / add13. add9 stays a flavor ('add9'). */
  added?: Array<'add11' | 'add13'>;
  omit3?: boolean; // flavor 'triad' + quality 'maj' + omit3 (only) = power chord, named "C5"
  omit5?: boolean;
}

export interface ChordRef {
  root: string; quality: Quality; seventh: Seventh; flavor: Flavor;
  bass?: string; numeral: string; origin: Origin;
  colour?: ChordColour;   // absent = plain PB chord; every existing song stays valid
}
```

Single sources of truth in core, which **every** consumer (PB playback, MIDI, sheet music, piano
diagram, guitar display, voicing search) must use:

- `chordTones(chord): string[]`: spelled tones including colour (replaces direct `chordStack`
  use outside theory).
- `chordName(chord)`: includes colour, e.g. `C7♯9`, `Am7(no5)`, `F6/9`, `D5`, `G13/B`.
- `chordNumeral(chord, key)`: the base numeral plus a compact colour suffix (`V9`, `I6`, `V7♯9`).
  Keep `numeral` stored on `ChordRef` as now, and recompute it through `relabel` when colour changes.
- `toChordSpec(chord): ChordSpec` and `fromChordSpec(spec, key): ChordRef` convert to and from
  the guitar engine's model. Mapping:

| PB `ChordRef` | FF `ChordSpec` |
|---|---|
| quality maj / min / dim / aug (flavor triad) | quality major / minor / dim / aug, seventh none |
| flavor sus2 / sus4 | quality sus2 / sus4 (the PB `quality` is kept for function; FF ignores it) |
| flavor add9 | `added: ['add9']` |
| flavor 7 + seventh maj7 | quality major, seventh maj7 |
| 7 + dom7 | major, 7 |
| 7 + min7 | minor, 7 |
| 7 + minMaj7 | minor, maj7 |
| 7 + m7b5 | dim, 7 (FF names it m7♭5) |
| 7 + dim7 | dim, dim7 |
| 7 + augMaj7 / aug7 | aug, maj7 / aug, 7 |
| colour.sixth | seventh 6 or 6/9 |
| colour.extension / alterations / added / omit3 / omit5 | same fields |
| triad + maj + colour.omit3 (nothing else) | quality power |
| bass | bassPc |

`fromChordSpec` spells the root and bass **for the key** (add `spellInKey(pc, key)`: prefer the
spelling whose letter matches a scale degree, then the key signature's accidental direction),
derives quality/seventh/flavor/colour, then calls `relabel` for numeral and origin.

**Tests required** (these are the safety net for the whole project):
- For every PB chord (all roots × qualities × sevenths × flavors × inversions), the pitch
  classes of `describeChord(toChordSpec(c))` equal `chordTones(c)`.
- `fromChordSpec(toChordSpec(c), key)` gives back `c`, same `chordKey`.
- For a generated sample of every **valid** FF spec (`validateChord` returns null),
  `toChordSpec(fromChordSpec(s))` has the same pitch classes and bass as `s`.
- `chordName` agrees with FF's `chordSuffix` for colour chords.

PB's `withFlavor` must drop any colour that becomes invalid (check with FF `validateChord` on
`toChordSpec`), keeping what is still valid. Add `withColour(chord, patch, key)`.

### 3.2 Song, events, attachments, module data

```ts
export interface GuitarVoicing {
  /** Per string, low→high: fret counted from the capo (0 = capo/open), null = muted. */
  frets: (number | null)[];
  /** Snapshot of the song's guitar setup when committed; used to detect staleness. */
  tuning: number[];   // open-string MIDI, low→high, without capo
  capo: number;
  source: 'recommended' | 'picked' | 'edited';
}

export interface ChordAttachments {
  guitar?: GuitarVoicing;
  // piano?: PianoVoicing  ← future module adds its own key here
}

export interface ChordEvent { id: string; chord: ChordRef; beats: number; attachments?: ChordAttachments }

export interface Section {
  id: string; name: string; events: ChordEvent[]; repeat: number;
  variantOf?: string;     // id of the section it was copied from
  variantLabel?: string;  // e.g. "Up the neck (5+)"
}

export interface GuitarSetup { tuning: number[]; tuningName?: string; capo: number }

export interface Song {
  schemaVersion: 2;
  id: string; title: string; key: Key; timeSig: TimeSig; bpm: number;
  instrument: InstrumentId; pattern: PatternId;
  sections: Section[]; arrangement: string[]; updatedAt: number;
  guitar: GuitarSetup;                        // default: standard tuning, capo 0
  /** Free space for modules that need song-level data. Keyed by module id; each module
   *  owns and sanitises its own entry. Unknown keys are preserved untouched. */
  moduleData?: Record<string, unknown>;
}
```

- `migrateSong(raw: unknown): Song | null` upgrades v1 (PB's current songs, which have no
  `schemaVersion`) to v2 and sanitises everything, as FF does: storage and imports are
  untrusted. It is used by storage load and JSON import. Unit-test v1 fixtures.
- Voicing status is **computed, never stored**:
  `voicingStatus(event, song): 'none' | 'ok' | 'chord-changed' | 'tuning-changed'`.
  - `tuning-changed`: the voicing's `tuning`/`capo` differ from `song.guitar`.
  - `chord-changed`: the sounding pitch classes (tuning + capo + frets) include a non-chord tone,
    miss a **required** chord tone (use FF `resolveTones(...).required`), or the lowest note ≠
    `chord.bass ?? chord.root`.
- Song operations move from PB's `store.ts` into core as **pure functions**
  (`addChord(song, sectionId, afterEventId, chord) → { song, eventId }`, `duplicateSection`,
  `setEventChord`, `commitVoicing`, `clearVoicing`, `makeVariant`, …). Stores become thin
  wrappers. Existing PB state tests move with them and must keep passing.
- Copy operations (`duplicateEvent`, `duplicateSection`, `makeVariant`) deep-copy attachments.
  `changeKey` with transpose **clears guitar attachments** of transposed events (they no longer
  fit), and the UI says so in its confirmation.

### 3.3 Hand-off and export

Both modules share one store, so there is no URL hand-off. JSON export/import (PB's File menu) now
includes attachments, the guitar setup and moduleData, all through `migrateSong`.

---

## 4. The shell and the module contract (`apps/web`)

```ts
// apps/web/src/shell/modules.ts
export interface ModuleDefinition {
  id: string;                 // 'progression', 'guitar'
  title: string;              // tab label
  icon: ReactNode;            // small inline SVG
  /** 'song': needs an open song (route #/song/:songId/<id>); 'tool': also works without one (#/tools/<id>). */
  scope: 'song' | 'song-or-tool';
  Component: ComponentType<ModuleProps>;
  /** Called when the user leaves the module: stop audio, cancel gestures. */
  onDeactivate?: () => void;
}
export interface ModuleProps {
  songId: string | null;              // null when opened as a tool
  focus: { eventId?: string; sectionId?: string };  // from the URL query
  navigate: (to: { module: string; songId?: string | null; eventId?: string }) => void;
}
export const MODULES: ModuleDefinition[] = [progressionModule, guitarModule];
```

Adding a module = one folder in `modules/` + one line in `MODULES`. Write this down in
ARCHITECTURE.md ("How to add a module") with a minimal example.

Routes:
- `#/`: **Library**: song list (from PB's File menu logic), New song, Import JSON, and a
  "Tools" row (the guitar module as a stand-alone fretboard explorer).
- `#/song/:songId/:moduleId?event=<id>`: the shell header (song title, module tabs, theme
  toggle, settings) plus the module. The last module used per song is remembered.
- `#/tools/:moduleId`: a module without a song.

The header is compact: the guitar neck needs vertical room, especially on phones in landscape.

---

## 5. Audio (`packages/audio`)

- One `AudioContext` for the whole app. Create it through Tone (`Tone.getContext()`), and expose
  `getAudioContext()`, `unlockAudio()` (calls `Tone.start()` + resume) and `onUnlock(cb)`.
- Change FF's `AudioEngine` to **use the shared context** instead of creating its own (inject it;
  keep `createMasterBus`). The worklet is added once to that context. Keep FF's ScriptProcessor
  fallback.
- One "Tap to enable sound" banner, in the shell (reuse FF's `AudioBanner` behaviour).
- On module switch the shell calls the leaving module's `onDeactivate` (stop transport, stop
  strums/scale playback).
- The master volume/mute for the whole app lives in the shell settings. Each module keeps its own
  instrument-level settings.

---

## 6. Styling

- `packages/ui/tokens.css` holds the shared tokens, taken from PB's palette (sage paper + ink,
  light-first, dark theme), and one theme switch: `data-theme` on `<html>`, set by the shell
  (setting: system/light/dark). Both modules follow it. Replace PB's and FF's separate theme
  toggles and FF's `theme-init.js`, keeping the "no flash before first paint" behaviour.
- **FF and PB use the same custom property names on `:root`** (`--bg`, `--fg`, `--muted`,
  `--line`, `--accent`…) with different meanings. Scope every FF rule and token under
  `.mod-guitar` (the module's root element), and rename clashing FF tokens with a `--ff-` prefix
  where they must differ. FF's `body`/`:root` rules move into the module root or the shell. The
  guitar neck's realistic wood and skins stay exactly as they are. FF panels should map their
  surface/text colours onto the shared tokens so the app looks like one product.
- Tailwind's preflight will change FF's buttons/inputs. Check every FF panel visually in both
  themes and fix any regressions (the `check:a11y` and screenshot checks help).

---

## 7. Phases

Each phase ends with: all unit tests green (`npm test` at the root), `npm run typecheck`,
`npm run lint`, `npm run build`, the listed browser checks, **a commit** (message ends with
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`), and a report to the owner containing a
**"How to test"** list of concrete clicks.

### Phase 0: Monorepo with both histories (no behaviour change)

1. `git init` in `songwriting-app` (this PLAN.md becomes part of the first commit).
2. Import both repos **with history** using
   `git subtree add --prefix=legacy/progression-builder ../chord-progression-app main` and
   `--prefix=legacy/fluid-frets "../Alternate tuning explorer app" main`. Use no `--squash`.
3. Root `package.json` with workspaces; each legacy app becomes a workspace and runs as before:
   `npm run dev:pb`, `npm run dev:ff`, `npm test` runs both suites.
4. Upgrade FF to React 19 and the shared TS/Vitest versions. Fix fallout.
5. Remove committed build output (`dist/`, `coverage/`, `.shots/`, `tsconfig.tsbuildinfo`) from the tree and
   add a root `.gitignore`.

**Done when:** both apps run from the monorepo and behave exactly as before; all ~125 PB tests and
all FF tests pass; FF browser checks `check:app` and `check:chords` pass against `dev:ff`.

### Phase 1: `packages/core` + `packages/song-store`

1. Move PB `src/theory`, `src/types.ts`, `src/state/song.ts` and the pure parts of `store.ts`
   into `core`. Move FF `src/theory` into `core/src/fret/` (keep its tests; FF tests live in
   `tests/`, so move them next to the code or into `core/tests`).
2. Add `colour`, `chordTones`, `chordName` with colour, the converters, `spellInKey`, schema v2,
   `migrateSong`, `voicingStatus`, attachments, `GuitarSetup`, the pure song operations (§3).
   Write all tests from §3.1 and §3.2.
3. `song-store`: a vanilla Zustand store (`createStore`) holding `library` (id → Song),
   `currentSongId`, and the operations, with debounced autosave to `localStorage` under
   `sw:songs` / `sw:currentId`. On first run, if `sw:songs` is absent, import legacy PB songs from
   `chordbuilder:songs`/`chordbuilder:currentId` through `migrateSong` (same origin on
   `localhost:5173` during development). Export a React hook `useSong(selector)` from a small
   `react.ts` entry so the store core stays React-free.
4. Point both legacy apps at `@sw/core` and `@sw/song-store` (PB's `useStore` keeps only UI
   state: selection, playback, replace target…).

**Done when:** both apps still behave the same; the new core tests pass; a PB song saved before
the change opens after it.

### Phase 2: One app: shell, modules, shared audio and styling

1. Create `apps/web` (Vite, `base: './'`, React 19, Tailwind, wouter hash routing) with the
   Library, header and module contract (§4).
2. Move `legacy/progression-builder/src` UI into `modules/progression` and
   `legacy/fluid-frets/src` UI into `modules/guitar`, each exporting a `ModuleDefinition`. Move
   PB `public/samples` and FF `public/*` (icons, manifest, sw.js) into `apps/web/public`. Delete
   `legacy/` (history stays reachable through git).
3. `packages/audio` with the shared context (§5), and the shared tokens/theme (§6).
4. The guitar module works as a **tool** (`#/tools/guitar`), exactly as Fluid Frets does today,
   including persisted settings (keep its `persist` store and storage key; import the legacy key
   `fluid-frets-settings` on first run).
5. Port the FF Playwright checks to the new URL (`#/tools/guitar`) and keep them passing; update
   `check:deploy` for the single app. Add `check:shell`: open the library, create a song, switch
   modules, and confirm audio starts after one tap in either module.
6. Keep FF's deployment files (Dockerfile, docker-compose, netlify.toml, vercel.json) working for
   the single app, with the CSP unchanged unless Tone needs something (document any change).

**Done when:** one `npm run dev` serves the whole app; the progression module is fully functional
inside a song; the guitar tool is fully functional; switching modules stops audio from the other;
no style bleed in either theme (check each FF panel and each PB view by screenshot).

### Phase 3: Guitar module in song context: progression strip and chord focus

1. The progression module gets an **Explore guitar voicings** button (in the timeline header, and
   in the chord detail panel for the selected chord) → `navigate({ module: 'guitar', eventId })`.
2. In song context the guitar module shows a **progression strip** above the bottom panel:
   sections in arrangement order, chord blocks (name, numeral, origin tint as in PB), the
   selected block highlighted. Keep it horizontally scrollable, touch-friendly and compact.
3. Selecting a block sets the chord panel to that chord (`toChordSpec`) in a new **Progression
   chord** mode of the Chords tab: only chord tones are shown (`hideOthers` forced on), roots get
   a bigger marker with a stronger ring, and interval/colour display settings still apply. The
   existing free chord builder remains available when not in song context.
4. The **song's tuning and capo drive the neck** in song context. Tuning pegs and the presets edit
   `song.guitar.tuning` (via the song store), not the tool's persisted tuning. Add a **capo**
   control (0–12) that draws a capo bar across the neck and dims the frets behind it. With a capo,
   the voicing search runs on `tuning + capo` with `fretCount − capo` frets, and fret numbers in
   diagrams are relative to the capo, with a "Capo N" label. Tool mode gets the capo too (its own
   persisted value).
5. Strum/arpeggio buttons play the focused chord's current shape.

**Done when:** from a progression in PB, one click lands in the guitar module with the same chord
selected; clicking each block shows exactly its tones (check a 7th, a sus4, an inversion and a
borrowed chord); capo and tuning changes redraw correctly. Unit-test the capo maths.

### Phase 4: Recommended voicing, overrides, inversions, commit

1. Tapping a lit root selects the recommended voicing with that root on that string (FF's existing
   `bestVoicingWith`). Before any tap, the chord shows its overall best voicing, or its committed
   voicing if it has one.
2. Overrides: the existing voicing strip (prev/next, list), hand-editing notes (existing edit
   mode), all as in FF today.
3. **Bass / inversion control:** `Root | 1st | 2nd | 3rd (7th chords) | Any bass`. It filters the
   search (`bassPc`). Choosing an inversion or committing a voicing whose lowest note isn't the root
   **updates the progression chord** (`withInversion` / `bass`), so the numeral shows the
   inversion in both modules. "Any bass" shows everything and commits whatever bass the chosen
   shape has.
4. **Use this voicing** commits `attachments.guitar` (`source` = recommended / picked / edited).
   **Remove voicing** clears it. Committed blocks in the strip show a mini `ChordDiagram` (move FF's
   `ChordDiagram` into `@sw/ui`; add a `size="mini"` variant that stays readable at about 44 px wide
   and a capo label).
5. A stale voicing (§3.2) shows a small warning badge on its block and in the panel, with the
   reason and a **Re-fit** action: the best valid voicing nearest the old one (minimise the sum
   of per-string fret distance, then score). Put this in core as `nearestVoicing()`, with tests.

**Done when:** commit a voicing for every chord of a four-chord progression, reload, and they are
still there; change a chord's flavour in PB and see the badge; Re-fit fixes it near the same
position.

### Phase 5: Voicings and rich chords flow back to the progression module

1. PB timeline blocks show the mini diagram for committed voicings (with the stale badge).
2. PB chord detail → Guitar tab shows the committed voicing when there is one (labelled
   "Your voicing"), otherwise the existing generated shape (labelled as now), plus a button to
   open it in the guitar module.
3. PB playback with the guitar instrument plays the **committed voicing's actual notes** (tuning +
   capo + frets, strummed low→high using the current pattern). Other instruments and uncommitted
   chords keep using `voiceLeadChord`. MIDI export does the same for guitar.
4. Every PB view uses `chordName`/`chordTones`/`chordNumeral` so rich chords made in the guitar
   module display, play, export and appear in sheet music correctly. PB's FlavorPicker gets a
   **More…** entry opening the rich options (the same chip UI as FF's builder, disabled options
   greyed with a reason via `validateChord`). Put the shared chip component in `@sw/ui`.

**Done when:** a song edited in the guitar module shows its diagrams and rich chord names in the
progression module, plays those exact notes on guitar, and the MIDI file contains them.

### Phase 6: Developing the progression inside the guitar module

1. Strip actions on the selected block: **Flavour** (the rich builder, applied with
   `fromChordSpec`), **Inversion**, **Replace** (ranked chips from core `suggestNext(previous
   chord)` plus the key's diatonic chords, plus "Build any chord…"), **Duplicate**, **Remove**,
   **Beats ±**. Add chord after the selected one (the same suggestion chips). Drag to reorder
   (reuse dnd-kit and PB's touch hold delay). Section add/rename/duplicate. The arrangement
   stays editable only in the progression module.
2. **Playback in the guitar module:** play the section or song with the FF synth: committed voicings
   strummed (uncommitted chords use their best voicing and are marked so), tempo from the song,
   loop, and the neck highlighting the sounding shape in sync (FF's `SequencePlayer` reports what
   is heard). Put the timing (events → beat offsets, loop bounds) in core so both modules
   share it.

**Done when:** starting from an empty song you can build, voice and play a progression without
leaving the guitar module, and the result is identical in the progression module.

### Phase 7: Tuning/capo changes and the re-voicing assistant

1. Changing the song's tuning or capo when voicings are committed asks first: "N chords have
   voicings for the old tuning. They'll be kept and flagged." (with Cancel).
2. A **Re-voice** panel lists the flagged chords. For each: the old shape (for reference), plus
   the top 3 candidates in the new setup ranked by (a) how close they sit to the old position,
   (b) score, (c) similar string set. One tap commits a candidate. **Re-voice all** applies the
   smoothest set across the section (reuse the Phase 8 optimiser if it exists; otherwise per-chord
   best) and can be undone.
3. An undo for the last guitar change (single level is enough) in the guitar module.

**Done when:** switch a voiced song from standard to DADGAD, every chord is flagged, and Re-voice
all gives playable, valid voicings.

### Phase 8: Variants

1. **Make variant** on a section (both modules): choose a generator, preview the diagrams, then
   create. It creates a copy (new ids, `variantOf`, `variantLabel`) inserted after the source in
   the arrangement.
2. Generators, as pure functions in core over the section's chords:
   - **Up the neck from fret N** (default 5): every voicing's position within [N, N+4] where possible.
   - **Open position**: position ≤ 3, open strings favoured.
   - **Smoothest movement**: minimal hand movement across the sequence.
   - **Stay in one position**: all shapes inside a 5-fret window the user picks.
   Implement as a Viterbi/DP over each chord's top-K (K≈40) candidate voicings: cost = voicing
   score + λ × movement from the previous shape (sum of per-string fret deltas, muted strings
   penalised) + window penalty. Tests: results are valid voicings; the window is respected;
   "smoothest" never costs more than per-chord-best.
3. Variant sections show their label and a link to the source section. There is no syncing.

**Done when:** "Up the neck from 7" on a verse creates "Verse (up the neck 7+)" whose diagrams all
sit at 7+, and it plays in the arrangement.

### Phase 9: Polish, docs, deploy

- ARCHITECTURE.md (layers, dependency rules, module contract, "How to add a module", data model,
  schema migrations). CLAUDE.md with commands and conventions. README with run/deploy.
- Service worker: cache the app shell eagerly and the guitar samples lazily (runtime cache).
- `check:a11y` across the library, both modules and both themes; `check:perf` with the neck in
  song context; `check:deploy` for the single app under a sub-path with the CSP.
- A migration test that loads real-shaped v1 songs and FF settings from both legacy keys.

---

## 8. Working rules for the implementing agent

- Match the surrounding code's style: FF's doc-comment density and `§` references, PB's concise
  comments. Pure logic goes in `core` with unit tests; components stay declarative.
- Never hard-code note names in components: use the spelling functions.
- Treat everything read from storage or imported as untrusted: sanitise.
- Keep every phase shippable. If a phase turns out bigger than expected, stop at a coherent point
  and report rather than leave things half-done.
- If a requirement here conflicts with what the code makes sensible, pick the option closest to
  the owner's intent, note it under "Decisions I made" in the report, and continue.
- Don't delete or rewrite the two source repos (`../chord-progression-app`,
  `../Alternate tuning explorer app`). Only read from them.
- Don't add runtime dependencies beyond `wouter` without asking.
