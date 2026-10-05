# Plan: strum patterns as a pattern lane on the timeline

Status: proposed. Author: planning pass on 2026-10-05, against `main` at `2e1b7c4`.
Implementer: follow the phases in order; each one ends green (`npm test && npm run typecheck &&
npm run lint`) and is its own commit. Read `CLAUDE.md` and `ARCHITECTURE.md` first.

> **Before you start:** the working tree has the user's own uncommitted changes (a new
> `packages/ui/src/NumberField.tsx`, edits to `Timeline.tsx`, `TransportBar.tsx`,
> `VariantDialog.tsx`, `packages/ui/src/index.ts`). This plan edits `Timeline.tsx` and
> `TransportBar.tsx`. **Ask the user to commit or stash that work before Phase 1.** Never stage
> their hunks into a commit from this plan. Nothing below depends on `NumberField`.

---

## 1. Diagnosis: why the current UI fails

1. **The control and its result are far apart.** The **Strum patterns** button lives in the
   fixed `TransportBar` (`TransportBar.tsx` ~L147–158). It only flips `patternsOpen` in the
   progression store. `App.tsx` (~L113) renders `<PatternPanel>` *after* `<Timeline>`, at the very
   bottom of the page. On narrow screens the transport is pinned to the bottom, so the panel opens
   off-screen. All the user sees is the button turning accent-coloured.
2. **There are three inheritance levels and you can't see any of them.** `patternIdFor`
   (`packages/core/src/patterns.ts`) resolves chord → section → song. Nothing on the timeline shows
   which level a chord's pattern comes from. You only get a tiny `≋` glyph if a chord has its own
   pattern, plus arrows on the chord block if the pattern is custom.
3. **Four places set patterns, and they overlap:**
   - the panel's apply buttons (`Selected chord`, `Rest of section`, `Whole section`, `Entire song`)
   - the per-chord `PatternSelect` in `ChordToolbar`
   - the song-level **Pattern** select inside **More playback settings**
   - the guitar module's own button and panel, plus its `StripToolbar` select

   **Pattern** and **Entire song** both write `song.pattern`. Only **Entire song** clears the
   overrides, so the two look the same but act differently.
4. **"Where it applies" is a separate step from "what it is".** The panel edits a pattern chosen
   from **Pattern to edit**. That is a different selection from the timeline's selected chord, and
   the apply buttons connect the two. The user must keep both selections in their head.
5. **The musical model is surprising.** `strumEvents(pattern, chordBeats)` restarts the pattern at
   every chord. A 4-beat pattern over two 2-beat chords plays its first half twice and never its
   second half. A "pattern spanning chords" can't be expressed at all.

## 2. Recommendation (refining the user's proposal)

**Adopt the user's pattern lane, with these changes:**

| User proposal | Recommendation | Why |
|---|---|---|
| Lane over the whole song's timeline | **One lane per section row**, directly **below** that section's chord blocks | The timeline edits *sections*. The arrangement plays them (`flattenDetailed`) with repeats, and one chorus appears 3×. Section rows have no flattened song view to draw a lane on, and per-occurrence patterns would be invisible. |
| Free spans, boundaries anywhere | **Block edges snap to chord boundaries.** No mid-chord splits. | This matches "apply the pattern to whatever chords are playing". It also avoids splitting a chord's playback and keeps resolve logic trivial. |
| Spans stored as their own entities | **Store the pattern on each chord (`ChordEvent.pattern`, as now).** A *block* is a run of neighbouring chords with the same pattern, computed and never stored. | Spans by index or id break on every insert, delete, reorder, move, duplicate or variant (≈10 ops). A per-chord field moves with the chord for free. |
| Split a block into two | **Not offered.** Shrink a block, then give the freed chords another pattern. | With derived blocks, two touching blocks with the same pattern merge. The user's "truncate and add a new block" flow is fully covered. |
| Song / section / chord / song-default levels | **Two levels: the song default, and a chord's own.** Drop `Section.pattern`. "Whole section" paints every chord in the section. | One fewer invisible level. Everything the lane shows is literally what plays. |
| Pattern loops in a block | **A custom pattern loops from the block's left edge, continuously across its chords.** | This fixes diagnosis item 5. A block reads like a clip in a DAW. |

### 2.1 Mock-up (one section, 4/4, chords of 4, 2, 2 and 4 beats)

