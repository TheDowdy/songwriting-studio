import { chordName, chordTones, chroma, eventVoicing, flattenDetailed } from '@sw/core';
import type { Key, Mode, Song, TimeSig } from '@sw/core';

/** Everything the sheet-music view needs, with all musical decisions made and no drawing. */

/** Lengths in sixteenth notes, largest first, with their VexFlow duration codes. */
const DURATIONS: [number, string][] = [
  [16, 'w'],
  [12, 'hd'],
  [8, 'h'],
  [6, 'qd'],
  [4, 'q'],
  [3, '8d'],
  [2, '8'],
  [1, '16'],
];

/** Split `sixteenths` into the fewest standard note lengths, longest first. */
export function splitDuration(sixteenths: number): { sixteenths: number; vex: string }[] {
  const out: { sixteenths: number; vex: string }[] = [];
  let left = sixteenths;
  while (left > 0) {
    const [len, vex] = DURATIONS.find(([l]) => l <= left)!;
    out.push({ sixteenths: len, vex });
    left -= len;
  }
  return out;
}

export interface SheetNote {
  /** VexFlow duration code, e.g. 'q', 'hd'. */
  vex: string;
  rest: boolean;
  /** VexFlow keys ('c#/4'), split by staff; empty for rests or when a staff has no notes. */
  treble: string[];
  bass: string[];
  /** Chord symbol / numeral, only on the first note of a chord (not on its tied continuation). */
  symbol?: string;
  numeral?: string;
  /** This note is tied to the next one (a chord held across a bar line or longer than one note). */
  tieNext: boolean;
}

export interface SheetBar {
  notes: SheetNote[];
}

export interface SheetSection {
  name: string;
  repeat: number;
  bars: SheetBar[];
}

export interface SheetData {
  title: string;
  keyLabel: string;
  /** Key signature as a VexFlow major-key name (modes map to their relative major). */
  keySignature: string;
  timeSig: TimeSig;
  bpm: number;
  sections: SheetSection[];
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The MIDI note as a VexFlow key using the chord's own spelling (so F♯ stays F♯, not G♭). */
export function spellKey(midi: number, spellings: string[]): string {
  const pc = ((midi % 12) + 12) % 12;
  const name = spellings.find((n) => chroma(n) === pc);
  if (!name) return fallbackKey(midi);
  const letter = name[0].toUpperCase();
  const accidental = name.slice(1);
  const offset = (accidental.match(/#/g)?.length ?? 0) - (accidental.match(/b/g)?.length ?? 0);
  const octave = (midi - (SEMITONE[letter] + offset)) / 12 - 1;
  return `${letter.toLowerCase()}${accidental}/${octave}`;
}

function fallbackKey(midi: number): string {
  const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  return `${names[((midi % 12) + 12) % 12]}/${Math.floor(midi / 12) - 1}`;
}

/** Notes at or above middle C go on the treble staff, the rest on the bass staff. */
const SPLIT_MIDI = 60;

export function splitStaves(midi: number[], spellings: string[]): { treble: string[]; bass: string[] } {
  const sorted = [...midi].sort((a, b) => a - b);
  // A pitch class doubled in the bass register and again above would just repeat a notehead.
  const seen = new Set<number>();
  const unique = sorted.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  return {
    bass: unique.filter((n) => n < SPLIT_MIDI).map((n) => spellKey(n, spellings)),
    treble: unique.filter((n) => n >= SPLIT_MIDI).map((n) => spellKey(n, spellings)),
  };
}

/** Semitones a mode's tonic sits above the tonic of the major scale sharing its key signature. */
const MODE_OFFSET: Record<Mode, number> = {
  major: 0,
  dorian: 2,
  phrygian: 4,
  lydian: 5,
  mixolydian: 7,
  minor: 9,
  locrian: 11,
};
const SIGNATURE_BY_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function keySignatureFor(key: Key): string {
  return SIGNATURE_BY_PC[(((chroma(key.tonic) - MODE_OFFSET[key.mode]) % 12) + 12) % 12];
}

/**
 * Lay a list of chord events out in bars. Chords longer than the space left in a bar are split
 * and tied across the bar line; a short final bar is filled with rests.
 */
export function layoutBars(
  events: { symbol: string; numeral: string; midi: number[]; spellings: string[]; beats: number }[],
  timeSig: TimeSig,
): SheetBar[] {
  const per = 16 / timeSig.unit; // sixteenths per beat
  const barLen = timeSig.beats * per;
  const bars: SheetBar[] = [];
  let current: SheetNote[] = [];
  let used = 0;

  const flush = () => {
    bars.push({ notes: current });
    current = [];
    used = 0;
  };

  for (const event of events) {
    let remaining = Math.round(event.beats * per);
    const { treble, bass } = splitStaves(event.midi, event.spellings);
    let first = true;
    while (remaining > 0) {
      const take = Math.min(remaining, barLen - used);
      const pieces = splitDuration(take);
      pieces.forEach((piece, i) => {
        const lastPiece = i === pieces.length - 1 && take === remaining;
        current.push({
          vex: piece.vex,
          rest: false,
          treble,
          bass,
          symbol: first ? event.symbol : undefined,
          numeral: first ? event.numeral : undefined,
          tieNext: !lastPiece,
        });
        first = false;
      });
      remaining -= take;
      used += take;
      if (used >= barLen) flush();
    }
  }

  if (current.length > 0) {
    for (const piece of splitDuration(barLen - used)) {
      current.push({ vex: piece.vex, rest: true, treble: [], bass: [], tieNext: false });
    }
    flush();
  }
  return bars;
}

/**
 * The whole song as sheet-music data, in arrangement order. Voicings come from the same
 * voice-leading pass as playback (so the page shows what you hear), taken from each
 * section's first pass through.
 */
export function buildSheet(song: Song, keyLabel: string): SheetData {
  const flat = flattenDetailed(song);
  const voicings = new Map<string, number[]>();
  let prev: number[] | null = null;
  for (const f of flat) {
    const voicing = eventVoicing(f.event, song.instrument, prev);
    prev = voicing;
    const id = `${f.arrangementIndex}:${f.event.id}`;
    if (!voicings.has(id)) voicings.set(id, voicing);
  }

  const sections: SheetSection[] = song.arrangement.flatMap((sectionId, arrangementIndex) => {
    const section = song.sections.find((s) => s.id === sectionId);
    if (!section || section.events.length === 0) return [];
    const events = section.events.map((event) => ({
      symbol: chordName(event.chord),
      numeral: event.chord.numeral,
      midi: voicings.get(`${arrangementIndex}:${event.id}`) ?? [],
      spellings: chordTones(event.chord),
      beats: event.beats,
    }));
    return [{ name: section.name, repeat: Math.max(1, section.repeat), bars: layoutBars(events, song.timeSig) }];
  });

  return {
    title: song.title || 'Untitled song',
    keyLabel,
    keySignature: keySignatureFor(song.key),
    timeSig: song.timeSig,
    bpm: song.bpm,
    sections,
  };
}
