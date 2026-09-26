import { describe, expect, it } from 'vitest';
import { chordName, diatonicChords } from './theory/chords';
import { flattenSong, newSong } from './song';
import type { GuitarVoicing } from './schema';
import {
  addArrangementSlot,
  addChord,
  addSection,
  changeKey,
  clearVoicing,
  commitVoicing,
  duplicateEvent,
  duplicateSection,
  makeVariant,
  moveEvent,
  reorderArrangement,
  reorderEvents,
  reorderSections,
  removeSection,
  setBpm,
  setEventBeats,
  setEventChord,
} from './operations';

const c = { tonic: 'C', mode: 'major' } as const;
const [I, ii, , IV, V] = diatonicChords(c);
const chordNames = (song: ReturnType<typeof newSong>) => flattenSong(song).map((e) => chordName(e.chord));

describe('addChord', () => {
  it('inserts at the end of the section when nothing is selected', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    ({ song } = addChord(song, sectionId, null, I));
    ({ song } = addChord(song, sectionId, null, V)); // still "after null" = at the end
    expect(chordNames(song)).toEqual(['C', 'G']);
  });

  it('inserts right after the given event', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    let firstId: string;
    ({ song, eventId: firstId } = addChord(song, sectionId, null, I));
    ({ song } = addChord(song, sectionId, null, V));
    ({ song } = addChord(song, sectionId, firstId, ii));
    expect(chordNames(song)).toEqual(['C', 'Dm', 'G']);
  });

  it('adds to the given section, not necessarily the first one', () => {
    let song = newSong(c);
    let chorusId: string;
    ({ song, sectionId: chorusId } = addSection(song, 'Chorus'));
    ({ song } = addChord(song, chorusId, null, I));
    expect(song.sections[0]!.events).toHaveLength(0);
    expect(song.sections[1]!.events).toHaveLength(1);
  });
});

describe('setEventChord / setEventBeats', () => {
  it('setEventChord replaces a placed chord in place, keeping its position', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    ({ song } = addChord(song, sectionId, null, I));
    let firstId: string;
    ({ song, eventId: firstId } = addChord(song, sectionId, null, V));
    void firstId;
    const first = flattenSong(song)[0]!;
    song = setEventChord(song, first.id, IV);
    expect(chordNames(song)).toEqual(['F', 'G']);
  });

  it('setEventBeats clamps to 1–32', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    let eventId: string;
    ({ song, eventId } = addChord(song, sectionId, null, I));
    song = setEventBeats(song, eventId, 0);
    expect(flattenSong(song)[0]!.beats).toBe(1);
    song = setEventBeats(song, eventId, 99);
    expect(flattenSong(song)[0]!.beats).toBe(32);
  });
});

describe('sections', () => {
  it('addSection adds it to the arrangement', () => {
    let song = newSong(c);
    let chorusId: string;
    ({ song, sectionId: chorusId } = addSection(song, 'Chorus'));
    expect(song.sections).toHaveLength(2);
    expect(song.sections[1]!.name).toBe('Chorus');
    expect(song.arrangement).toEqual([song.sections[0]!.id, chorusId]);
  });

  it('removeSection drops it from sections and every arrangement slot, but never the last section', () => {
    let song = newSong(c);
    let chorusId: string;
    ({ song, sectionId: chorusId } = addSection(song, 'Chorus'));
    const verseId = song.sections[0]!.id;
    song = addArrangementSlot(song, chorusId); // Verse, Chorus, Chorus
    song = removeSection(song, chorusId);
    expect(song.sections.map((s) => s.id)).toEqual([verseId]);
    expect(song.arrangement).toEqual([verseId]);
    song = removeSection(song, verseId); // refuses to remove the only remaining section
    expect(song.sections).toHaveLength(1);
  });

  it('duplicateSection clones events with fresh ids, independent of the original', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    ({ song } = addChord(song, sectionId, null, I));
    let copyId: string;
    ({ song, sectionId: copyId } = duplicateSection(song, sectionId));
    expect(song.sections).toHaveLength(2);
    const copy = song.sections.find((s) => s.id === copyId)!;
    expect(copy.events[0]!.id).not.toBe(song.sections[0]!.events[0]!.id);
    expect(chordName(copy.events[0]!.chord)).toBe('C');
    // Editing the original doesn't touch the duplicate.
    song = setEventChord(song, song.sections[0]!.events[0]!.id, V);
    expect(chordName(song.sections.find((s) => s.id === copyId)!.events[0]!.chord)).toBe('C');
  });

  it('duplicateSection puts the copy in the arrangement right after its source', () => {
    let song = newSong(c);
    const verseId = song.sections[0]!.id;
    ({ song } = addChord(song, verseId, null, I));
    ({ song } = addSection(song, 'Chorus'));
    let copyId: string;
    ({ song, sectionId: copyId } = duplicateSection(song, verseId));
    expect(song.arrangement.indexOf(copyId)).toBe(song.arrangement.indexOf(verseId) + 1);
  });

  it('makeVariant tags the copy with variantOf/variantLabel and does not follow later edits', () => {
    let song = newSong(c);
    const verseId = song.sections[0]!.id;
    ({ song } = addChord(song, verseId, null, I));
    let variantId: string;
    ({ song, sectionId: variantId } = makeVariant(song, verseId, 'Up the neck'));
    const variant = song.sections.find((s) => s.id === variantId)!;
    expect(variant.variantOf).toBe(verseId);
    expect(variant.variantLabel).toBe('Up the neck');
    song = setEventChord(song, song.sections[0]!.events[0]!.id, V);
    expect(chordName(song.sections.find((s) => s.id === variantId)!.events[0]!.chord)).toBe('C');
  });
});

