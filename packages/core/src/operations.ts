/**
 * Pure song operations (§3.2, §7 Phase 1): every mutation a store can make to a `Song`, moved out
 * of PB's original `store.ts` so both the progression and guitar modules (and their stores) share
 * one implementation. None of these touch UI-only state (selection, playback, replace target…) —
 * that stays in each app's own thin store wrapper.
 */
import { Interval } from 'tonal';
import { relabel, transposeChord } from './theory/chords';
import type { ChordRef, Key } from './theory/types';
import { findEvent, newEvent, newId, newSection, withSection } from './song';
import type { ChordAttachments, ChordEvent, GuitarVoicing, InstrumentId, PatternId, Section, Song, TimeSig } from './schema';

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
  events.splice(at < 0 ? events.length : at + 1, 0, event);
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
  const shift = how === 'transpose' ? Interval.distance(song.key.tonic, key.tonic) : null;
  const sections = song.sections.map((section) => ({
    ...section,
    events: section.events.map((e) => ({
      ...e,
      chord: shift ? transposeChord(e.chord, shift, key) : relabel(e.chord, key),
      attachments: shift ? undefined : e.attachments,
    })),
  }));
  return touch({ ...song, key, sections });
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

export function setTitle(song: Song, title: string): Song {
  return touch({ ...song, title });
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
