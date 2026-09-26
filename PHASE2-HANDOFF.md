# Phase 2 hand-off (work in progress, branch `wip/phase-2`)

Phase 2 (PLAN.md §7) was interrupted by a usage limit on 2026-09-26, part-way through. This
branch holds the unfinished work so nothing is lost. `main` is still at the last verified state
(Phase 1 + the guitar-sample prefetch fix e1070f9).

## State when interrupted

Done (uncommitted work, saved here as-is):
- Files moved with `git mv` (history kept):
  - `legacy/fluid-frets/src` → `modules/guitar/src`, `legacy/fluid-frets/tests` → `modules/guitar/tests`
  - `legacy/progression-builder/src` → `modules/progression/src`
  - deploy files (Dockerfile, docker-compose.yml, docker/, netlify.toml, docs/DEPLOYMENT.md),
    public assets (icons, manifest, sw.js, theme-init.js, samples/) and FF browser-check scripts
    → `apps/web/`
- Started: `modules/*/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
  (ModuleDefinition entry points); `packages/audio` (`src/index.ts`), `packages/ui`
  (`src/tokens.css`); `apps/web` (`package.json`, `index.html`, `vite.config.ts`,
  `tsconfig.json`, `src/global.css` only).
- Some edits began inside the moved files: guitar `App.tsx`, `audio/engine.ts`,
  `SettingsDialog.tsx`, `state/storage.ts`, `styles/global.css`, `tests/storage.test.ts`;
  progression `App.tsx`, `audio/engine.ts`, `index.css`, `sheet/SheetView.tsx`. `main.tsx` and
  FF `hooks/useTheme.ts` were deleted (the shell takes these over). The last action was
  "update the call site and imports" in one of these.

Not done yet:
- The shell app (`apps/web/src`): router, Library, header, the module registry (`MODULES`),
  `appInfo.ts` (APP_NAME = 'Songwriting Studio'), theme, audio banner, legacy settings import.
- Root `package.json` still lists workspaces `packages/*`, `legacy/*` and scripts that point at
  `legacy/…`. Change them to `packages/*`, `modules/*`, `apps/*` and a single `dev`/`build`.
- `legacy/` still exists (now mostly empty configs). Delete it when the move is complete.
- Everything under "Done when" for Phase 2, plus the checks: test, typecheck, lint, build, all
  ported FF browser checks against `#/tools/guitar`, the new `check:shell` (including the
  first-tap recorded-guitar assertion: hook `AudioBufferSourceNode.prototype.start`,
  synthesized notes are exactly 3.0 s long, expect 0 of them on the first tap), and `check:a11y`.

## Status at the time of saving
- `npm test`: core 327 and song-store 8 pass. The module suites weren't reached, because the
  workspace scripts still point at `legacy/`.
- `npm run typecheck`: fails (`legacy/fluid-frets` has no inputs left). Expected mid-move.

## To resume
Check out `wip/phase-2`, run `npm install`, read PLAN.md §4–§7 (Phase 2) and this file, then
finish Phase 2. Before resuming, review the partially edited files listed above. Delete this file
in the final Phase 2 commit, squash or merge the branch into `main`, and don't push (the owner's
session pushes after verifying).
