import * as Tone from 'tone';
import type { InstrumentId } from '@sw/core';

/** Piano samples (Salamander Grand, subset) live in public/samples so the app works offline. */
const SAMPLE_NOTES: Record<string, string> = {
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3',
};

/** One strike within the whole song: `midi` notes sounded together (or staggered by `strumSeconds`). `midi` is already in strike order (low→high for a down-strum, high→low for an up-strum), so only the size of the stagger is used, not its sign. */
export interface NoteStrike {
  /** The chord event this strike belongs to, so playback can highlight it. */
  eventId: string;
  /** Only the first strike of a chord fires the highlight callback. */
  isChordStart: boolean;
  offsetBeats: number;
  durationBeats: number;
  midi: number[];
  strumSeconds?: number;
  velocity?: number;
}

export interface PlaybackOptions {
  bpm: number;
  loop: boolean;
  /** Loop bounds in beats from the song start; omit to loop the whole song. */
  loopStartBeats?: number;
  loopEndBeats?: number;
  instrument: InstrumentId;
  metronome: boolean;
  /** Bar length in beats, for the metronome's accented beat 1. */
  barBeats: number;
  /** 0–1. */
  volume: number;
  /** Called (in sync with the audio) when a chord starts; null when playback ends. */
  onEvent: (id: string | null) => void;
}

/**
 * Every instrument connects here instead of straight to the speakers: a shared gain trim (several
 * independent voices summing — a full chord, or several PluckSynth "strings" — can otherwise add
 * up past 0dBFS and hard-clip) followed by a limiter as a safety net for anything that still peaks.
 */
let masterBus: Tone.Gain | null = null;
function getBus(): Tone.Gain {
  if (!masterBus) {
    const limiter = new Tone.Limiter(-1).toDestination();
    masterBus = new Tone.Gain(0.7).connect(limiter);
  }
  return masterBus;
}

/** Lowest / highest MIDI note a guitar sample is rendered for; notes outside are pitch-shifted. */
const GUITAR_LOW = 38;
const GUITAR_HIGH = 79;
/** Note names (as in the sample file names) that public/samples/guitar-acoustic has. */
const GUITAR_FILES = new Set(
  'A2 A3 A4 As2 As3 As4 B2 B3 B4 C3 C4 C5 Cs3 Cs4 Cs5 D2 D3 D4 D5 Ds2 Ds3 Ds4 E2 E3 E4 F2 F3 F4 Fs2 Fs3 Fs4 G2 G3 G4 Gs2 Gs3 Gs4'.split(' '),
);
/** A struck/plucked string keeps ringing at least this long, whatever the chord's written length. */
const GUITAR_MIN_RING = 1.1;

/**
 * One plucked-string note rendered offline with the Karplus-Strong algorithm: a burst of noise
 * circulating through a delay line the length of one pitch period, averaged each pass (which
 * damps the highs faster than the lows, like a real string). Deterministic, so every note
 * sounds the same each time it's played.
 */
export function renderPluck(midi: number, sampleRate: number, seconds = 3): Float32Array<ArrayBuffer> {
  const freq = 440 * 2 ** ((midi - 69) / 12);
  const period = Math.max(2, Math.round(sampleRate / freq));
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  const line = new Float32Array(period);
  let seed = 1234567 + midi * 7919;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 31 - 1;
  };
  // Softened noise burst = a pick that isn't razor-sharp.
  let prev = 0;
  for (let i = 0; i < period; i++) {
    prev = prev * 0.5 + rand() * 0.5;
    line[i] = prev;
  }
  // Higher strings ring shorter and duller than low ones, as on a real guitar.
  const loss = 0.9965 - Math.min(0.003, Math.max(0, (midi - 40) * 0.00005));
  let idx = 0;
  let last = line[0];
  for (let i = 0; i < length; i++) {
    const cur = line[idx];
    out[i] = cur;
    line[idx] = 0.5 * (cur + last) * loss;
    last = cur;
    idx = (idx + 1) % period;
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.6 / peak : 1;
  const fade = Math.floor(sampleRate * 0.3);
  for (let i = 0; i < length; i++) out[i] *= gain * (i > length - fade ? (length - i) / fade : 1);
  return out;
}

