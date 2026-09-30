# Feature brief: add any built chord to the progression (from the guitar module)

Status: **not started. Discuss with the owner first.** They said there is more they want to do here,
so treat this as context and a starting map, not a finished spec. Do not implement until they have
said what else they want.

## The request (owner's words, 2026-09-30)

> I want to be able to add any built chord to a progression in the guitar module, e.g. a chord I
> build in Identify mode, and then move over to progression mode again and find appropriate chords
> to add to the progression etc.

So the workflow is: work out or build a chord on the neck (Chords tab, or tap notes in Identify),
add it to the song's progression, switch to the Progression module, and get suggestions for what
should come after it.

## What already exists (verified in the code)

Much of the plumbing is there. The gap is mainly a way to add the chord you are currently looking
at, from the tabs where you build or identify it.

- **The guitar module can already edit the song.** `modules/guitar/src/state/progressionEdits.ts`
  has `addChordAfter(afterEventId, chord, intoSectionId?)`, `replaceChord`, `setChordFlavour`, etc.
  They go through `songStore` (so both modules share one song), record an undo step, then focus
  and strum the new chord.
- **A "Build any chord" control exists, but only in the strip toolbar.**
  `modules/guitar/src/components/StripToolbar.tsx` (`BuildAnyChord`) offers a root plus the full
  rich builder (`ChordBuilderChips`) and a "Use <chord>" button. It is reached from the strip's
  "Add after" / "+ Add chord" panel, only in song context, and only for a chord you pick there.
- **Converting a built chord to a song chord already exists:** `fromChordSpec(spec, key)` in
  `packages/core/src/convert.ts` turns a guitar-side `ChordSpec` (root pitch class, quality,
  extensions, alterations, bass) into a `ChordRef`, spelling the root in the song's key and computing
  the numeral and `origin` (diatonic / borrowed / secondary). `chordFromBuilder(spec)` is what the
  strip toolbar uses to call it.
- **Identify can already hand a chord to the Chords tab.** `modules/guitar/src/state/identifyActions.ts`
  `sendToChordMode()` reads the best reading of the picked notes (`readSelection`), loads it into the
  chord builder with the picked shape as the active voicing (`setAdoptShape`), and switches to the
  Chords tab. It refuses anything that is not a valid chord (a lone note or an interval).
- **Committing a voicing exists.** `commitCurrentVoicing()` in
  `modules/guitar/src/state/progressionChordActions.ts` commits the shape shown on the neck to the
  focused event (`songStore.commitVoicing`) and updates the chord's inversion if the bass is not the
  root. It only works when a progression event is focused (`progressionEventId` set).
- **Progression suggestions centre on the selected event.** In
  `modules/progression/src/state/store.ts` the centre of the chord map is the selected event, or the
  currently playing one. So once the new chord is an event and is selected, the Progression module
  already suggests what comes next from it. The open question is how the selection carries across
  modules (see below).

## What is missing

1. An **"Add to progression"** action on the Chords tab and on Identify, for the chord currently
   built or identified (and ideally its current shape as the committed voicing). Today you must go
   through the strip toolbar and rebuild the chord there.
2. A decision on **where it goes**: after the focused event, at the end of the active section, or
   into a chosen section. `addChordAfter` already takes `afterEventId` or a section id.
3. **Tool mode** (`#/tools/guitar`, no song open): the button should be absent or offer to start a
   song. `songId` is null there.
4. **Selection hand-off** so that switching to the Progression module lands on the new chord with
   suggestions ready. Check that `selectEvent` (progression store) is set when the guitar module adds
   the chord, or that the progression module picks up the last-added event on activation. Modules
   must not import each other, so this goes through the song store, `core`, or the shell's
   `navigate({ module, songId, eventId })` (the `focus.eventId` prop in `ModuleProps` already exists
   for this).
5. Possibly an **Identify-specific path**: add the identified chord and commit the picked shape as
   its voicing in one step.

## Things to check or decide with the owner before building

- Where should "Add to progression" live on each tab, and what should it be called?
- Identify can name things that are not triads (intervals, power chords, clusters). Only valid chords
  can be sent today. Should non-chords be addable some other way?
- Which section and position should a new chord go into by default?
- Should the added chord get the picked shape as its committed voicing automatically?
- How should the `ChordRef` look for a chord outside the key (`origin`, `numeral`)? `fromChordSpec`
  defaults to `origin: 'diatonic'` and then `relabel`s; confirm borrowed and secondary chords come
  out right for the progression module's colours and suggestion engine.
- Anything else the owner wants in this area (they said there is more).

## Constraints from CLAUDE.md that apply

- Pure logic (the mapping from a built or identified chord to a `ChordRef`, and where it is
  inserted) belongs in `packages/core` as a function that takes and returns data, with its own test.
  The stores and components only call it. `fromChordSpec` is the existing example.
- A module never imports another module. Cross-module navigation goes through the shell's
  `navigate()`; shared behaviour goes in `core`, `song-store` or `ui`.
- A new control needs a help entry in `modules/guitar/src/help.ts` (`npm run check:help` fails
  otherwise). If the change alters what the app does, update `apps/web/src/shell/guide/content.ts`
  (second person, present tense, sentence-case headings, **bold** control names).
- Checks to run: `npm test`, `npm run typecheck`, then at least `check:help`, `check:a11y`,
  `check:song-guitar`, `check:chords`, `check:identify`, `check:shell`. The audio-output assertions in
  `check:chords`, `check:identify` and `check:song-guitar` fail on this Mac for environmental reasons,
  so judge those by the non-audio lines.
- The UI is the Manuscript design (branch `design/manuscript`, see `docs/manuscript-redesign.md`):
  italic for actions, pill buttons only for primary actions, hairlines instead of boxes, colours via
  tokens in `packages/ui/src/tokens.css`.

## Suggested first steps

1. Talk through the open questions above with the owner.
2. Write the pure function and its test in `packages/core` (chord or shape to `ChordRef`, plus the
   insertion choice).
3. Add the action next to `addChordAfter` in `progressionEdits.ts`, then the buttons on the Chords
   and Identify tabs, with help entries.
4. Verify the hand-off into the Progression module in the browser (add in Identify, switch module,
   confirm suggestions centre on the new chord), and add a browser check for it.