describe('duplicateEvent', () => {
  it('inserts an identical block after the original, deep-copying attachments', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    let firstId: string;
    ({ song, eventId: firstId } = addChord(song, sectionId, null, I));
    const voicing: GuitarVoicing = { frets: [null, 3, 2, 0, 1, 0], tuning: song.guitar.tuning, capo: 0, source: 'picked' };
    song = commitVoicing(song, firstId, voicing);

    let copyId: string;
    ({ song, eventId: copyId } = duplicateEvent(song, firstId));
    const events = song.sections[0]!.events;
    expect(events).toHaveLength(2);
    expect(events[1]!.id).toBe(copyId);
    expect(chordName(events[1]!.chord)).toBe(chordName(events[0]!.chord));
    expect(events[1]!.attachments?.guitar).toEqual(voicing);
    expect(events[1]!.attachments!.guitar).not.toBe(events[0]!.attachments!.guitar); // deep copy, not shared

    // Mutating the copy's frets array doesn't touch the original's.
    events[1]!.attachments!.guitar!.frets[0] = 5;
    expect(events[0]!.attachments!.guitar!.frets[0]).toBeNull();
  });
});

describe('reordering', () => {
  it('reorderEvents moves a chord within its section', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    ({ song } = addChord(song, sectionId, null, I));
    ({ song } = addChord(song, sectionId, null, IV));
    ({ song } = addChord(song, sectionId, null, V));
    song = reorderEvents(song, sectionId, 0, 2);
    expect(chordNames(song)).toEqual(['F', 'G', 'C']);
  });

  it('moveEvent relocates a chord into a different section', () => {
    let song = newSong(c);
    const verseId = song.sections[0]!.id;
    let eventId: string;
    ({ song, eventId } = addChord(song, verseId, null, I));
    let chorusId: string;
    ({ song, sectionId: chorusId } = addSection(song, 'Chorus'));
    ({ song } = addChord(song, chorusId, null, V));
    song = moveEvent(song, eventId, chorusId, 0);
    expect(song.sections.find((s) => s.id === verseId)!.events).toHaveLength(0);
    expect(song.sections.find((s) => s.id === chorusId)!.events.map((e) => e.id)[0]).toBe(eventId);
  });

  it('reorderArrangement reorders the playback sequence without touching section definitions', () => {
    let song = newSong(c);
    const verseId = song.sections[0]!.id;
    let chorusId: string;
    ({ song, sectionId: chorusId } = addSection(song, 'Chorus'));
    song = reorderArrangement(song, 0, 1);
    expect(song.arrangement).toEqual([chorusId, verseId]);
  });

  it('reorderSections reorders the section list independent of the arrangement', () => {
    let song = newSong(c);
    const verseId = song.sections[0]!.id;
    let chorusId: string;
    ({ song, sectionId: chorusId } = addSection(song, 'Chorus'));
    song = reorderSections(song, 0, 1);
    expect(song.sections.map((s) => s.id)).toEqual([chorusId, verseId]);
    expect(song.arrangement).toEqual([verseId, chorusId]); // unaffected
  });
});

describe('changeKey', () => {
  it('transpose shifts chords and keeps numerals; clears guitar attachments (they no longer fit)', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    let eventId: string;
    ({ song, eventId } = addChord(song, sectionId, null, I));
    ({ song } = addChord(song, sectionId, null, V));
    const voicing: GuitarVoicing = { frets: [null, 3, 2, 0, 1, 0], tuning: song.guitar.tuning, capo: 0, source: 'picked' };
    song = commitVoicing(song, eventId, voicing);

    song = changeKey(song, { tonic: 'D', mode: 'major' }, 'transpose');
    expect(chordNames(song)).toEqual(['D', 'A']);
    expect(flattenSong(song).map((e) => e.chord.numeral)).toEqual(['I', 'V']);
    expect(flattenSong(song).find((e) => e.id === eventId)!.attachments?.guitar).toBeUndefined();
  });

  it('relabel keeps notes, recomputes numeral/origin, and keeps guitar attachments (still fit)', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    let eventId: string;
    ({ song, eventId } = addChord(song, sectionId, null, I));
    ({ song } = addChord(song, sectionId, null, V));
    const voicing: GuitarVoicing = { frets: [null, 3, 2, 0, 1, 0], tuning: song.guitar.tuning, capo: 0, source: 'picked' };
    song = commitVoicing(song, eventId, voicing);

    song = changeKey(song, { tonic: 'A', mode: 'major' }, 'relabel');
    expect(chordNames(song)).toEqual(['C', 'G']);
    expect(flattenSong(song).map((e) => e.chord.numeral)).toEqual(['♭III', '♭VII']);
    expect(flattenSong(song).find((e) => e.id === eventId)!.attachments?.guitar).toEqual(voicing);
  });

  it('clamps tempo to 30–300', () => {
    let song = newSong(c);
    song = setBpm(song, 999);
    expect(song.bpm).toBe(300);
    song = setBpm(song, 5);
    expect(song.bpm).toBe(30);
  });
});

describe('commitVoicing / clearVoicing', () => {
  it('commits and clears a voicing without disturbing the rest of the event', () => {
    let song = newSong(c);
    const sectionId = song.sections[0]!.id;
    let eventId: string;
    ({ song, eventId } = addChord(song, sectionId, null, I));
    const voicing: GuitarVoicing = { frets: [null, 3, 2, 0, 1, 0], tuning: song.guitar.tuning, capo: 0, source: 'recommended' };
    song = commitVoicing(song, eventId, voicing);
    expect(flattenSong(song)[0]!.attachments?.guitar).toEqual(voicing);
    song = clearVoicing(song, eventId);
    expect(flattenSong(song)[0]!.attachments?.guitar).toBeUndefined();
  });
});