```
 Verse  ×1                                           Duplicate section · Make variant · …
┃ G              ┃ Em       │ C        ┃ D              ┃     <- chord blocks (unchanged,
┃ I              ┃ vi       │ IV       ┃ V              ┃        slashes only now)
┃ / / / /        ┃ / /      │ / /      ┃ / / / /        ┃
┣━━━━━━━━━━━━━━━━┻━━━━━━━━━━┻━━━━━━━━━◆┫┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┃     <- pattern lane
┃ Folk ↓ ↓↑ ↑↓↑  ↓ ↓↑      ↑↓↑        ◆┃ Song default · Block ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◆┛┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┛
   one block over G, Em, C (8 beats; the 4-beat     ◆ = resize handle (role=slider)
   pattern plays twice, Em gets beats 1-2, C 3-4)    dashed = no pattern of its own

 ── selected block toolbar (shown under the row, where ChordToolbar shows today) ─────────
 Pattern block: Folk · G – C        [Block pattern ▾ Folk (D, DU, UDU)]  [Edit pattern]
 [− Shorter block] [+ Longer block]   Use it for: [Just this chord] [Whole section] [Whole song]
 [Remove pattern]  [×]
 ── inline editor (when Edit pattern is pressed) ─────────────────────────────────────────
 <PatternBuilder …>  Used by 3 chords.  [Duplicate pattern] [Delete pattern]
```

### 2.2 Interaction spec

The *lane cell* is one per chord, rendered inside that chord's `<li>` so it scrolls, snaps and
re-sorts with it. A *block* is a run of neighbouring cells with the same own pattern, or a run of
cells with none (a **default run**).

- **Look**
  - A block's cells join visually into one bar. Its name shows in the first cell (truncated, full
    name in `title`/`aria-label`).
  - Custom strokes draw as arrows across the cells at the right phase. This code moves out of
    `ChordSlot`'s bottom staff, which goes back to always showing beat slashes.
  - Built-in patterns show only their name.
  - A default run is dashed and muted. It reads "Song default · <label>" in its first cell.
- **Select:** tap or click a cell. This sets `laneEventId = event.id` and shows the block toolbar
  under the row in place of `ChordToolbar`. Selecting a chord block clears `laneEventId`, and
  **Escape** or **×** closes it. The selected block gets the same inset accent ring as a selected
  chord.
- **Create:** select a cell in a default run, then pick from **Block pattern**. Only *that chord*
  gets the pattern, creating a one-chord block. Then extend it. The picker's **New pattern** group
  (Blank, or a preset) creates a custom pattern, assigns it the same way, and opens the editor.
- **Change:** picking from **Block pattern** on an existing block changes every chord in the block.
  The **Song default (X)** option is the same as **Remove pattern**.
- **Resize** (only on blocks that have a pattern, not default runs):
  - Drag the ◆ handle on the block's last cell. The new end is the last cell whose horizontal
    midpoint is left of the pointer, minimum 1 chord, maximum the section's end.
  - Growing paints over the next chords and overwrites their own pattern. Shrinking returns the
    freed chords to the default.
  - Keyboard: the handle is `role="slider"`. ←/↓ is one chord fewer, →/↑ is one more, Home is 1,
    End is to the section's end.
  - Touch and keyboard alternatives: **− Shorter block** / **+ Longer block** in the toolbar.