/**
 * The guitar: Karplus-Strong plucks pre-rendered into a `Tone.Sampler`, one sample every
 * semitone. Unlike `Tone.PluckSynth` (one shared noise source and delay line per instance, so
 * simultaneous or closely-spaced notes interfere and per-note timing is unreliable) this gives
 * true polyphony, exact scheduling and a natural decay, so block/strum/arpeggio patterns
 * are all audibly different.
 */
class GuitarVoice {
  private sampler: Tone.Sampler;
  private recorded: Tone.Sampler | null = null;

  constructor() {
    const ctx = Tone.getContext();
    const urls: Record<string, AudioBuffer> = {};
    for (let midi = GUITAR_LOW; midi <= GUITAR_HIGH; midi++) {
      const data = renderPluck(midi, ctx.sampleRate);
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buffer.copyToChannel(data, 0);
      urls[Tone.Frequency(midi, 'midi').toNote()] = buffer;
    }
    // Warm the tone slightly: a real guitar body rolls the top end off.
    const tone = new Tone.Filter(4200, 'lowpass').connect(getBus());
    this.sampler = new Tone.Sampler({ urls, release: 0.25 }).connect(tone);

    // Recorded acoustic guitar (public/samples/guitar-acoustic, CC-BY 3.0, see CREDITS.md) takes
    // over once it has loaded; until then, or if a file fails, the synthesized plucks above play.
    const recordedUrls: Record<string, string> = {};
    for (const oct of [2, 3, 4, 5]) {
      for (const name of ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']) {
        if (GUITAR_FILES.has(`${name}${oct}`)) recordedUrls[`${name.replace('s', '#')}${oct}`] = `${name}${oct}.mp3`;
      }
    }
    const recorded: Tone.Sampler = new Tone.Sampler({
      urls: recordedUrls,
      baseUrl: `${import.meta.env.BASE_URL}samples/guitar-acoustic/`,
      release: 0.6,
      onload: () => {
        this.recorded = recorded;
      },
      onerror: () => recorded.dispose(),
    }).connect(getBus());
  }

  triggerAttackRelease(notes: string | string[], duration: Tone.Unit.Time, time?: Tone.Unit.Time, velocity?: number): void {
    const ring = Math.max(Tone.Time(duration).toSeconds(), GUITAR_MIN_RING);
    (this.recorded ?? this.sampler).triggerAttackRelease(notes, ring, time, velocity);
  }

  releaseAll(): void {
    this.sampler.releaseAll();
    this.recorded?.releaseAll();
  }
}

type Voice = Tone.Sampler | Tone.PolySynth | GuitarVoice;

const voices = new Map<InstrumentId, Voice>();
let loadingPiano: Promise<void> | null = null;
let metronomeSynth: Tone.MembraneSynth | null = null;
let onEvent: PlaybackOptions['onEvent'] = () => {};

const noteNames = (midi: number[]) => midi.map((m) => Tone.Frequency(m, 'midi').toNote());

function makeFallbackPiano(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 1 },
  }).connect(getBus());
}

/**
 * One attempt at loading the full sample set. `Tone.Sampler`'s `onerror` fires (and its internal
 * loaded-count never reaches zero, so `onload` never fires either) if even a single one of the
 * 18 files fails to load — a transient network/dev-server hiccup on any one file silently and
 * permanently kills the whole piano for the session. Resolves the half-loaded sampler's own
 * connections away on failure so a retry doesn't leak dangling audio nodes.
 */
function loadPianoOnce(): Promise<Tone.Sampler | null> {
  return new Promise((resolve) => {
    let sampler: Tone.Sampler;
    try {
      sampler = new Tone.Sampler({
        urls: SAMPLE_NOTES,
        baseUrl: `${import.meta.env.BASE_URL}samples/salamander/`,
        release: 1.2,
        onload: () => resolve(sampler),
        onerror: () => {
          sampler.dispose();
          resolve(null);
        },
      }).connect(getBus());
    } catch {
      resolve(null);
    }
  });
}

