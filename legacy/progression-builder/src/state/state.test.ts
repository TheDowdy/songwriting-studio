import { beforeEach, describe, expect, it } from 'vitest';
import { chordName, diatonicChord, diatonicChords, withFlavor, withInversion } from '../theory/chords';
import { pianoVoicing, voiceLeadChord } from '../theory/voicings';
import { flattenSong, newSong, sectionLoopBounds } from './song';
import { selectCenter, useStore } from './store';

const c = { tonic: 'C', mode: 'major' } as const;

describe('pianoVoicing', () => {
  it('C major: bass C2 then C3 E3 G3', () => {
    expect(pianoVoicing(diatonicChord(c, 0))).toEqual([36, 48, 52, 55]);
  });
  it('respects inversions: C/E has E in the bass', () => {
    const v = pianoVoicing(withInversion(diatonicChord(c, 0), 1, c));
    expect(v).toEqual([40, 52, 55, 60]);
  });
  it('is ascending and stays in a sensible range for every chord in every key', () => {
    for (const tonic of ['C', 'Db', 'F#', 'B', 'Eb'])
      for (const chord of diatonicChords({ tonic, mode: 'major' }, '7')) {
        const v = pianoVoicing(chord);
        expect([...v].sort((a, b) => a - b)).toEqual(v);
        expect(v[0]).toBeGreaterThanOrEqual(36);
        expect(v[v.length - 1]).toBeLessThanOrEqual(72);
      }
  });
});

describe('voiceLeadChord', () => {
  it('with no previous chord, matches pianoVoicing', () => {
    const I = diatonicChord(c, 0);
    expect(voiceLeadChord(I, null)).toEqual(pianoVoicing(I));
  });
  it('holds a common tone in place: C → Am shares C and E', () => {
    const [I, , iii, , , vi] = diatonicChords(c);
    void iii;
    const cVoicing = voiceLeadChord(I, null);
    const amVoicing = voiceLeadChord(vi, cVoicing);
    // C major = C E G, A minor = A C E: C and E should be the very same notes, not just same pitch class.
    expect(amVoicing.filter((n) => cVoicing.includes(n)).length).toBeGreaterThanOrEqual(2);
  });
  it('moves less overall than always resetting to close position', () => {
    // A 2nd-inversion I forces a big register jump if you reset to close position each time.
    const I = diatonicChord(c, 0);
    const chords = [I, withInversion(I, 2, c), diatonicChord(c, 3), I]; // I, I⁶₄, IV, I
    let prev: number[] | null = null;
    let ledMovement = 0;
    for (const chord of chords) {
      const v = voiceLeadChord(chord, prev);
      if (prev) for (let i = 0; i < v.length; i++) ledMovement += Math.abs(v[i] - prev[i]);
      prev = v;
    }
    let resetMovement = 0;
    let prevReset: number[] | null = null;
    for (const chord of chords) {
      const v = pianoVoicing(chord);
      if (prevReset) for (let i = 0; i < v.length; i++) resetMovement += Math.abs(v[i] - prevReset[i]);
      prevReset = v;
    }
    expect(ledMovement).toBeLessThan(resetMovement);
  });
  it('does not drift up or down the keyboard over long progressions', () => {
    for (const seq of [[0, 3, 5, 4], [0, 4, 5, 3], [0, 1, 2, 3, 4, 5, 6], [0, 5, 3, 4, 2, 1]]) {
      let prev: number[] | null = null;
      for (let round = 0; round < 12; round++) {
        for (const degree of seq) {
          prev = voiceLeadChord(diatonicChord(c, degree), prev);
          const upper = prev.slice(1);
          expect(Math.min(...upper)).toBeGreaterThanOrEqual(41);
          expect(Math.max(...upper)).toBeLessThanOrEqual(76);
        }
      }
    }
  });
  it('a chord revisited later sounds in the same register as before', () => {
    let prev: number[] | null = null;
    const registers: number[] = [];
    for (let round = 0; round < 6; round++) {
      for (const degree of [0, 3, 5, 4]) {
        prev = voiceLeadChord(diatonicChord(c, degree), prev);
        if (degree === 0) registers.push(prev.slice(1).reduce((a, b) => a + b, 0) / (prev.length - 1));
      }
    }
    expect(Math.max(...registers) - Math.min(...registers)).toBeLessThanOrEqual(12);
  });
  it('keeps the chosen inversion in the bass', () => {
    const I = diatonicChord(c, 0);
    const first = withInversion(I, 1, c); // C/E
    const v = voiceLeadChord(first, voiceLeadChord(I, null));
    expect(v[0] % 12).toBe(4); // E
    expect(v[1] % 12).toBe(4); // the lowest upper note is also E
  });
  it('stays ascending even when a flavor change adds a note (e.g. add9)', () => {
    const I = diatonicChord(c, 0);
    const add9 = withFlavor(I, 'add9', c);
    const v = voiceLeadChord(add9, voiceLeadChord(I, null));
    expect(v.length).toBe(5); // bass + 4 upper notes (triad + the 9th)
    expect([...v].sort((a, b) => a - b)).toEqual(v);
  });
});

