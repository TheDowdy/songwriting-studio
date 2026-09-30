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
9. Housekeeping: Geist packages removed, Newsreader/Plex Mono added, `theme-color` meta, manifest
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

1. **Space bar toggles playback** of the progression on desktop (start and stop). Needs care around
   focus: it must not fire while typing in an input, textarea or select, or when a button has focus
   (space already activates it), and it should work in both the progression and guitar modules.
   Not started. There is no existing global key handler for it.
2. **Add any built chord to the progression from the guitar module**: parked by the owner, who has
   more to add. The brief and a map of the existing code is in
   `docs/feature-add-built-chords-to-progression.md`. Discuss before building.

## Running it

```
git checkout design/manuscript
npm run dev          # http://localhost:5173
```