const PIANO_LOAD_ATTEMPTS = 3;

async function loadPiano(): Promise<void> {
  for (let attempt = 0; attempt < PIANO_LOAD_ATTEMPTS; attempt++) {
    const sampler = await loadPianoOnce();
    if (sampler) {
      voices.set('piano', sampler);
      return;
    }
  }
  voices.set('piano', makeFallbackPiano());
}

function makeInstrument(id: InstrumentId): Voice {
  switch (id) {
    case 'epiano':
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 6,
        envelope: { attack: 0.005, decay: 1.2, sustain: 0.15, release: 1.4 },
        modulationEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.05, release: 0.8 },
      }).connect(getBus());
    case 'pad':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.8, decay: 0.6, sustain: 0.8, release: 2.2 },
      }).connect(getBus());
    case 'guitar':
      return new GuitarVoice();
    case 'piano':
      return makeFallbackPiano(); // replaced once samples load
  }
}

/**
 * Start the audio context and load the instruments. Browsers only allow audio to start from a
 * user gesture, so call this synchronously from a tap/click handler.
 */
export function unlockAudio(): Promise<void> {
  const started = Tone.start();
  loadingPiano ??= loadPiano();
  if (!voices.has('piano')) voices.set('piano', makeFallbackPiano());
  for (const id of ['epiano', 'pad', 'guitar'] as InstrumentId[]) if (!voices.has(id)) voices.set(id, makeInstrument(id));
  return Promise.all([started, loadingPiano]).then(() => undefined);
}

function voiceFor(id: InstrumentId): Voice | null {
  return voices.get(id) ?? null;
}

/** Play a chord once on the given instrument, e.g. when the user taps a node. */
export async function previewChord(midi: number[], instrument: InstrumentId = 'piano', seconds = 1.6): Promise<void> {
  await unlockAudio();
  voiceFor(instrument)?.triggerAttackRelease(noteNames(midi), seconds, Tone.now());
}

/** Timers for a preview's not-yet-sounded notes, so the next preview can cancel them. */
let previewTimers: ReturnType<typeof setTimeout>[] = [];
/** How far ahead of a note's start it is handed to the audio engine (keeps timing exact). */
const PREVIEW_LOOKAHEAD = 0.05;

/** Cut off whatever preview is still sounding or waiting to sound (not the song, if it's playing). */
function stopPreview(): void {
  for (const t of previewTimers) clearTimeout(t);
  previewTimers = [];
  if (Tone.getTransport().state !== 'started') for (const voice of voices.values()) voice.releaseAll();
}

/**
 * Play strikes once, straight away, outside the transport (chord previews with the chosen
 * pattern). Starting a new preview first cuts off the previous one, notes still to come included.
 */
export async function previewStrikes(strikes: NoteStrike[], instrument: InstrumentId, bpm: number): Promise<void> {
  stopPreview();
  await unlockAudio();
  stopPreview(); // a second preview may have started while the audio was unlocking
  const voice = voiceFor(instrument);
  const start = Tone.now() + PREVIEW_LOOKAHEAD;
  const secPerBeat = 60 / bpm;
  for (const strike of strikes) {
    const names = noteNames(strike.midi);
    const at = start + strike.offsetBeats * secPerBeat;
    const seconds = strike.durationBeats * secPerBeat * 0.97;
    const play = () => {
      if (strike.strumSeconds && names.length > 1) {
        names.forEach((n, i) => voice?.triggerAttackRelease(n, seconds, at + i * Math.abs(strike.strumSeconds ?? 0), strike.velocity));
      } else {
        voice?.triggerAttackRelease(names, seconds, at, strike.velocity);
      }
    };
    const wait = (at - Tone.now() - PREVIEW_LOOKAHEAD) * 1000;
    if (wait <= 0) play();
    else previewTimers.push(setTimeout(play, wait));
  }
}

function ensureMetronome(): Tone.MembraneSynth {
  metronomeSynth ??= new Tone.MembraneSynth({ pitchDecay: 0.008, envelope: { attack: 0.001, decay: 0.06, sustain: 0 } }).connect(getBus());
  return metronomeSynth;
}