describe('song helpers', () => {
  it('flattenSong follows the arrangement and repeat counts', () => {
    const song = newSong();
    const [a, b] = diatonicChords(c);
    const sec = song.sections[0];
    sec.events = [
      { id: 'e1', chord: a, beats: 4 },
      { id: 'e2', chord: b, beats: 4 },
    ];
    sec.repeat = 2;
    expect(flattenSong(song).map((e) => e.id)).toEqual(['e1', 'e2', 'e1', 'e2']);
  });
  it('sectionLoopBounds spans just one arrangement slot, including its own repeats', () => {
    const song = newSong();
    const [a, b] = diatonicChords(c);
    const verse = song.sections[0];
    verse.events = [
      { id: 'e1', chord: a, beats: 4 },
      { id: 'e2', chord: b, beats: 2 },
    ];
    verse.repeat = 2; // spans beats 0–12
    const chorus = { id: 'chorus', name: 'Chorus', repeat: 1, events: [{ id: 'e3', chord: a, beats: 4 }] };
    const withChorus = { ...song, sections: [verse, chorus], arrangement: [verse.id, chorus.id] };
    expect(sectionLoopBounds(withChorus, verse.id)).toEqual({ start: 0, end: 12 });
    expect(sectionLoopBounds(withChorus, chorus.id)).toEqual({ start: 12, end: 16 });
    expect(sectionLoopBounds(withChorus, 'missing')).toBeNull();
  });
});

