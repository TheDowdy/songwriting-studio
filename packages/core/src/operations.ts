/**
 * Pure song operations (§3.2, §7 Phase 1): every mutation a store can make to a `Song`, moved out
 * of PB's original `store.ts` so both the progression and guitar modules (and their stores) share
 * one implementation. None of these touch UI-only state (selection, playback, replace target…) —
 * that stays in each app's own thin store wrapper.
 */
import { Interval } from 'tonal';
import { sanitizeCapo } from './fret/capo';
import { isValidStrings } from './fret/tunings';
import { relabel, transposeChord } from './theory/chords';
import type { ChordRef, Key } from './theory/types';
import { findEvent, newEvent, newId, newSection, withSection } from './song';
import { customPatternId, type StrumPattern } from './strumPattern';
import { blockOf, usable } from './patterns';
import { generateVariantShapes, variantLabelFor, type VariantGeneratorId, type VariantOptions } from './variants';
import type { ChordAttachments, ChordEvent, GuitarSetup, GuitarVoicing, InstrumentId, PatternId, Section, Song, TimeSig } from './schema';

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const BEATS_MIN = 1;
export const BEATS_MAX = 32;

const touch = (song: Song): Song => ({ ...song, updatedAt: Date.now() });
const clampBeats = (n: number) => Math.max(BEATS_MIN, Math.min(BEATS_MAX, Math.round(n) || BEATS_MIN));

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (item === undefined) return arr;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

function deepCopyAttachments(a: ChordAttachments | undefined): ChordAttachments | undefined {
  if (!a) return undefined;
  return { ...(a.guitar ? { guitar: { ...a.guitar, frets: [...a.guitar.frets], tuning: [...a.guitar.tuning] } } : {}) };
}

// ------------------------------------------------------------------ events

/** Insert `chord` into `sectionId` right after `afterEventId` (start of the section if null/not
 *  found), and return the new event's id so the caller can select it. */
export function addChord(
  song: Song,
  sectionId: string,
  afterEventId: string | null,
  chord: ChordRef,
): { song: Song; eventId: string } {
  const active = song.sections.find((s) => s.id === sectionId) ?? song.sections[0];
  if (!active) return { song, eventId: '' };
  const event = newEvent(chord);
  const at = afterEventId ? active.events.findIndex((e) => e.id === afterEventId) : -1;
  const events = [...active.events];
  const insertAt = at < 0 ? events.length : at + 1;
  // A chord added after one with its own pattern continues that block.
  const before = events[insertAt - 1];
  if (before && usable(song, before.pattern)) event.pattern = before.pattern;
  events.splice(insertAt, 0, event);
  return { song: withSection(song, active.id, { ...active, events }), eventId: event.id };
}

export function removeEvent(song: Song, id: string): Song {
  const found = findEvent(song, id);
  if (!found) return song;
  const { section } = found;
  const events = section.events.filter((e) => e.id !== id);
  return withSection(song, section.id, { ...section, events });
}

/** Insert a copy of event `id` right after it (fresh id, attachments deep-copied). */
export function duplicateEvent(song: Song, id: string): { song: Song; eventId: string } {
  const found = findEvent(song, id);
  if (!found) return { song, eventId: '' };
  const { section, index } = found;
  const source = section.events[index] as ChordEvent;
  const copy: ChordEvent = { ...source, id: newId(), attachments: deepCopyAttachments(source.attachments) };
  const events = [...section.events.slice(0, index + 1), copy, ...section.events.slice(index + 1)];
  return { song: withSection(song, section.id, { ...section, events }), eventId: copy.id };
}

/** Replace a placed event's chord in place (flavor, inversion, or an entirely different chord). */
export function setEventChord(song: Song, id: string, chord: ChordRef): Song {
  const found = findEvent(song, id);
  if (!found) return song;
  const { section, index } = found;
  const events = section.events.map((e, i) => (i === index ? { ...e, chord } : e));
  return withSection(song, section.id, { ...section, events });
}

export function setEventBeats(song: Song, id: string, beats: number): Song {
  const found = findEvent(song, id);
  if (!found) return song;
  const { section, index } = found;
  const events = section.events.map((e, i) => (i === index ? { ...e, beats: clampBeats(beats) } : e));
  return withSection(song, section.id, { ...section, events });
}

/** Like `setEventBeats`, but relative to the event's current beats — safe to call from rapid
 *  repeated clicks, unlike `setEventBeats(song, id, event.beats + delta)` from a stale read. */
