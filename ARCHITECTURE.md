# Architecture

Songwriting Studio is a monorepo of small TypeScript packages consumed as source (no per-package
build step — Vite and Vitest compile everything), assembled into one app by a thin shell.

```
songwriting-studio/
  apps/web/            the only Vite app: shell, router, module registry, song library
  packages/
    core/               pure TS, no React/DOM/audio: theory, song model, operations, schema
    song-store/         vanilla Zustand store for the song library + current song (React-free)
    audio/               one shared AudioContext + unlock, bound to Tone.js
    ui/                  design tokens (CSS) + shared React components (ChordDiagram, ChordBuilder…)
  modules/
    progression/         the chord-progression builder UI
    guitar/               the guitar fretboard/voicing UI
```

Package names use the scope `@sw/` (`@sw/core`, `@sw/song-store`, `@sw/audio`, `@sw/ui`, `@sw/timeline`). Modules
are plain workspaces too but are not published packages — they're only ever imported by
`apps/web`.

## Dependency rules

- `core` depends on nothing but `tonal`.
- `song-store` depends on `core` (and `zustand`).
- `audio` depends on `tone` only.
- `ui` depends on `core` and React.
- A module may depend on `core`, `song-store`, `audio` and `ui`. **A module never imports another
  module.** The only way to move between modules is through the shell's `navigate()`.
- `apps/web` imports modules only through their `index.ts` (their `ModuleDefinition`).

This keeps each module replaceable: delete `modules/guitar` and the rest of the app still builds.

## The song model (`packages/core`)

`Song` (schema v3; strum patterns live on chords — `ChordEvent.pattern` over a song default — and a run of chords sharing one is a pattern block, computed in `core/patterns`) is the single document both modules read and write, held in one store — there
is no per-module copy and no URL hand-off between modules.

- `ChordRef` — a chord's identity (root, quality, seventh, flavor, numeral, origin), plus an
  optional `colour` for the rich vocabulary (6, 6/9, 9, 11, 13, alterations, added tones, omit
  tones) that isn't needed by the progression module's own suggestion engine.
- `ChordEvent` — a `ChordRef` plus `beats` and optional `attachments` (currently just
  `attachments.guitar: GuitarVoicing`; a future piano module would add its own key here without
  touching this one).
- `Section` — a list of `ChordEvent`s, plus `variantOf`/`variantLabel` when it's a copy of another
  section (e.g. "Up the neck (5+)"). Variants are plain copies; they do not follow later edits to
  the section they were copied from.
- `Song` — key, time signature, tempo, sections, arrangement, a `GuitarSetup` (`tuning`, `capo`)
  shared by the whole song, and a `moduleData` bag keyed by module id for anything module-specific
  that doesn't belong in the shared shape.

`migrateSong(raw: unknown): Song | null` is the one function allowed to read a `Song` from
untrusted input (storage or JSON import): it upgrades v1 songs (no `schemaVersion`) and v2 songs (section patterns fold onto chords) to v3 and
sanitises the result field by field. Nothing else parses a `Song` from `unknown`.

Voicing staleness is **computed, never stored**: `voicingStatus(event, song)` returns `'none' |
'ok' | 'chord-changed' | 'tuning-changed'` by comparing a committed voicing's snapshot
(`tuning`/`capo` at commit time) against the song's current setup, and its sounding pitch classes
against the chord's required tones. Nothing writes a "stale" flag onto the voicing itself.

Song operations (`addChord`, `duplicateSection`, `commitVoicing`, `makeVariant`, …) are pure
functions in `core` that take and return a `Song`. The Zustand stores (`song-store`'s vanilla
store, and each module's own thin UI-state store) are wrappers around these, not where the logic
lives — this is what keeps the operations unit-testable without React or a DOM.

## The shell and the module contract (`apps/web`)

```ts
export interface ModuleDefinition {
  id: string;                  // 'progression', 'guitar'
  title: string;               // tab label
  icon: ReactNode;
  scope: 'song' | 'song-or-tool'; // 'song-or-tool' also works with no song open, at #/tools/:id
  Component: ComponentType<ModuleProps>;
  onDeactivate?: () => void;   // stop audio/gestures when the user leaves this module
  playback?: PlaybackAdapter;  // how the shell's one transport plays this module (@sw/timeline)
  TransportExtras?: ComponentType; // module-specific controls shown in that transport row
  hasOwnSongOrder?: boolean;   // true if the module already shows/edits the song's playing order
}

export interface ModuleProps {
  songId: string | null;       // null when opened as a stand-alone tool
  focus: { eventId?: string; sectionId?: string }; // from the URL query
  navigate: (to: { module: string; songId?: string | null; eventId?: string }) => void;
}
```

Routes are hash-based (`wouter` + `useHashLocation`), so the app works from a plain static file
server or `file://`-style hosting:

- `#/` — **Library**: song list, New song, Import JSON, and a Tools row for modules that work
  without an open song.
- `#/song/:songId/:moduleId?` — the shell header (title, module tabs, theme) plus the active
  module, all reading the one open song from `song-store`.
- `#/tools/:moduleId` — a module opened stand-alone, `songId: null`.

### How to add a module

1. Create `modules/<name>/` with its own `package.json`, `src/App.tsx`, and an `index.ts` that
   exports a `ModuleDefinition`.
2. Read and write the song only through `@sw/song-store`'s hooks and `@sw/core`'s operations —
   never reach into another module's files.
3. If the module needs song-level data of its own, put it under `song.moduleData.<yourModuleId>`
   and sanitise it yourself wherever you read it back (treat it as untrusted, like the rest of a
   loaded/imported song).
4. Register it in `apps/web/src/shell/modules.ts`'s `MODULES` array (and `SONG_MODULES`/
   `TOOL_MODULES` depending on its `scope`). That's the only shell file a new module touches.