describe('store', () => {
  beforeEach(() => {
    const song = newSong(c);
    useStore.setState({
      song,
      activeSectionId: song.sections[0].id,
      selectedEventId: null,
      playingEventId: null,
      isPlaying: false,
      replaceTargetId: null,
    });
  });
  const chords = () => flattenSong(useStore.getState().song).map((e) => chordName(e.chord));
  const [I, ii, , IV, V] = diatonicChords(c);

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
    const first = flattenSong(useStore.getState().song)[0].id;
    useStore.getState().selectEvent(first);
    useStore.getState().addChord(ii);
    expect(chords()).toEqual(['C', 'Dm', 'G']);
  });
  it('removing the selected chord selects a neighbour; removing the last clears selection', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first, second] = flattenSong(useStore.getState().song);
    useStore.getState().removeEvent(second.id);
    expect(useStore.getState().selectedEventId).toBe(first.id);
    useStore.getState().removeEvent(first.id);
    expect(useStore.getState().selectedEventId).toBeNull();
  });
  it('the map follows playback while playing', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first] = flattenSong(useStore.getState().song);
    useStore.setState({ isPlaying: true, playingEventId: first.id });
    expect(chordName(selectCenter(useStore.getState()).chord!)).toBe('C');
  });
  it('changing key can transpose or relabel existing chords', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    useStore.getState().changeKey({ tonic: 'D', mode: 'major' }, 'transpose');
    expect(chords()).toEqual(['D', 'A']);
    expect(flattenSong(useStore.getState().song).map((e) => e.chord.numeral)).toEqual(['I', 'V']);
    useStore.getState().changeKey({ tonic: 'A', mode: 'major' }, 'relabel');
    expect(chords()).toEqual(['D', 'A']);
    expect(flattenSong(useStore.getState().song).map((e) => e.chord.numeral)).toEqual(['IV', 'I']);
  });
  it('clamps tempo to 30–300', () => {
    useStore.getState().setBpm(999);
    expect(useStore.getState().song.bpm).toBe(300);
    useStore.getState().setBpm(5);
    expect(useStore.getState().song.bpm).toBe(30);
  });

  it('setEventBeats clamps to 1–32', () => {
    const s = useStore.getState();
    s.addChord(I);
    const [e] = flattenSong(useStore.getState().song);
    useStore.getState().setEventBeats(e.id, 0);
    expect(flattenSong(useStore.getState().song)[0].beats).toBe(1);
    useStore.getState().setEventBeats(e.id, 99);
    expect(flattenSong(useStore.getState().song)[0].beats).toBe(32);
  });

  it('setEventChord replaces a placed chord in place, keeping its position', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first] = flattenSong(useStore.getState().song);
    useStore.getState().setEventChord(first.id, IV);
    expect(chords()).toEqual(['F', 'G']);
  });

  it('addSection creates a new section and adds it to the arrangement, then becomes active', () => {
    const s = useStore.getState();
    s.addSection('Chorus');
    const song = useStore.getState().song;
    expect(song.sections).toHaveLength(2);
    expect(song.sections[1].name).toBe('Chorus');
    expect(song.arrangement).toEqual([song.sections[0].id, song.sections[1].id]);
    expect(useStore.getState().activeSectionId).toBe(song.sections[1].id);
  });

  it('addChord adds to the active section', () => {
    const s = useStore.getState();
    s.addSection('Chorus');
    s.addChord(I);
    const song = useStore.getState().song;
    expect(song.sections[0].events).toHaveLength(0);
    expect(song.sections[1].events).toHaveLength(1);
  });

  it('removeSection drops it from sections and every arrangement slot, but never the last section', () => {
    const s = useStore.getState();
    s.addSection('Chorus');
    const [verse, chorus] = useStore.getState().song.sections;
    s.addArrangementSlot(chorus.id); // Verse, Chorus, Chorus
    s.removeSection(chorus.id);
    const song = useStore.getState().song;
    expect(song.sections.map((sec) => sec.id)).toEqual([verse.id]);
    expect(song.arrangement).toEqual([verse.id]);
    s.removeSection(verse.id); // refuses to remove the only remaining section
    expect(useStore.getState().song.sections).toHaveLength(1);
  });

  it('duplicateSection clones events with fresh ids, independent of the original', () => {
    const s = useStore.getState();
    s.addChord(I);
    const verseId = useStore.getState().song.sections[0].id;
    s.duplicateSection(verseId);
    const song = useStore.getState().song;
    expect(song.sections).toHaveLength(2);
    expect(song.sections[1].events[0].id).not.toBe(song.sections[0].events[0].id);
    expect(chordName(song.sections[1].events[0].chord)).toBe('C');
    // Editing the original doesn't touch the duplicate.
    s.setEventChord(song.sections[0].events[0].id, V);
    expect(chordName(useStore.getState().song.sections[1].events[0].chord)).toBe('C');
  });

  it('duplicateSection puts the copy in the arrangement right after its source', () => {
    const s = useStore.getState();
    s.addChord(I);
    const verseId = useStore.getState().song.sections[0].id;
    s.addSection('Chorus');
    s.duplicateSection(verseId);
    const song = useStore.getState().song;
    const copyId = song.sections[1].id;
    expect(song.arrangement.indexOf(copyId)).toBe(song.arrangement.indexOf(verseId) + 1);
    expect(flattenSong(song).length).toBeGreaterThanOrEqual(2);
  });

  it('duplicateEvent inserts an identical block after the original and selects it', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first] = useStore.getState().song.sections[0].events;
    s.duplicateEvent(first.id);
    const st = useStore.getState();
    const events = st.song.sections[0].events;
    expect(events).toHaveLength(3);
    expect(events[1].id).not.toBe(first.id);
    expect(chordName(events[1].chord)).toBe(chordName(first.chord));
    expect(events[1].beats).toBe(first.beats);
    expect(st.selectedEventId).toBe(events[1].id);
  });

  it('reorderEvents moves a chord within its section', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(IV);
    s.addChord(V);
    const sectionId = useStore.getState().song.sections[0].id;
    s.reorderEvents(sectionId, 0, 2);
    expect(chords()).toEqual(['F', 'G', 'C']);
  });

  it('moveEvent relocates a chord into a different section', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addSection('Chorus');
    s.addChord(V);
    const verseId = useStore.getState().song.sections[0].id;
    const chorusId = useStore.getState().song.sections[1].id;
    const eventId = useStore.getState().song.sections[0].events[0].id;
    s.moveEvent(eventId, chorusId, 0);
    const song = useStore.getState().song;
    expect(song.sections.find((sec) => sec.id === verseId)!.events).toHaveLength(0);
    expect(song.sections.find((sec) => sec.id === chorusId)!.events.map((e) => e.id)).toEqual([eventId, expect.any(String)]);
  });

  it('replace mode: the next added chord replaces the target instead of inserting', () => {
    const s = useStore.getState();
    s.addChord(I);
    s.addChord(V);
    const [first] = flattenSong(useStore.getState().song);
    s.startReplace(first.id);
    s.addChord(IV);
    expect(chords()).toEqual(['F', 'G']);
    expect(useStore.getState().replaceTargetId).toBeNull();
  });

  it('reorderArrangement reorders the playback sequence without touching section definitions', () => {
    const s = useStore.getState();
    s.addSection('Chorus');
    const [verse, chorus] = useStore.getState().song.sections;
    s.reorderArrangement(0, 1);
    expect(useStore.getState().song.arrangement).toEqual([chorus.id, verse.id]);
  });

  it('reorderSections reorders the section definitions list (independent of the arrangement)', () => {
    const s = useStore.getState();
    s.addSection('Chorus');
    const [verse, chorus] = useStore.getState().song.sections;
    s.reorderSections(0, 1);
    const song = useStore.getState().song;
    expect(song.sections.map((sec) => sec.id)).toEqual([chorus.id, verse.id]);
    expect(song.arrangement).toEqual([verse.id, chorus.id]); // unaffected
  });
});