export function adjustEventBeats(song: Song, id: string, delta: number): Song {
  const found = findEvent(song, id);
  if (!found) return song;
  const { section, index } = found;
  const events = section.events.map((e, i) => (i === index ? { ...e, beats: clampBeats(e.beats + delta) } : e));
  return withSection(song, section.id, { ...section, events });
}

export function reorderEvents(song: Song, sectionId: string, fromIndex: number, toIndex: number): Song {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section) return song;
  return withSection(song, sectionId, { ...section, events: move(section.events, fromIndex, toIndex) });
}

export function moveEvent(song: Song, eventId: string, toSectionId: string, toIndex: number): Song {
  const found = findEvent(song, eventId);
  const to = song.sections.find((s) => s.id === toSectionId);
  if (!found || !to) return song;
  const event = found.section.events[found.index] as ChordEvent;
  const fromEvents = found.section.events.filter((e) => e.id !== eventId);
  let next = withSection(song, found.section.id, { ...found.section, events: fromEvents });
  const toSection = found.section.id === toSectionId ? { ...found.section, events: fromEvents } : to;
  const toEvents = [...toSection.events];
  toEvents.splice(Math.max(0, Math.min(toIndex, toEvents.length)), 0, event);
  next = withSection(next, toSectionId, { ...toSection, events: toEvents });
  return next;
}

export function clearSection(song: Song, sectionId: string): Song {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section) return song;
  return withSection(song, sectionId, { ...section, events: [] });
}

// ------------------------------------------------------------------ sections

export function addSection(song: Song, name?: string): { song: Song; sectionId: string } {
  const section = newSection(name ?? `Section ${song.sections.length + 1}`);
  const next = touch({ ...song, sections: [...song.sections, section], arrangement: [...song.arrangement, section.id] });
  return { song: next, sectionId: section.id };
}

export function renameSection(song: Song, id: string, name: string): Song {
  const section = song.sections.find((s) => s.id === id);
  if (!section) return song;
  return withSection(song, id, { ...section, name: name.trim() || section.name });
}

/** Copy a section's chords (fresh ids, attachments deep-copied) right after its source, and put
 *  the copy in the arrangement right after the source's first slot. */
export function duplicateSection(song: Song, id: string): { song: Song; sectionId: string } {
  const at = song.sections.findIndex((s) => s.id === id);
  if (at < 0) return { song, sectionId: '' };
  const source = song.sections[at] as Section;
  const clone: Section = {
    ...source,
    id: newId(),
    name: `${source.name} copy`,
    events: source.events.map((e) => ({ ...e, id: newId(), attachments: deepCopyAttachments(e.attachments) })),
    variantOf: undefined,
    variantLabel: undefined,
  };
  const sections = [...song.sections.slice(0, at + 1), clone, ...song.sections.slice(at + 1)];
  const arrangement = [...song.arrangement];
  const inArr = arrangement.indexOf(id);
  arrangement.splice(inArr < 0 ? arrangement.length : inArr + 1, 0, clone.id);
  return { song: touch({ ...song, sections, arrangement }), sectionId: clone.id };
}

/** A plain copy of a section (§3.2 "Variants"): like `duplicateSection`, but tagged with
 *  `variantOf`/`variantLabel` and never following later edits to the original. */
export function makeVariant(song: Song, id: string, label = 'Variant'): { song: Song; sectionId: string } {
  const { song: withCopy, sectionId } = duplicateSection(song, id);
  if (!sectionId) return { song, sectionId: '' };
  const copy = withCopy.sections.find((s) => s.id === sectionId) as Section;
  const tagged: Section = { ...copy, name: `${(song.sections.find((s) => s.id === id) as Section).name} (${label})`, variantOf: id, variantLabel: label };
  return { song: withSection(withCopy, sectionId, tagged), sectionId };
}

/** Overwrites a section's guitar voicings with a generator's shapes for its own chords (Phase 8
 *  item 2): every event gets a fresh `attachments.guitar` (or none, if no shape was playable). */