5. Give it its own CSS scoped under one root class (see Styling below) if it isn't using Tailwind.

## Audio (`packages/audio`)

One `AudioContext` for the whole app, created through `Tone.getContext()`. `unlockAudio()` /
`onUnlock()` handle the browser's user-gesture requirement; a shell-level "tap to enable sound"
banner drives it, and each module hooks the same unlock listener so any click anywhere in the app
counts as the unlocking gesture. When the shell switches the active module it calls the outgoing
module's `onDeactivate` so nothing keeps playing in the background (a stray transport, a held
scale playback, an unresolved strum).

## Styling

`packages/ui/tokens.css` holds one set of design tokens (`--bg`, `--fg`, `--muted`, `--line`,
`--accent`, `--danger`, …) shared by the shell and both modules, defined in three blocks so every
color works in all three theme states:

```css
:root { --danger: #b91c1c; }                                        /* light, explicit default */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { --danger: #e06c5a; }             /* system → dark */
}
:root[data-theme='dark'] { --danger: #e06c5a; }                      /* explicit dark */
```

A single hex value is almost never legible against both theme backgrounds at once (see the
`--danger` values above — light and dark need different shades to clear WCAG 4.5:1 contrast) — a
new "themed" color always goes in as a token pair like this, never a literal hex baked into a
component.

The guitar module keeps its own plain CSS rather than Tailwind, scoped entirely under `.mod-guitar`
so its rules can't leak onto the shell or the progression module (and vice versa); it reads the
same shared tokens rather than defining its own palette.

## In-app help and the user guide (`apps/web/src/shell/help`, `guide`)

Help is mounted once, above the router (`HelpLayer`), and works on every screen:

- **Hover** (mouse only) shows a tooltip after a short pause; keyboard focus shows the same one.
- **Help mode** (the "?" button in the header) shades the screen and puts a full-screen overlay over
  it, so a tap describes whatever is underneath (`document.elementsFromPoint`) instead of activating
  it. This is the touch equivalent of hover.

Help text is **not** annotated onto components. It is a list of `HelpEntry` (`@sw/ui`) matched by a
control's accessible name (its `aria-label`, `<label>` text or visible text), or by a selector, and
scoped to a module's root class. Each module supplies its own list as `ModuleDefinition.help`
(`modules/<name>/src/help.ts`), `@sw/ui` supplies `UI_HELP` for the shared components, and the shell
has `SHELL_HELP`. `resolveHelp` walks up from the element under the pointer and returns the first
match, then falls back to a `title`. **When you add a control, add its entry** — `npm run check:help`
visits every screen and dialog and fails on any visible control that has no help text.

The user guide (`guide/content.ts`) is data, rendered by `GuideDialog` and opened from Settings. It
follows the Google developer documentation style guide; edit the data, not the component.

## Accessibility and performance

`apps/web/scripts/a11y-check.mjs` runs axe-core (WCAG 2/2.1 A/AA + best-practice) over the
Library, both modules inside a song, and the guitar module's stand-alone tool mode, each in both
themes, then drives the fretboard, tabs and dialogs by keyboard. `apps/web/scripts/perf-check.mjs`
throttles the CPU and measures frame times during a tuning-peg drag, a chord change and scale
playback, both stand-alone and with a progression strip rendered below the neck in song context.
Both are `npm run check:a11y` / `npm run check:perf` and are part of the full check suite before a
release (see README).

## Storage and migration

Two independent migration paths exist, both exercised by tests rather than left to manual QA:

- **Songs** (`packages/song-store/src/index.ts`): `sw:songs`/`sw:currentId` in `localStorage`. On
  first run, if `sw:songs` is absent, the store imports the legacy `chordbuilder:songs`/
  `chordbuilder:currentId` keys through `migrateSong`. Covered by
  `packages/song-store/src/index.test.ts` with a real-shaped v1 song fixture.
- **Guitar module settings** (`modules/guitar/src/state/storage.ts`): `sw:guitar-settings`, falling
  back to the two names the module used before it moved into this app (`fluid-frets-settings`,
  then `fretscape-settings`), and retiring both on the next write. Covered by
  `modules/guitar/tests/storage.test.ts`.
