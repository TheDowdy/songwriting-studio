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
   with an origin-coloured baseline, ruled sections, thin square scrollbar.
5. Guitar chrome only: toolbar, banner, tabs, chips, buttons, chord header. Error banner uses `--danger`.
6. Housekeeping: Geist packages removed, Newsreader/Plex Mono added, `theme-color` meta, manifest
   colours, `check:settings` colour constants and `DEPLOYMENT.md` updated.

## Verification (as of the last commit)

- Passing: `npm test`, `npm run typecheck`, `npm run build`, `check:help`, `check:a11y` (all axe
  scans, both themes), `check:shell`, `check:settings`, `check:song-files`, `check:voicing-commit`,
  `check:song-voicings`, `check:guitar-build`, `check:revoice`, `check:variant`, `check:scales`,
  `check:guitars`, `check:deploy` (offline, CSP, fonts).
- Failing on audio output only (the known `AudioContext` flake): `check:chords`, `check:identify`,
  `check:chord-header`, the audio assertions in `check:deploy`, `check:song-guitar`. `check:song-guitar`
  and the last step of `check:a11y` (strict-mode "Mute" locator) fail identically on `main`.
  The other three were not re-run on `main`.
- `npm run lint` fails on `main` too (typescript-eslint does not support TypeScript 7).
- Not run: `check:perf`, `check:app`, `check:pegs`, `check:fallback`, `check:audio`, `check:clock`,
  `check:strum`.

## Still to do / open questions

- **Guitar neck**: an "Engraving" model (ink on paper, fixed paper sheet in both themes) now exists in
  `guitarSkins.ts` as a sixth option, not the default. Open: make it the default? A dark-theme variant?
  The legend swatches under the neck still use the wood colours.
- Guitar progression strip (`ProgressionStrip.tsx`, `StripToolbar.tsx`) still has dashed blocks and a
  filled "Play song" button.
- Not restyled: Settings and Guide dialogs, print/sheet view (`modules/progression/src/sheet`),
  variant dialog, Customise popover, the help tooltip and overlay.
- App icon (`apps/web/public/icon.svg`, regenerate PNGs with `scripts/make-icons.mjs`) is still a dark fretboard.
- Not yet looked at: phone width on the Guitar screen, dark-mode Library, landscape phone.
- Optional idea from the Colour Blocks mockup: colour chords by harmonic function. Not planned.
- Before merging: run the full sweep from CLAUDE.md, re-run the audio-flaky checks once, run
  `check:perf`, and decide whether to keep the 106.25% root size after seeing it on a real monitor.
  Formatting-only changes should stay in their own commit.

## Feature requests queued for after the design pass

Raised by the owner on 2026-09-30; do not start until the design looks right.

1. **Space bar toggles playback** of the progression on desktop (start and stop). Needs care around
   focus: it must not fire while typing in an input, textarea or select, or when a button has focus
   (space already activates it), and it should work in both the progression and guitar modules.
2. **Add any built chord to the progression from the guitar module**, for example a chord built in
   Identify mode. Afterwards the owner wants to switch back to the progression module and get
   suggestions for what to add next from that chord. Chords built or identified in the guitar module
   can be arbitrary (any root, quality, colour), so this needs a mapping to a `ChordRef`
   (`origin` and `numeral` relative to the song's key) through `packages/core`, plus a test.

## Running it

```
git checkout design/manuscript
npm run dev          # http://localhost:5173
```
