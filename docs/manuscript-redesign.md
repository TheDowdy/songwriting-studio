# Manuscript redesign: status

Branch: `design/manuscript` (4 commits on top of `main`, not merged, not pushed).
Goal: replace the "vibe-coded" sage look with a considered identity. Direction chosen from five
mockups: **Manuscript** (paper, blue ink, red pencil; Newsreader + IBM Plex Mono; hairline rules,
italic = actionable, roman = content).

Design mockups (Claude artifacts, private to the owner):
- Five directions: https://claude.ai/artifact/Sz2a9DWZ13DsScwezmTAZj
- Manuscript on all screens plus a token spec sheet: https://claude.ai/artifact/KoQqAYz9kCuusHXo4gABoW

## Done

1. `packages/ui/src/tokens.css`: new palette (light, dark, system-dark) and fonts. Same token names.
   `--muted` is `#5e6373` (the spec sheet mockup still shows the old `#6b7080`, which failed AA on `--surface-2`).
2. Shell: italic underlined tabs, quiet sound banner, Library as an index with dot leaders,
   `--radius-lg/xl` flattened to 2px (primary actions use `rounded-full`), root font size 106.25%
   (Newsreader has a smaller x-height).
3. `global.css`: the `button, select, input { font: inherit }` reset moved into `@layer base`, so
   Tailwind `text-*`/`italic` utilities on buttons now apply. This changes button sizes app-wide.
4. Progression: key row, transport, chord ring (serif, coloured by origin), timeline blocks as bars
   with an origin-coloured baseline, ruled sections, thin square scrollbar, print sheet view.
5. Guitar chrome: toolbar, banner, tabs, chips, buttons, chord header, dialogs, popover, and the
   progression strip (bars; dashed still means "no committed voicing"; the playhead is a pale wash
   with a red-pencil baseline; Play is red pencil).
6. **Engraving guitar model** (`guitarSkins.ts`): ink on paper, open bracket instead of a headstock,
   double bar after the last fret, plus a "Paper" board in the customiser. It is **first in the list
   and the default** (`DEFAULT_MODEL_ID`; unknown ids fall back to it). Saved settings keep whatever
   model a user already picked. The paper is a fixed sheet in both themes (bright in dark mode).
   Notes outside the shown fingering or overlay are dimmed to 0.4 (was 0.5), and the selected notes
   get a 4-unit black outline (`skin.selectedOutline*`).
