import { beforeEach, describe, expect, it } from 'vitest';
import { songStore } from '@sw/song-store';
import { chordName, diatonicChords, flattenSong, type Key } from '@sw/core';
import { selectCenter, useStore } from './store';

const c: Key = { tonic: 'C', mode: 'major' };
const [I, ii, , IV, V] = diatonicChords(c);

/**
 * The pure logic behind every one of these actions (song mutation, voicing, migration…) is
 * tested in `@sw/core` (`operations.test.ts`, `song.test.ts`, `theory/voicings.test.ts`) and
 * `@sw/song-store` (`index.test.ts`) now that it lives there (§7 Phase 1). What's left here is
 * PB's own thin wrapper: does `useStore` track selection/playback/replace-target correctly on
 * top of the real song-store, and does `song` stay in sync?
 */
describe('store (thin wrapper over @sw/song-store)', () => {
  beforeEach(() => {
    // A fresh song in the *real* song-store — useStore.song mirrors it via subscription — plus a
    // clean slate for the UI-only fields.
    songStore.getState().newSong(c);
    useStore.setState({
      selectedEventId: null,
      playingEventId: null,
      isPlaying: false,
      replaceTargetId: null,
    });
  });

  const chords = () => flattenSong(useStore.getState().song).map((e) => chordName(e.chord));

  it('song mirrors the song-store current song', () => {
    expect(useStore.getState().song.id).toBe(songStore.getState().currentSongId);
  });

  it('a song opened from outside the module (the shell) makes its first section active', () => {
    useStore.getState().addChord(I);
    songStore.getState().newSong(c);
    const s = useStore.getState();
    expect(s.activeSectionId).toBe(s.song.sections[0]!.id);
    expect(s.selectedEventId).toBeNull();
  });

  it('starts with no centre chord', () => {
    expect(selectCenter(useStore.getState()).chord).toBeNull();
  });

  it('adds chords in order and re-centres on the newest', () => {
    const { addChord } = useStore.getState();
    addChord(I);
    addChord(IV);
    addChord(V);
    expect(chords()).toEqual(['C', 'F', 'G']);
    expect(chordName(selectCenter(useStore.getState()).chord!)).toBe('G');
    expect(selectCenter(useStore.getState()).previous.map(chordName)).toEqual(['C', 'F']);
  });

  it('inserts after the selected slot', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const first = flattenSong(useStore.getState().song)[0]!.id;
    useStore.getState().selectEvent(first);
    useStore.getState().addChord(ii);
    expect(chords()).toEqual(['C', 'Dm', 'G']);
  });

  it('removing the selected chord selects a neighbour; removing the last clears selection', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first, second] = flattenSong(useStore.getState().song);
    useStore.getState().removeEvent(second!.id);
    expect(useStore.getState().selectedEventId).toBe(first!.id);
    useStore.getState().removeEvent(first!.id);
    expect(useStore.getState().selectedEventId).toBeNull();
  });

  it('the map follows playback while playing', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first] = flattenSong(useStore.getState().song);
    useStore.setState({ isPlaying: true, playingEventId: first!.id });
    expect(chordName(selectCenter(useStore.getState()).chord!)).toBe('C');
  });

  it('replace mode: the next added chord replaces the target instead of inserting', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first] = flattenSong(useStore.getState().song);
    s.startReplace(first!.id);
    s.addChord(IV);
    expect(chords()).toEqual(['F', 'G']);
    expect(useStore.getState().replaceTargetId).toBeNull();
  });

  it('addSection makes it active; addChord then adds to it', () => {
    const s = useStore.getState();
    s.addSection('Chorus');
    const song = useStore.getState().song;
    expect(song.sections).toHaveLength(2);
    expect(useStore.getState().activeSectionId).toBe(song.sections[1]!.id);
    s.addChord(I);
    expect(useStore.getState().song.sections[0]!.events).toHaveLength(0);
    expect(useStore.getState().song.sections[1]!.events).toHaveLength(1);
  });

  it('removeSection clears selection only if the selected chord was in it, and re-homes the active section', () => {
    const s = useStore.getState();
    s.addChord(I); // in the verse (the only section so far)
    const verseId = useStore.getState().song.sections[0]!.id;
    s.addSection('Chorus'); // now active
    const chorusId = useStore.getState().song.sections[1]!.id;
    s.addChord(V); // in the chorus
    const verseEventId = useStore.getState().song.sections[0]!.events[0]!.id;
    useStore.getState().selectEvent(verseEventId);

    useStore.getState().removeSection(chorusId);
    expect(useStore.getState().activeSectionId).toBe(verseId); // was pointing at the removed section
    expect(useStore.getState().selectedEventId).toBe(verseEventId); // untouched — it wasn't in the chorus
  });

  it('loadSong resets the editor selection', () => {
    const s = useStore.getState();
    s.addChord(I);
    const eventId = flattenSong(useStore.getState().song)[0]!.id;
    useStore.getState().selectEvent(eventId);
    expect(useStore.getState().selectedEventId).toBe(eventId);

    const other = songStore.getState().library[songStore.getState().currentSongId!]!;
    useStore.getState().loadSong({ ...other, id: 'another-song' });
    expect(useStore.getState().selectedEventId).toBeNull();
    expect(useStore.getState().song.id).toBe('another-song');
  });
});
