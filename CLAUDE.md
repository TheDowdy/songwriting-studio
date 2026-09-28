# CLAUDE.md

Read `ARCHITECTURE.md` first for the module/package layout and the song data model — this file is
just commands and working conventions.

## Commands

Run everything from the repo root; each proxies to the right workspace.

```
npm run dev              # apps/web dev server (Vite)
npm run build             # production build
npm run preview           # serve the production build (needed by check:perf, check:deploy)
npm test                  # every package/module's unit tests (vitest)
npm run typecheck         # tsc -b across every workspace
npm run lint              # eslint (currently only configured for modules/guitar)
```

Browser checks (`apps/web/scripts/*.mjs`, driven by Playwright against a running dev/preview
server) — each is also an `npm run check:<name>` at the root:

| Script | What it exercises |
|---|---|
| `check:app`, `check:pegs`, `check:strum`, `check:scales`, `check:chords`, `check:identify`, `check:guitars`, `check:fallback`, `check:settings`, `check:clock` | the guitar module's own features, stand-alone |
| `check:shell`, `check:song-guitar`, `check:song-files`, `check:voicing-commit`, `check:song-voicings`, `check:guitar-build`, `check:revoice`, `check:variant`, `check:chord-header` | cross-module behaviour in song context (committing voicings, re-voicing, variants, save/load) |
| `check:a11y` | axe-core WCAG 2/2.1 A/AA + best-practice, both themes, keyboard nav |
| `check:perf` | frame times under CPU throttling (peg drag, chord change, scale playback, stand-alone and in song context) |
| `check:deploy` | production build served under a sub-path, offline (service worker), CSP headers |
| `check:audio` | the AudioWorklet/ScriptProcessor fallback path |

Before running a browser check, start the server it expects: most want the dev server
(`npm run dev`) at `http://localhost:5173`; `check:perf` and `check:deploy` want a production
build served with `npm run preview` at `http://localhost:4173`. Each script's top comment says
which `*_URL` env var overrides its default, if you need a different port.

A full pre-release sweep is: `npm test && npm run typecheck && npm run lint && npm run build`,
then every `check:*` script.

## Debug hooks

Every module exposes its store (and the guitar module its audio engine) on `window` when
`import.meta.env.DEV` or the URL has `?debug`, for the browser-check scripts and manual poking in
devtools:

- `window.__songwriting` — the progression module's store, plus `toNoteStrikes`/`voicingStatus`.
- `window.__fluidfrets` — the guitar module's store and `audioEngine`.
- `window.__shell` — the shell's settings store (theme, etc).

## Conventions

- **Pure logic lives in `packages/core`, not in a component or a store action.** If you're adding
  a new chord/voicing/song behaviour, write it as a function that takes and returns data, test it
  directly, then call it from the store.
- **`migrateSong` is the only function allowed to turn `unknown` into a `Song`.** Loading from
  storage and importing JSON both go through it — never assume a stored or imported song matches
  the current schema.
- **A module never imports another module.** Cross-module navigation only happens through the
  shell's `navigate()`. If two modules need to share behaviour, that behaviour belongs in `core`,
  `song-store`, or `ui`, not in one module importing from the other.
- **New "semantic" colors (danger, warning, …) are theme tokens in `packages/ui/src/tokens.css`,
  never a literal hex in a component.** A single hex rarely clears 4.5:1 contrast against both the
  light and dark backgrounds — see the `--danger` token for the pattern (light and dark get
  different shades of the same color).
- **Known environment flake on this Mac**: `check:app`, `check:pegs`, `check:fallback`, and
  `check:deploy`'s audio assertions occasionally fail because Chrome's `AudioContext` clock stalls
  while still reporting `state: 'running'` — this has been confirmed to reproduce identically on a
  clean stash of unrelated commits, so a failure isolated to an audio-output assertion on this
  machine should be re-run once before treating it as a real regression.
- Formatting-only changes (Prettier) go in their own commit, separate from behaviour changes.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (see the
  session's own attribution footer for the exact lines in use).