7. App icon redrawn (engraved fretboard on ink); `make-icons.mjs` waits for repaint before capture.
8. Settings dialog was stuck top-left (Tailwind preflight zeroes a dialog's auto margin): now `m-auto`;
   guitar dialog gets `margin: auto`.
9. **Strum slashes**: timeline blocks (progression) show one slash per beat on a small staff
   instead of a beat number; the first slash turns red pencil while the block sounds. The guitar
   strip shows slashes too (a long chord shows "N beats"). The user guide describes this.
10. Housekeeping: Geist packages removed, Newsreader/Plex Mono added, `theme-color` meta, manifest
   colours, `check:settings` colours, `DEPLOYMENT.md`, `guitars-check` (six models), `shell-check`
   (scroll the Add button into view before measuring page scroll; it was viewport-height dependent).

## Verification (as of the last commit)

- Passing: `npm test`, `npm run typecheck`, `npm run build`, `check:help` (42), `check:a11y` (45),
  `check:shell` (17, three runs in a row), `check:guitars` (34), `check:settings` (32),
  `check:song-files`, `check:voicing-commit`, `check:variant`, `check:perf` (5),
  `check:song-voicings`, `check:guitar-build`, `check:revoice`, `check:scales`, `check:deploy`
  (offline, CSP, fonts).
- Failing on audio output only (the known `AudioContext` flake): `check:chords`, `check:identify`,
  `check:chord-header`, the audio assertions in `check:deploy`, `check:song-guitar`.
  `check:song-guitar` and the last step of `check:a11y` fail identically on `main`. The others were not
  re-run on `main` (it no longer builds with the Geist packages removed).
- `npm run lint` fails on `main` too (typescript-eslint does not support TypeScript 7).
- Not run since the latest commits: `check:app`, `check:pegs`, `check:fallback`, `check:audio`,
  `check:clock`, `check:strum` (mostly audio-dependent).

## Still to do / open questions

- A dark-theme paper variant of the Engraving model? (The paper is a fixed bright sheet in both
  themes.) The legend swatches under the neck still use the wood colours.
- Not restyled: the help tooltip and overlay, the Customise popover contents beyond radius.
- Not yet looked at: landscape phone, a real monitor for the 106.25% root size.
- Optional idea from the Colour Blocks mockup: colour chords by harmonic function. Not planned.
- Before merging: re-run the audio-flaky checks once, decide on the root size, and keep any
  formatting-only change in its own commit.

## Feature requests queued for after the design pass

Raised by the owner on 2026-09-30.

1. **Space bar toggles playback**: DONE (2026-10-01). Plain Space starts and stops the progression in
   the progression module and in the guitar module (song context only). The rule is a pure function,
   `shouldToggleOnSpace` in `packages/core/src/spaceKey.ts` (tested), used by the `useSpaceBarToggle`
   hook in `@sw/ui`. It never acts in text fields, selects, sliders, checkboxes, tabs, or while a
   dialog/help/sheet overlay is open. On a button or link it acts only if the mouse focused it
   (so Space after clicking "+ Add" or a chord toggles playback instead of pressing it again); a
   keyboard user who tabbed there keeps Space for activation and for keyboard drag-and-drop.
   Pointer-versus-keyboard focus is tracked in the hook (any non-Space, non-modifier key marks focus as
   keyboard-driven), not read from `:focus-visible`, which Chrome flips on at the first keypress.
   Browser check: `npm run check:spacebar`. Documented in the user guide.
2. **Add any built chord to the progression from the guitar module**: DONE (2026-10-01), built from
   `docs/feature-add-built-chords-to-progression.md` with its suggested defaults. "Add to progression"
   on the Chords tab and the Identify tab (song context only) adds the chord (`fromChordSpec`) after
   the focused chord, or at the end of the last section, with the neck's shape as its committed
   voicing. Placement is `insertionPoint` in `packages/core` (tested). The focused chord is now shared
   through the song store (`focusedEventId`), and the Progression module opens on it, so its chord map
   is centred on the added chord. Check: `npm run check:addchord`.

## Features added after the design pass (2026-10-01)

- **Circle of fifths map** (progression module): a **Suggestions | Circle of fifths** switch above the
  chord map (choice remembered in `localStorage`, `sw:map-mode`). The circle shows 36 chords (major,
  relative minor and the leading-tone diminished at 12 positions), shaded as key chord / in the key /
  borrowed from the parallel key / outside the key. All are selectable. The content and roles are a
  pure, tested function (`circleOfFifths` in `packages/core/src/circle.ts`); the component is
  `CircleOfFifths.tsx`. "Use as key" shifts the key of the active section (or the song, if it has only
  one section). Diminished sevenths come through the shared Flavor menu.
- **Major <-> minor without changing the key**: `toggleMajorMinor` in `packages/core/src/chordQuality.ts`
  (tested). A **Make minor / Make major** button is on the shared focus card (`ChordFocusCard.tsx`,
  extracted from `NodeMap`, so both map modes have it) and in the timeline's chord toolbar.
- **Key per section**: optional `Section.key` (schema stays v2, `migrateSong` sanitises it).
  `keyOfSection` / `keyOfEvent` in `packages/core/src/keys.ts`; `changeSectionKey` in operations;
  `changeKey` leaves modulated sections alone. The key picker has a **Key applies to: Whole song |
  Only <section>** scope and **Back to the song's key**; the map, suggestions, flavour picker and the
  guitar module's choices use the section's key. Known gap: the printed/sheet view still uses the
  song's key signature for the whole song.
- **Strum pattern builder** (both modules): custom patterns are data in the song (`Song.patterns`,
  `StrumPattern`), referenced as `custom:<id>` from `Song.pattern`, `Section.pattern` or
  `ChordEvent.pattern` (a chord's own beats its section's, which beats the song's; resolution is
  `patternIdFor` / `resolvePattern`). A step is a down or up stroke over all, low or high strings
  (partial strums), optionally accented; the grid is quarter, eighth or sixteenth notes over 1 to 8
  beats; a pattern tiles across a chord's length (`strumEvents`) and which notes a stroke plays is
  `strumNotes`. All pure and tested in `packages/core/src/strumPattern.ts` and `patterns.ts`;
  operations (`saveStrumPattern`, `deleteStrumPattern`, `applyPattern`, `clearOwnPattern`) are in
  `operations.ts`. The shared UI is `PatternBuilder`, `PatternPanel` and `PatternSelect` in `@sw/ui`
  (styles in `packages/ui/src/patterns.css`). Progression playback renders custom patterns through
  `renderStrumPattern`; the guitar module's player turns each stroke into a strike with the right
  notes in the right order (down low to high, up high to low). Timeline blocks show a custom
  pattern's strokes as arrows. Not done: patterns for piano and pad (the owner wants those later; a
  custom pattern does play on them as chord strokes), a lane of strokes drawn alongside the whole
  timeline, and undo for pattern edits in the guitar module. Check: `npm run check:patterns`.
- Browser check: `npm run check:circle` (22 checks). `check:help` now also visits the circle and a
  section with its own key.

## Running it

```
git checkout design/manuscript
npm run dev          # http://localhost:5173
```
