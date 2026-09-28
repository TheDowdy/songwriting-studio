# Songwriting Studio

Build a chord progression, then open the same song in a guitar fretboard module to find and commit
real playable voicings for it — key-aware suggestions, sections and arrangement, playback,
JSON/MIDI export and sheet music on one side; any tuning, a capo, scales, a rich chord builder with
voicing search, and chord identification on the other. One song, one store, shared between them.

Runs entirely client-side — no server, no account, no data leaving the browser. Songs autosave to
`localStorage` and can be exported/imported as JSON.

## Run it

```bash
npm install
npm run dev
```

Open the printed `localhost` URL. `npm run build && npm run preview` builds and serves the
production bundle.

## Layout

```
apps/web/       the shell: router, module registry, song library
packages/        core (song model + theory), song-store, audio, ui (shared components/tokens)
modules/         progression/ and guitar/ — the two feature modules
```

See `ARCHITECTURE.md` for how the pieces fit together and how to add a new module, and
`CLAUDE.md` for the full command list and working conventions. Deployment (Docker, Vercel,
Netlify, a NAS) is covered in `apps/web/docs/DEPLOYMENT.md`.

## Testing

```bash
npm test           # unit tests (vitest)
npm run typecheck
npm run lint
```

Playwright-driven browser checks live in `apps/web/scripts/` and run against a dev or preview
server (`npm run check:<name>` — see `CLAUDE.md` for the full list, including accessibility and
performance checks).