function scheduleEvents(strikes: NoteStrike[], options: PlaybackOptions): number {
  const transport = Tone.getTransport();
  transport.cancel(0);
  const ppq = transport.PPQ;
  const voice = voiceFor(options.instrument);
  const beatTicks = (beats: number) => Math.round(beats * ppq);

  let totalBeats = 0;
  for (const s of strikes) totalBeats = Math.max(totalBeats, s.offsetBeats + s.durationBeats);

  for (const strike of strikes) {
    const startTick = beatTicks(strike.offsetBeats);
    const durTicks = beatTicks(strike.durationBeats);
    const names = noteNames(strike.midi);
    transport.schedule((time) => {
      const seconds = Tone.Ticks(durTicks).toSeconds();
      if (strike.strumSeconds && names.length > 1) {
        names.forEach((n, i) => voice?.triggerAttackRelease(n, seconds * 0.97, time + i * Math.abs(strike.strumSeconds ?? 0), strike.velocity));
      } else {
        voice?.triggerAttackRelease(names, seconds * 0.97, time, strike.velocity);
      }
      if (strike.isChordStart) Tone.getDraw().schedule(() => onEvent(strike.eventId), time);
    }, `${startTick}i`);
  }

  if (options.metronome) {
    const click = ensureMetronome();
    for (let b = 0; b < Math.ceil(totalBeats); b++) {
      const tick = beatTicks(b);
      const accent = b % Math.max(1, options.barBeats) === 0;
      transport.schedule((time) => {
        click.triggerAttackRelease(accent ? 'C3' : 'C2', 0.03, time, accent ? 0.9 : 0.5);
      }, `${tick}i`);
    }
  }

  return totalBeats;
}

export async function startPlayback(strikes: NoteStrike[], options: PlaybackOptions): Promise<void> {
  await unlockAudio();
  const transport = Tone.getTransport();
  transport.stop();
  onEvent = options.onEvent;
  Tone.getDestination().volume.value = options.volume <= 0 ? -Infinity : Tone.gainToDb(options.volume);
  transport.bpm.value = options.bpm;
  transport.timeSignature = options.barBeats;
  const totalBeats = scheduleEvents(strikes, options);
  const ppq = transport.PPQ;
  const loopStart = options.loopStartBeats ?? 0;
  const loopEnd = options.loopEndBeats ?? totalBeats;
  transport.loop = options.loop;
  transport.loopStart = `${Math.round(loopStart * ppq)}i`;
  transport.loopEnd = `${Math.round(loopEnd * ppq)}i`;
  if (!options.loop) {
    transport.schedule((time) => {
      Tone.getDraw().schedule(() => stopPlayback(), time);
    }, `${Math.round(totalBeats * ppq)}i`);
  }
  transport.start('+0.05', options.loop ? `${Math.round(loopStart * ppq)}i` : 0);
}

/** Change what is playing without stopping (edits, tempo, loop, instrument). Timing stays on the transport. */
export function updatePlayback(strikes: NoteStrike[], options: PlaybackOptions): void {
  const transport = Tone.getTransport();
  if (transport.state !== 'started') return;
  if (strikes.length === 0) {
    stopPlayback();
    return;
  }
  Tone.getDestination().volume.value = options.volume <= 0 ? -Infinity : Tone.gainToDb(options.volume);
  transport.bpm.value = options.bpm;
  transport.timeSignature = options.barBeats;
  const totalBeats = scheduleEvents(strikes, options);
  const ppq = transport.PPQ;
  const loopStart = options.loopStartBeats ?? 0;
  const loopEnd = options.loopEndBeats ?? totalBeats;
  transport.loop = options.loop;
  transport.loopStart = `${Math.round(loopStart * ppq)}i`;
  transport.loopEnd = `${Math.round(loopEnd * ppq)}i`;
}

export function stopPlayback(): void {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel(0);
  for (const voice of voices.values()) voice.releaseAll();
  onEvent(null);
}