function voiceSection(song: Song, sectionId: string, generator: VariantGeneratorId, options: VariantOptions): Song {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section) return song;
  const shapes = generateVariantShapes(section.events.map((e) => e.chord), song.guitar.tuning, song.guitar.capo, generator, options);
  const events = section.events.map((e, i) => {
    const shape = shapes[i];
    if (!shape) {
      if (!e.attachments?.guitar) return e;
      const { guitar, ...rest } = e.attachments;
      void guitar;
      return { ...e, attachments: Object.keys(rest).length > 0 ? rest : undefined };
    }
    const guitar: GuitarVoicing = { frets: shape.frets.slice(), tuning: [...song.guitar.tuning], capo: song.guitar.capo, source: 'recommended' };
    return { ...e, attachments: { ...e.attachments, guitar } };
  });
  return withSection(song, sectionId, { ...section, events });
}

/**
 * "Make variant" (Phase 8 item 1): a plain copy of a section (`makeVariant`), then voiced by one
 * of the generators in `variants.ts` — every chord's diagram in the copy reflects the generator's
 * choice, independent of whatever the source section's chords were voiced with.
 */
export function makeVariantWithGenerator(
  song: Song,
  id: string,
  generator: VariantGeneratorId,
  options: VariantOptions = {},
): { song: Song; sectionId: string } {
  const label = variantLabelFor(generator, options);
  const { song: withCopy, sectionId } = makeVariant(song, id, label);
  if (!sectionId) return { song, sectionId: '' };
  return { song: voiceSection(withCopy, sectionId, generator, options), sectionId };
}

export function removeSection(song: Song, id: string): Song {
  if (song.sections.length <= 1) return song;
  const sections = song.sections.filter((s) => s.id !== id);
  const arrangement = song.arrangement.filter((sid) => sid !== id);
  const first = sections[0] as Section;
  return touch({ ...song, sections, arrangement: arrangement.length ? arrangement : [first.id] });
}

export function setSectionRepeat(song: Song, id: string, repeat: number): Song {
  const section = song.sections.find((s) => s.id === id);
  if (!section) return song;
  return withSection(song, id, { ...section, repeat: Math.max(1, Math.min(16, Math.round(repeat) || 1)) });
}

export function reorderSections(song: Song, fromIndex: number, toIndex: number): Song {
  return touch({ ...song, sections: move(song.sections, fromIndex, toIndex) });
}

// ------------------------------------------------------------------ arrangement

export function setArrangement(song: Song, arrangement: string[]): Song {
  return touch({ ...song, arrangement });
}

export function addArrangementSlot(song: Song, sectionId: string): Song {
  return touch({ ...song, arrangement: [...song.arrangement, sectionId] });
}

export function removeArrangementSlot(song: Song, index: number): Song {
  if (song.arrangement.length <= 1) return song;
  return touch({ ...song, arrangement: song.arrangement.filter((_, i) => i !== index) });
}

export function reorderArrangement(song: Song, fromIndex: number, toIndex: number): Song {
  return touch({ ...song, arrangement: move(song.arrangement, fromIndex, toIndex) });
}

// ------------------------------------------------------------------ song-level settings

export type KeyChangeMode = 'transpose' | 'relabel';

/** Change the song's key: `'transpose'` moves every chord by the same interval (numerals stay
 *  the same); `'relabel'` keeps every chord's notes and recomputes its numeral/origin for the new
 *  key. A transpose clears guitar attachments on the moved events — the old shape no longer fits
 *  the new notes. */
export function changeKey(song: Song, key: Key, how: KeyChangeMode): Song {
  // A section with its own key is a deliberate modulation: it keeps its key and its chords, and only
  // the sections that follow the song's key move with it.
  const sections = song.sections.map((section) =>
    section.key ? section : { ...section, events: rekeyEvents(section.events, song.key, key, how) },
  );
  return touch({ ...song, key, sections });
}

/** Moves a section's chords from one key to another (see `changeKey` for the two modes). */
function rekeyEvents(events: ChordEvent[], from: Key, to: Key, how: KeyChangeMode): ChordEvent[] {
  const shift = how === 'transpose' ? Interval.distance(from.tonic, to.tonic) : null;
  return events.map((e) => ({
    ...e,
    chord: shift ? transposeChord(e.chord, shift, to) : relabel(e.chord, to),
    attachments: shift ? undefined : e.attachments,
  }));
}

/**
 * Change one section's key (a modulation), leaving every other section alone. `key` null returns the
 * section to the song's key; choosing the song's own key does the same. The modes are those of
 * `changeKey`: 'transpose' moves the section's chords by the same interval (numerals stay the same),
 * 'relabel' keeps the notes and recomputes numerals for the new key.
 */