- **Quick scopes:** these apply the block's pattern somewhere else.
  - **Just this chord:** keep it on the selected cell's chord and return the rest of the block to
    the default.
  - **Whole section:** every chord in the section.
  - **Whole song:** make it `song.pattern` and clear every chord's own pattern. Confirm with
    `confirm()` only when other chords have their own patterns ("This replaces the patterns on N
    other chords").
- **Default runs:** the toolbar shows **Block pattern** and **Song default** (a select that writes
  `song.pattern` without clearing overrides). It hides Shorter/Longer and the "Use it for" group.
- **Delete:** **Remove pattern** (and Delete/Backspace on a focused cell) returns the whole block to
  the default.
- **Edit:** **Edit pattern** is enabled only for custom patterns. It toggles the inline
  `PatternEditor` under the toolbar. Editing changes every block that uses the pattern, and the
  editor says "Used by N chords".
- **New chords inherit:** a chord added right after a chord with its own pattern gets the same
  pattern, so the block extends. Reordering, moving or duplicating a chord carries its pattern
  with it.
- **Touch and mobile:**
  - The handle is ≥24 px wide, uses `touch-none`, and needs no long-press. Tapping a cell selects
    it. The lane scrolls with the row.
  - After selecting, call `toolbar.scrollIntoView({ block: 'nearest' })`. Below `lg` the pinned
    transport covers the page bottom, and `App` already has `pb-44`.
- **Accessibility:**
  - Cells are `<button aria-pressed>` named `Pattern for <Chord> (chord i of n): <label>` or
    `Pattern for <Chord> (chord i of n): song default, <label>`.
  - The handle slider is named `Chords in <label> block`.
  - The toolbar is `role="group" aria-label="Pattern block"`.
  - Use only existing tokens (`--surface-2`, `--accent`, `--line`, `--muted`, `--fg`, `--play`). If
    you need a new semantic colour, add it to `packages/ui/src/tokens.css` in all three blocks.
    Axe must pass in both themes.

## 3. Data model

### 3.1 Schema (`packages/core/src/schema.ts`)

- `SCHEMA_VERSION = 3`, and `Song.schemaVersion: 3`.
- **Remove `Section.pattern`.** `ChordEvent.pattern?: PatternId` and `Song.pattern`/`Song.patterns`
  stay exactly as they are.
- **`migrateSong`:**
  - Read `r.schemaVersion` before sanitising. When it is absent or `< 3`, fold the section pattern
    down: for each raw section with a usable `sanitizePatternId(section.pattern, known)` that is
    **not equal** to the sanitised song pattern, give every event in it that has no usable own
    pattern `pattern = sectionPattern`. Do this inside `sanitizeSection`: pass a
    `foldSectionPattern: boolean` and the song default.
  - At v3, ignore any `pattern` key on a section.
  - Never write `section.pattern`.
  - Update the doc comment ("upgrades v1 … and v2 songs") and `ARCHITECTURE.md` ("`Song` (schema
    v3)", one line about patterns).
- **Accepted behaviour change:** custom patterns now keep their phase across a block (§3.3). A v2
  song whose chords are shorter than its pattern will sound different. That is the point of the
  change. Mention it in the commit message.

### 3.2 Pure functions (`packages/core/src/patterns.ts`, `strumPattern.ts`)

```ts
// strumPattern.ts: add a phase; the default keeps every current caller's behaviour.
export function strumEvents(pattern: StrumPattern, chordBeats: number, phaseBeats = 0): StrumEvent[];
//   Hits at pattern time t (cycle*beats + i/stepsPerBeat) with phase <= t < phase + chordBeats,
//   offsetBeats = t - phase; durationBeats = next hit (or chordBeats) - offsetBeats.

// patterns.ts
export function ownPattern(song: Pick<Song,'patterns'>, event: Pick<ChordEvent,'pattern'>): PatternId | undefined;
//   event.pattern if usable (built-in, or custom that exists) else undefined.
export function patternIdFor(song: Song, event: Pick<ChordEvent,'pattern'>): PatternId;     // own → song → 'block'
export function resolvePattern(song: Song, event: Pick<ChordEvent,'pattern'>): ResolvedPattern; // sectionId param removed

export interface PatternBlock {
  sectionId: string;
  own: PatternId | undefined;   // undefined = a default run
  patternId: PatternId;         // what actually plays (own ?? song default)
  startIndex: number;           // first chord index in the section
  endIndex: number;             // last chord index, inclusive
  eventIds: string[];
  startBeat: number;            // beats from the section's start
  beats: number;                // sum of the chords' beats
}
export function patternBlocks(song: Song, sectionId: string): PatternBlock[]; // split where ownPattern() changes
export function blockOf(song: Song, eventId: string): PatternBlock | null;

/** Everything a consumer needs to play or draw one chord. */
export function chordPattern(song: Song, eventId: string): { resolved: ResolvedPattern; phaseBeats: number } | null;
//   phaseBeats = beats of the chords before this one in its block.
/** Custom strokes for a chord at its phase, or null for a built-in pattern. `beats` overrides the
 *  chord's length (the timeline passes the live length during a resize drag). */
export function chordStrokes(song: Song, eventId: string, beats?: number): StrumEvent[] | null;
```

Delete `PatternTarget` and the section branch of `patternIdFor`. Keep `BUILT_IN_PATTERNS`,
`patternOptions`, `patternLabel` and `findStrumPattern`.

### 3.3 Operations (`packages/core/src/operations.ts`)

These replace `applyPattern` and `clearOwnPattern`. All are pure. All return the same song object
when nothing changes, and `touch()` it otherwise. Ignore a custom id that doesn't exist, as
`applyPattern` does today.

```ts
export function setChordPatterns(song, sectionId, fromIndex, toIndex, patternId: PatternId | null): Song; // primitive; null clears; indices clamped
export function setBlockPattern(song, eventId, patternId: PatternId | null): Song;
//   own block → every chord in it; default run → ONLY eventId gets it (a new one-chord block); null → whole block cleared.
export function setBlockLength(song, eventId, chords: number): Song;
//   own block only (no-op for a default run); new end = start + clamp(chords, 1, sectionLen - start) - 1;
//   growing overwrites the following chords; shrinking clears the freed ones.
export function patternForChordOnly(song, eventId): Song;   // keep eventId's own, clear the rest of its block
export function patternForSection(song, sectionId, patternId: PatternId): Song;
export function patternForSong(song, patternId: PatternId): Song; // = old applyPattern({scope:'song'})
```

Also change these operations:

- `addChord`: after splicing, if the chord immediately before the new one has a usable own
  pattern, copy it onto the new event. This is the only `newEvent(` call site.
- `deleteStrumPattern`: drop the section clearing, so only events and `song.pattern` are cleared.
- `setPattern`: keep it. The lane's **Song default** select uses it.

`packages/song-store/src/index.ts`: replace the `applyPattern`/`clearOwnPattern` actions with
`setChordPatterns`, `setBlockPattern`, `setBlockLength`, `patternForChordOnly`,
`patternForSection` and `patternForSong`, each a `withCurrent` one-liner. Mirror them in the progression store
(`modules/progression/src/state/store.ts`), which wraps `songStore` the same way.

### 3.4 Playback and display (no cross-module imports; both modules call core)

- **`modules/progression/src/state/playback.ts`**
  - `toNoteStrikes`: replace `resolvePattern(song, sectionId, event)` with
    `chordPattern(song, event.id)`. For custom patterns, call
    `renderStrumPattern(p, upperCount, event.beats, phaseBeats)`.
  - `useLivePlaybackSync`: also compare `s.song.patterns !== prev.song.patterns`. Editing a pattern
    while playing doesn't update today.
- **`modules/progression/src/audio/patterns.ts`**: `renderStrumPattern(pattern, upperCount, beats,
  phaseBeats = 0)` passes the phase to `strumEvents`. Add a case to `patterns.test.ts`.
- **`modules/guitar/src/state/progressionPlayback.ts`** `progressionStrikes`: use
  `chordStrokes(song, event.id)` instead of `resolvePattern` + `strumEvents`. Keep the silent
  start marker.
- **`modules/guitar/src/components/ProgressionStrip.tsx`** (`StripChord`): use
  `const strokes = chordStrokes(song, event.id)`. Rendering is unchanged, so the arrows from
  commit 2e1b7c4 keep working and now show the right phase. Delete the local `sectionId` lookup.
- **Sheet music** never read patterns, so it needs no change.
- **`export/midi.ts`** uses `toNoteStrikes`, so it is covered.

## 4. What to delete and what to reuse

| Item | Action |
|---|---|
| `TransportBar` **Strum patterns** button, `patternsOpen`/`setPatternsOpen` in both module stores | Delete |
| `TransportBar` **Pattern** select in More playback settings (and `songPatterns`, `setPattern` imports there) | Delete. Its job moves to the lane's **Song default** select. |
| `App.tsx` `<PatternPanel>` block and its store selectors | Delete |
| `packages/ui/src/PatternPanel.tsx` (+ export in `index.ts`) | Delete after the new `PatternEditor` exists. Move `usage()` into the editor, rewritten for chords plus the song. |
| `ChordToolbar`'s `PatternSelect` + `inherited` calculation, `ChordSlot`'s `≋` marker and arrow drawing | Delete. Arrows move into the lane cell. |
| Guitar `StrumPatterns.tsx`, its button in `ProgressionStrip`'s `Transport`, and its render in `App.tsx` | Delete (open question Q3) |
| `PatternBuilder.tsx` | Reuse unchanged |
| `PatternSelect.tsx` | Reuse. Add an optional `onCreate?: (start: 'blank' \| string) => void`. When given, render an extra `<optgroup label="New pattern">` with values `new:blank` and `new:<preset name>`. Change the first option's text to the caller's `inheritLabel`. |
| New `packages/ui/src/PatternEditor.tsx` | `PatternBuilder` + **Duplicate pattern** + **Delete pattern** + usage line (`aria-live="polite"`). Props: `{ song, pattern, onSave, onDelete, onDuplicate, onPreview }`. Export it from `index.ts`. |
| `patterns.css` | Keep the `pb-*` rules. Delete `pb-panel` only if nothing else uses it. |

## 5. Implementation phases (each one is a commit, and each one stays green)

### Phase 1: core, additive (no behaviour change)

1. Add `phaseBeats` to `strumEvents`. Add `ownPattern`, `patternBlocks`, `blockOf`,
   `chordPattern` and `chordStrokes` to `patterns.ts`. For now `chordPattern` resolves with the
   *existing* three-level `patternIdFor`, so `own` = the chord's usable own pattern.
2. Add `setChordPatterns`, `setBlockPattern`, `setBlockLength`, `patternForChordOnly`,
   `patternForSection` and `patternForSong` to `operations.ts`. Export them from
   `packages/core/src/index.ts` if it doesn't re-export via `*`. It already does
   `export * from './patterns'`, so check `operations`.
3. Write the tests in §6.1 (except migration).

Commit message: `Core: pattern blocks, phase-aware strokes and block operations`.

### Phase 2: schema v3, migration, consumers switched

1. Make the §3.1 schema changes.
2. Change the `patternIdFor`/`resolvePattern` signatures (no `sectionId`), so `chordPattern` now
   uses two levels.
3. Make the `addChord` and `deleteStrumPattern` changes. Delete `applyPattern`, `clearOwnPattern`
   and `PatternTarget`.
4. Switch the song-store and progression store actions (§3.3).
5. Switch every consumer in §3.4. Typecheck finds the rest, including the temporary call sites
   below:
   - `Timeline.tsx` `ChordToolbar`: keep its `PatternSelect` for now, with per-chord semantics:
     `onChange={(id) => setChordPatterns(sectionId, i, i, id)}`, where `i` is the chord's index
     and `null` clears. Add a `setChordPatterns` action to both stores for this; it stays after
     Phase 4 for the guitar `StripToolbar`. The `inheritLabel` becomes
     `` `Song default (${patternLabel(song, song.pattern)})` ``.
   - `StripToolbar.tsx`: the same per-chord change and the same label.
   - `PatternPanel.tsx`: change its four apply buttons to `patternForChordOnly`-style calls. The
     simplest temporary mapping: Selected chord → `setChordPatterns(i,i)`, Rest of section →
     `setChordPatterns(i,last)`, Whole section → `patternForSection`, Entire song →
     `patternForSong`. Change `onApply` to take a callback per scope. Fix `usage()` (no sections).
     It is deleted in Phase 4, so keep the change minimal.
6. Fix the `schemaVersion` expectations: `packages/core/src/song.test.ts:37`, `schema.test.ts:35`,
   `packages/song-store/src/index.test.ts:38,61,68`.
7. Rewrite `patterns.test.ts` for the new API (§6.1).
8. Update `check:patterns` lines that assert `sections[0].pattern`. After **Whole section**, assert
   that every chord has the pattern instead.

Commit message: `Song schema v3: patterns live on chords; blocks keep their phase`.

### Phase 3: the progression pattern lane (the main UX change)

1. New file `modules/progression/src/components/PatternLane.tsx`:
   - `PatternLaneCell({ event, sectionId, index, count, shownBeats })`, rendered inside
     `ChordSlot`'s `<li>` under the chord block's `<div>`:
     - Its width is `shownBeats * BEAT_PX`. Export `BEAT_PX` from `Timeline.tsx` or move it to a
       tiny `timelineConstants.ts`. Its height is `h-9`.
     - It carries `data-lane-cell` and `data-block-start` / `data-block-end` attributes. Use
       `blockOf`.
     - A non-last cell of a block extends `0.5rem` into the `gap-2` (`margin-right: -0.5rem;
       width: calc(...)`) so the block reads as one bar. The bar-line border on the `li` crossing
       the lane is fine.
     - Arrows come from `chordStrokes(song, event.id, shownBeats)`. Use the old `ChordSlot` arrow
       markup, with `data-stroke` added for tests.
     - The resize-handle slider goes on the block's last cell. Copy the pointer pattern of
       `ChordSlot.onResizeDown`, but map `clientX` to a chord count by measuring
       `row.querySelectorAll('[data-lane-cell]')` rects from the block's start index. Call
       `setBlockLength` only when the count changes.
   - `PatternBlockToolbar({ section, eventId, onClose })`: the controls in §2.2. Use
     `PatternSelect` with `label="Block pattern"` and `onCreate`, plus `PatternEditor` when
     `patternEditorOpen`. The editor's `onPreview` calls the existing
     `previewStrumPattern(pattern, chord, attachments)` for the selected cell's chord.
2. Progression store:
   - Add `laneEventId: string | null` and `setLaneEvent(id)`.
   - `selectEvent` sets `laneEventId: null`.
   - Add `patternEditorOpen: boolean` and `setPatternEditorOpen`.
   - Remove `patternsOpen`/`setPatternsOpen`.
   - Removing a chord that is `laneEventId` clears it. Mirror how `selectedEventId` is handled at
     ~L191/207.
3. `Timeline.tsx`:
   - Render `PatternLaneCell` in `ChordSlot`.
   - Make the bottom staff always draw slashes.
   - Remove the `≋` marker, the `ChordToolbar` `PatternSelect` and its imports.
   - In `SectionBlock`, render `PatternBlockToolbar` instead of `ChordToolbar` when `laneEventId`
     is in this section.
4. Remove the **Strum patterns** button and the **Pattern** select from `TransportBar.tsx`.
   Remove `PatternPanel` and its selectors from `App.tsx`.
5. Add `PatternEditor.tsx` and the `PatternSelect` `onCreate` option in `@sw/ui`.
6. Do the help, guide and checks work in §6.3 and §6.2. They must land in this commit, because
   `check:help` fails otherwise.
7. Run `check:patterns`, `check:help`, `check:a11y`, `check:shell`, `check:addchord`,
   `check:circle`, `check:spacebar` and `check:perf`. The lane adds DOM per chord, so watch the
   chord-change frame time.

Commit message: `Strum patterns become a pattern lane under each section's chords`.

### Phase 4: guitar module strip-back and cleanup

1. Delete `modules/guitar/src/components/StrumPatterns.tsx`, its button in
   `ProgressionStrip.tsx`'s `Transport`, `patternsOpen`/`setPatternsOpen` in
   `modules/guitar/src/state/store.ts` and `App.tsx` L44/59, and the `.strum-patterns` CSS in
   `modules/guitar/src/styles/global.css` if it is unused.
2. Keep the `StripToolbar` per-chord `PatternSelect` (label **Strum pattern**, "Song default (X)").
3. Delete `packages/ui/src/PatternPanel.tsx` and its export. Remove its `UI_HELP` entries.
4. Remove the guitar `help.ts` `Strum patterns` entry. Update the guide's guitar section.
5. Update the guitar parts of `help-check.mjs`, `a11y-check.mjs` and `patterns-check.mjs`.

Commit message: `Guitar strip: drop the separate strum pattern panel`.

### Phase 5 (only if Prettier reformats anything): `npm exec prettier` on the touched files, as its own commit

## 6. Tests

### 6.1 Vitest (`packages/core`)

**`strumPattern.test.ts`, `strumEvents` with phase:**

- phase 0 equals the old output
- Folk (8 steps, 4 beats) over 2 beats at phase 2 gives the second half, with offsets rebased to 0
- phase 6 on a 4-beat pattern wraps and matches phase 2
- the last hit's duration runs to `chordBeats`
- `chordBeats <= 0` gives `[]`

**`patterns.test.ts` (rewrite):**

- `ownPattern` ignores a deleted custom id.
- `patternBlocks` for:
  - an all-default section: one block, `own` undefined
  - `[A,A,B,–]`: three blocks with the right `startIndex/endIndex/startBeat/beats`
  - an empty section: `[]`
- `chordPattern` phase: chords of 4, 2, 2 beats all with Folk give phases 0, 4, 6. A default run
  also accumulates phase.
- `chordStrokes`: null for a built-in pattern. The `beats` override shortens it.
- `resolvePattern`: own → song → `'block'`.

**`operations.test.ts`, or a new `patternOps.test.ts`:**

- `setBlockPattern` on a default run sets only that chord. On an own block it sets the whole
  block. `null` clears the block.
- `setBlockLength`:
  - grows over default chords
  - grows over another block, overwriting it
  - clamps at the section end
  - shrinks and frees chords to the default
  - does nothing on a default run
  - `chords < 1` clamps to 1
- `patternForChordOnly`, `patternForSection`, and `patternForSong` (clears all own patterns).
- A custom id that doesn't exist is ignored by every op.
- `addChord` after a chord with its own pattern inherits it. After a default chord, it doesn't.
  With `afterEventId: null` it appends after the last chord and inherits.
- `deleteStrumPattern` clears chords and the song default.
- `duplicateEvent` and `moveEvent` carry `pattern`.

**`schema.test.ts`, migration:**

- A v2 fixture with `sections[0].pattern = 'custom:x'`, one event with its own `'strum-down'`, and
  one without, gives `schemaVersion 3`. The event without its own pattern gets `'custom:x'`, the
  own one is kept, and `section.pattern` is absent.
- A v2 section pattern equal to the song pattern is *not* folded.
- An unknown or deleted section pattern is dropped.
- A v3 input with a stray `section.pattern` ignores it.
- The v1 fixture still migrates.

`song-store/src/index.test.ts`: the legacy import ends at v3. One action round-trip:
`patternForSection` → the store song has the pattern on every chord.

`modules/progression/src/audio/patterns.test.ts`: `renderStrumPattern(..., phaseBeats)` equals
`strumEvents` with that phase.

### 6.2 Browser checks

- **`apps/web/scripts/patterns-check.mjs`:** rewrite the progression half per the script outline
  below. Keep the step-editing assertions as they are, since `PatternBuilder` is unchanged. Delete
  every `'Strum patterns'` click and the `Selected chord`/`Rest of section`/`Entire song` buttons.
  Use these helpers:
  - `lane = (i) => page.getByRole('button', { name: /^Pattern for / }).nth(i)`
  - `blockSelect = page.getByLabel('Block pattern')`
- **`help-check.mjs` L132–139 and L152–158:**
  - Replace the 'Strum patterns' flow with: click `lane(0)`, select `new:Folk (D, DU, UDU)`, click
    `Step 2 of 8`, then `audit('progression: pattern block and editor')`.
  - Also audit with a default cell selected (`audit('progression: song default block')`).
  - Delete the guitar builder audit and keep the guitar chord-toolbar audit.
- **`a11y-check.mjs` L99–107:** the same flow. Axe both themes on "pattern lane with block
  selected and editor open". Keyboard: focus the handle and press ArrowRight; the block grows.
  Tab reaches each lane cell.
- **Others:** grep `apps/web/scripts` for `Strum patterns`, `getByLabel('Pattern')`, `≋` and
  `span[title$="strum"]`, and update any you find. `check:perf`: confirm the budget still passes
  with the lane rendered.

Script outline for the progression half of `patterns-check.mjs`:

```
new song with 3 chords → 3 lane cells, all "song default"
lane(0) → toolbar group "Pattern block" visible; choose new:Folk → patterns.length 1,
  events[0].pattern custom, events[1..2] none, PatternBuilder visible (Pattern name input)
[existing step-edit assertions]
drag handle (page.mouse from handle centre to lane(2) centre) → all 3 chords custom
focus handle, ArrowLeft → events[2].pattern undefined; ArrowRight → restored
'− Shorter block' / '+ Longer block' buttons do the same
phase: set beats 4,2,2 via __songwriting.store; strikes for chord 2 offsets (minus its
  start) equal strumEvents(pattern, 2, 4) offsets   (compute expected in page via __songwriting? —
  add `chordStrokes` to the window.__songwriting debug hook in modules/progression/src/index.ts)
lane arrows: count of [data-lane-cell] [data-stroke] === total strokes; chord blocks have none
'Just this chord' on lane(1) → only events[1] own
'Whole section' → all own; 'Whole song' → song.pattern custom, no own patterns
'Remove pattern' → back to default; Escape closes toolbar
add a chord after a patterned chord → it inherits
reload → persisted, schemaVersion 3
no 'Strum patterns' button anywhere in the progression module
mobile viewport 390×844: tap lane(0), toolbar in viewport, '+ Longer block' works
guitar: strip arrows (phase-correct count for chord 2), progressionStrikes, StripToolbar
  'Strum pattern' select sets own pattern, no 'Strum patterns' button, delete via editor back in
  progression → patterns removed and chords default
no console errors
```

Debug hook: add `chordStrokes` and `patternBlocks` to `window.__songwriting` in
`modules/progression/src/index.ts`, next to `strikes`. Update the `CLAUDE.md` "Debug hooks" line
for `__songwriting`.

### 6.3 Help and guide

**`modules/progression/src/help.ts`:**

- Remove `p('Strum patterns', …)` and `p('Pattern', …)`.
- Edit 'More playback settings' to "…time signature, instrument, metronome and volume."
- Add these entries:

| Name | Text |
|---|---|
| `/^Pattern for /` | The strum pattern lane. Select a block to change its pattern, how many chords it covers, or where else it plays. |
| `/^Chords in .+ block$/` | Drag, or use the arrow keys, to make this pattern block cover more or fewer chords. |
| `'Block pattern'` | Choose what this block plays: a built-in pattern, one of yours, or a new one. |
| `'Edit pattern'` | Show or hide the editor for this block's strum pattern. |
| `'− Shorter block'` / `'+ Longer block'` | Make the block cover one chord fewer, or one more. |
| `'Just this chord'` | Keep this pattern on the selected chord only. The rest of the block goes back to the song default. |
| `'Whole section'` | Use this pattern for every chord in the section. |
| `'Whole song'` | Make this the song's default pattern and clear every other block. |
| `'Remove pattern'` | Remove this block. Its chords go back to the song default. |
| `'Song default'` | Choose the pattern for every chord that has no block of its own. |
| `'Close pattern block'` (the × `aria-label`) | Close the block's options. |

Use the exact accessible names you render. The toolbar and editor names must not collide with
`ChordToolbar`'s (`Duplicate`, `Remove`), and `Remove pattern` is distinct from `Remove`.

**`packages/ui/src/uiHelp.ts`:**

- Remove `Pattern to edit`, `New pattern from`, `Selected chord`, `Rest of section`,
  `Whole section` and `Entire song`. The module entries replace them.
- Keep the builder entries plus `Duplicate pattern`/`Delete pattern`, and change the latter to
  "…anything using it goes back to the song default."
- Change `Strum pattern` to "Choose the strum pattern for this chord, or the song default."
- Change `▶ Preview` to "…on the selected block's chord."

**`apps/web/src/shell/guide/content.ts`** (Google developer style: second person, present tense,
sentence-case headings, **bold** controls):

- L90: remove the **Strum pattern** bullet from "Edit a chord".
- L102–112: rewrite as "Add strum patterns". The section covers:
  - the lane under each section's chords
  - selecting a block
  - **Block pattern** (including **New pattern**)
  - **Edit pattern**, with the builder bullets kept
  - dragging the handle or **+ Longer block**/**− Shorter block**
  - **Just this chord** / **Whole section** / **Whole song**
  - **Remove pattern**
  - **Song default**
  - that a pattern repeats from the block's start across its chords
  - that a new chord continues the block before it
- L119: drop "pattern".
- L144–145, guitar: "Build and place patterns in the Progression tab's pattern lane. **Strum
  pattern** in the toolbar sets the selected chord's pattern…"

## 7. Risks and open questions (recommended default in bold)

1. **Q1. Phase anchor.** Should a pattern loop from the block's start or align to bar lines? A
   block that starts mid-bar after a 2-beat chord differs.
   **Recommendation: the block start.** It matches the "clip" mental model and the lane shows
   exactly where the strokes fall. Bar alignment is a one-line change in `chordPattern` later.
2. **Q2. New-chord inheritance.** Should a chord added after a patterned chord extend that block?
   **Recommendation: yes.** Adding a chord to a strummed verse keeps strumming. It's visible
   immediately and one click to shrink.
3. **Q3. The guitar module's builder.** Should the guitar module keep its own builder?
   **Recommendation: no.** Keep only the per-chord **Strum pattern** select and build patterns in
   the Progression lane. A shared lane in the guitar strip can come later via `@sw/ui` if wanted.
4. **Q4. Drag-to-paint on empty lane cells.** The user's "click-and-drag" could mean painting a
   new block across a range on empty lane cells.
   **Recommendation: not in this change.** Tap, pick, then drag the handle covers it with one
   gesture model. Painting adds a pointer mode that conflicts with horizontal scrolling on touch.
5. **Q5. Restarting a pattern inside a block, or two touching blocks with the same pattern.**
   **Recommendation: not supported.** Touching blocks with the same pattern merge. Adding a
   `patternRestart` flag later is cheap if asked for.
6. **Q6. Mid-chord pattern changes.**
   **Recommendation: disallowed.** Split the chord into two chord blocks if needed.
7. **Risk: different sound.** Old songs with short chords sound different (§3.1). This is the
   accepted fix. Call it out in the release note or guide.
8. **Risk: performance and layout.** One extra button and slider per chord, and arrows now rendered
   in the lane. Watch `check:perf` (chord change in song context). If it regresses, memoise
   `patternBlocks(song, sectionId)` per section in `SectionBlock` and pass the block down as a
   prop rather than calling `blockOf` per cell.
9. **Risk: the old **Pattern** transport select made built-in arpeggio styles easy to find.** They
   now live under **Song default** and **Block pattern**. The guide must say so.
10. **Risk: dnd-kit.** The lane cell sits inside the sortable `<li>`, but sortable `listeners` stay
    on the chord button only. Do not spread them onto the `li`, or tapping a lane cell starts a
    chord drag.