export function changeSectionKey(song: Song, sectionId: string, key: Key | null, how: KeyChangeMode): Song {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section) return song;
  const from = section.key ?? song.key;
  const to = key ?? song.key;
  const inherits = !key || (key.tonic === song.key.tonic && key.mode === song.key.mode);
  const { key: _old, ...rest } = section;
  void _old;
  const events = from.tonic === to.tonic && from.mode === to.mode ? section.events : rekeyEvents(section.events, from, to, how);
  return withSection(song, sectionId, inherits ? { ...rest, events } : { ...rest, events, key: to });
}

export function setBpm(song: Song, bpm: number): Song {
  return touch({ ...song, bpm: Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm) || song.bpm)) });
}

export function setTimeSig(song: Song, timeSig: TimeSig): Song {
  return touch({ ...song, timeSig });
}

export function setInstrument(song: Song, instrument: InstrumentId): Song {
  return touch({ ...song, instrument });
}

export function setPattern(song: Song, pattern: PatternId): Song {
  return touch({ ...song, pattern });
}

// ------------------------------------------------------------------ strum patterns

/** Adds a strum pattern to the song, or replaces the one with the same id. */
export function saveStrumPattern(song: Song, pattern: StrumPattern): Song {
  const existing = song.patterns ?? [];
  const patterns = existing.some((p) => p.id === pattern.id) ? existing.map((p) => (p.id === pattern.id ? pattern : p)) : [...existing, pattern];
  return touch({ ...song, patterns });
}

/** Removes a strum pattern. Anything that used it (the song, a chord) goes back to the song default. */
export function deleteStrumPattern(song: Song, id: string): Song {
  const custom = customPatternId(id);
  const patterns = (song.patterns ?? []).filter((p) => p.id !== id);
  const clear = <T extends { pattern?: PatternId }>(x: T): T => {
    if (x.pattern !== custom) return x;
    const { pattern: _p, ...rest } = x;
    void _p;
    return rest as T;
  };
  const sections = song.sections.map((section) => ({ ...section, events: section.events.map(clear) }));
  const { patterns: _old, ...base } = song;
  void _old;
  return touch({ ...base, ...(patterns.length > 0 ? { patterns } : {}), pattern: song.pattern === custom ? 'block' : song.pattern, sections });
}

// ---- pattern lane operations: a chord's own pattern is the only stored level; blocks are derived

/**
 * Sets (or with null clears) the own pattern of the chords `fromIndex`..`toIndex` of a section,
 * clamped to the section. A custom pattern that does not exist is ignored.
 */
export function setChordPatterns(song: Song, sectionId: string, fromIndex: number, toIndex: number, patternId: PatternId | null): Song {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section || section.events.length === 0) return song;
  if (patternId !== null && !usable(song, patternId)) return song;
  const from = Math.max(0, Math.min(fromIndex, toIndex));
  const to = Math.min(section.events.length - 1, Math.max(fromIndex, toIndex));
  let changed = false;
  const events = section.events.map((e, i) => {
    if (i < from || i > to) return e;
    if (patternId === null) {
      if (e.pattern === undefined) return e;
      changed = true;
      const { pattern: _p, ...rest } = e;
      void _p;
      return rest;
    }
    if (e.pattern === patternId) return e;
    changed = true;
    return { ...e, pattern: patternId };
  });
  return changed ? withSection(song, sectionId, { ...section, events }) : song;
}

/**
 * Sets the pattern of the block `eventId` is in. A block that has a pattern changes as a whole; a
 * default run changes only that chord (it becomes a one-chord block). null clears the whole block.
 */
export function setBlockPattern(song: Song, eventId: string, patternId: PatternId | null): Song {
  const found = findEvent(song, eventId);
  const block = blockOf(song, eventId);
  if (!found || !block) return song;
  if (patternId === null) return setChordPatterns(song, found.section.id, block.startIndex, block.endIndex, null);
  return block.own === undefined
    ? setChordPatterns(song, found.section.id, found.index, found.index, patternId)
    : setChordPatterns(song, found.section.id, block.startIndex, block.endIndex, patternId);
}

/**
 * Makes the block `eventId` is in cover `chords` chords from its start (at least 1, at most to the
 * section's end). Growing paints over the following chords; shrinking returns the freed chords to
 * the default. Does nothing for a default run.
 */
export function setBlockLength(song: Song, eventId: string, chords: number): Song {
  const found = findEvent(song, eventId);
  const block = blockOf(song, eventId);
  if (!found || !block || block.own === undefined) return song;
  const last = found.section.events.length - 1;
  const end = block.startIndex + Math.max(1, Math.min(Math.round(chords) || 1, last - block.startIndex + 1)) - 1;
  if (end === block.endIndex) return song;
  if (end > block.endIndex) return setChordPatterns(song, found.section.id, block.endIndex + 1, end, block.own);
  return setChordPatterns(song, found.section.id, end + 1, block.endIndex, null);
}

/** Keeps the pattern on this chord only; the rest of its block goes back to the default. */
export function patternForChordOnly(song: Song, eventId: string): Song {
  const found = findEvent(song, eventId);
  const block = blockOf(song, eventId);
  if (!found || !block || block.own === undefined) return song;
  const rest = block.eventIds.filter((id) => id !== eventId);
  return rest.reduce((acc, id) => setChordPatterns(acc, found.section.id, found.section.events.findIndex((e) => e.id === id), found.section.events.findIndex((e) => e.id === id), null), song);
}

/** Every chord in the section gets the pattern. */
export function patternForSection(song: Song, sectionId: string, patternId: PatternId): Song {
  const section = song.sections.find((s) => s.id === sectionId);
  return section ? setChordPatterns(song, sectionId, 0, section.events.length - 1, patternId) : song;
}

/** The pattern becomes the song's default and every chord's own choice is cleared. */
export function patternForSong(song: Song, patternId: PatternId): Song {
  if (!usable(song, patternId)) return song;
  return touch({
    ...song,
    pattern: patternId,
    sections: song.sections.map((s) => ({
      ...s,
      events: s.events.map((e) => {
        const { pattern: _p, ...rest } = e;
        void _p;
        return rest;
      }),
    })),
  });
}

export function setTitle(song: Song, title: string): Song {
  return touch({ ...song, title });
}

// ------------------------------------------------------------------ guitar setup (§7 Phase 3 item 4)

/**
 * Sets the song's tuning (the pegs and presets, edited through the guitar module in song context —
 * never the tool's own persisted tuning). Invalid input (wrong string count, out-of-range MIDI) is
 * ignored rather than corrupting the song; `tuningName` replaces the stored name, or clears it when
 * omitted, so switching back to an unnamed/preset tuning doesn't keep an old custom name.
 */
export function setGuitarTuning(song: Song, tuning: readonly number[], tuningName?: string): Song {
  if (!isValidStrings(tuning)) return song;
  const guitar: GuitarSetup = { tuning: [...tuning], capo: song.guitar.capo };
  if (tuningName) guitar.tuningName = tuningName;
  return touch({ ...song, guitar });
}

/** Sets the song's capo (0–12). */
export function setGuitarCapo(song: Song, capo: number): Song {
  return touch({ ...song, guitar: { ...song.guitar, capo: sanitizeCapo(capo) } });
}

// ------------------------------------------------------------------ guitar attachments (§3.2/§4)

/** Commit a voicing to a chord event. Shows a mini diagram in both modules (Phase 5). */
export function commitVoicing(song: Song, eventId: string, voicing: GuitarVoicing): Song {
  const found = findEvent(song, eventId);
  if (!found) return song;
  const { section, index } = found;
  const events = section.events.map((e, i) =>
    i === index ? { ...e, attachments: { ...e.attachments, guitar: voicing } } : e,
  );
  return withSection(song, section.id, { ...section, events });
}

/** Remove a chord event's committed voicing (it goes back to the best/generated shape). */
export function clearVoicing(song: Song, eventId: string): Song {
  const found = findEvent(song, eventId);
  if (!found) return song;
  const { section, index } = found;
  const events = section.events.map((e, i) => {
    if (i !== index || !e.attachments) return e;
    const { guitar, ...rest } = e.attachments;
    void guitar;
    const hasRest = Object.keys(rest).length > 0;
    return { ...e, attachments: hasRest ? rest : undefined };
  });
  return withSection(song, section.id, { ...section, events });
}

/** Also apply `setEventChord` and clear that event's guitar voicing in one step, for callers
 *  (the guitar module, Phase 6) that replace a chord's flavor from the rich builder and know the
 *  old shape can no longer be assumed to fit. Song-level parity with PB's own `setEventChord`
 *  (which leaves attachments alone — flavor changes there go through the progression UI, which
 *  decides for itself whether to keep or clear the voicing). */
export function setEventChordAndClearVoicing(song: Song, id: string, chord: ChordRef): Song {
  const withChord = setEventChord(song, id, chord);
  return clearVoicing(withChord, id);
}
