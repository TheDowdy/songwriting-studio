/**
 * Extended Karplus-Strong string bank. Pure DSP: no Web Audio types, so it runs unchanged in the
 * AudioWorklet, in a ScriptProcessor fallback, and in Node unit tests.
 *
 * Each voice is a circular delay line read with a 4-point Lagrange interpolator, so its length
 * (and therefore pitch) can change continuously without clicks. A one-pole low-pass in the loop
 * controls brightness decay, a loop gain controls sustain, and the loop's own phase delay is
 * compensated so the sounding pitch is accurate.
 */

export const VOICE_COUNT = 16;
const MIN_MIDI = 12;
const MAX_MIDI = 100;
/** Time constant of the quick fade used when a string is damped or replaced. */
const RELEASE_TAU_SECONDS = 0.006;
const GATE_TAU_SECONDS = 0.04;

export interface ExcitationParams {
  /** One-pole low-pass coefficient applied to the noise burst: 0 = white (bright), →1 = dark. */
  lowpass: number;
  /** Pluck position as a fraction of the string (0 = none). Puts a comb notch in the spectrum. */
  pick: number;
  /** Peak amplitude of the burst (0–1), i.e. velocity. */
  level: number;
}

export interface LoopParams {
  /** Time for the string to decay by 60 dB, in seconds. */
  t60: number;
  /** One-pole loop low-pass coefficient (0 = no damping, larger = darker, faster HF decay). */
  damping: number;
  /** Linear level below which the tail is chopped (noise-gate style); 0 disables. */
  gate: number;
}

export interface PluckParams {
  when?: number;
  id: number;
  string: number;
  /** May be fractional. */
  midi: number;
  detuneCents: number;
  /** −1 (left) … 1 (right). */
  pan: number;
  excitation: ExcitationParams;
  loop: LoopParams;
}

type BankEvent =
  | { frame: number; kind: 'pluck'; params: PluckParams }
  | { frame: number; kind: 'pitch'; id: number; midi: number; rampMs: number }
  | { frame: number; kind: 'damp'; id: number };

class Voice {
  active = false;
  releasing = false;
  id = -1;
  string = -1;
  buf: Float32Array;
  writePos = 0;
  midi = 40;
  targetMidi = 40;
  rampLeft = 0;
  detuneCents = 0;
  delay = 100;
  lp1 = 0;
  damping = 0;
  t60 = 1;
  gate = 0;
  gating = false;
  env = 1;
  gainL = 1;
  gainR = 1;
  peak = 0;
  quietChunks = 0;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Sounding frequency for a (possibly fractional, detuned) MIDI value. */
function toFreq(midi: number, detuneCents: number): number {
  return 440 * Math.pow(2, (midi + detuneCents / 100 - 69) / 12);
}

/**
 * Delay-line length that makes the whole loop resonate at f0: the total loop delay is
 * sr/f0, of which the low-pass contributes its phase delay at f0.
 */
export function loopDelay(f0: number, damping: number, sampleRate: number): number {
  const w = (2 * Math.PI * f0) / sampleRate;
  const phaseDelay =
    damping === 0 ? 0 : Math.atan2(damping * Math.sin(w), 1 - damping * Math.cos(w)) / w;
  return sampleRate / f0 - phaseDelay;
}

export class StringBank {
  private readonly voices: Voice[];
  private readonly mask: number;
  private readonly events: BankEvent[] = [];
  private seed = 0x9e3779b9;
  private readonly releaseCoef: number;
  private readonly gateCoef: number;

  constructor(
    readonly sampleRate: number,
    voiceCount = VOICE_COUNT,
  ) {
    const size = nextPow2(Math.ceil(sampleRate / 15) + 8);
    this.mask = size - 1;
    this.voices = Array.from({ length: voiceCount }, () => new Voice(size));
    this.releaseCoef = Math.exp(-1 / (RELEASE_TAU_SECONDS * sampleRate));
    this.gateCoef = Math.exp(-1 / (GATE_TAU_SECONDS * sampleRate));
  }

  /** Schedule at an absolute frame (sample) number; frames in the past run immediately. */
  pluck(frame: number, params: PluckParams): void {
    this.enqueue({ frame, kind: 'pluck', params });
  }

  setPitch(frame: number, id: number, midi: number, rampMs = 0): void {
    this.enqueue({ frame, kind: 'pitch', id, midi, rampMs });
  }

  damp(frame: number, id: number): void {
    this.enqueue({ frame, kind: 'damp', id });
  }

  /** Number of voices currently producing sound (including ones fading out). */
  get activeVoices(): number {
    return this.voices.filter((v) => v.active).length;
  }

  /** Voices sounding on a string that have not been released. */
  heldVoicesOnString(string: number): number {
    return this.voices.filter((v) => v.active && !v.releasing && v.string === string).length;
  }

  /** Mixes `n` frames into left/right, starting at absolute frame `startFrame`. */
  process(left: Float32Array, right: Float32Array, n: number, startFrame: number): void {
    left.fill(0, 0, n);
    right.fill(0, 0, n);
    let done = 0;
    while (done < n) {
      const now = startFrame + done;
      while (this.events.length > 0 && (this.events[0] as BankEvent).frame <= now) {
        this.apply(this.events.shift() as BankEvent);
      }
      const nextEvent = this.events.length > 0 ? (this.events[0] as BankEvent).frame - now : n;
      const len = Math.min(n - done, nextEvent);
      for (const v of this.voices) if (v.active) this.render(v, left, right, done, done + len);
      done += len;
    }
  }

  private enqueue(event: BankEvent): void {
    let i = this.events.length;
    while (i > 0 && (this.events[i - 1] as BankEvent).frame > event.frame) i--;
    this.events.splice(i, 0, event);
  }

  private apply(event: BankEvent): void {
    if (event.kind === 'pluck') this.startVoice(event.params);
    else if (event.kind === 'damp') {
      const v = this.find(event.id);
      if (v) v.releasing = true;
    } else {
      const v = this.find(event.id);
      if (!v) return;
      const midi = Math.min(MAX_MIDI, Math.max(MIN_MIDI, event.midi));
      v.targetMidi = midi;
      v.rampLeft = Math.round((event.rampMs / 1000) * this.sampleRate);
      if (v.rampLeft <= 0) v.midi = midi;
    }
  }

  private find(id: number): Voice | undefined {
    return this.voices.find((v) => v.active && v.id === id);
  }

  private random(): number {
    // xorshift32 → [−1, 1)
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x | 0;
    return (x >>> 0) / 2147483648 - 1;
  }

  private startVoice(p: PluckParams): void {
    // One voice per string: quickly damp whatever is still ringing there.
    for (const v of this.voices) if (v.active && v.string === p.string) v.releasing = true;

    let voice = this.voices.find((v) => !v.active);
    if (!voice) {
      // Pool exhausted: steal the quietest voice (rare; only in extreme passages).
      voice = this.voices.reduce((q, v) => (v.peak < q.peak ? v : q));
    }
    const v = voice;
    const midi = Math.min(MAX_MIDI, Math.max(MIN_MIDI, p.midi));
    v.active = true;
    v.releasing = false;
    v.gating = false;
    v.id = p.id;
    v.string = p.string;
    v.midi = v.targetMidi = midi;
    v.rampLeft = 0;
    v.detuneCents = p.detuneCents;
    v.damping = Math.min(0.95, Math.max(0, p.loop.damping));
    v.t60 = Math.max(0.05, p.loop.t60);
    v.gate = p.loop.gate;
    v.env = 1;
    v.lp1 = 0;
    v.peak = 1;
    v.quietChunks = 0;
    const angle = ((Math.min(1, Math.max(-1, p.pan)) + 1) * Math.PI) / 4;
    v.gainL = Math.cos(angle);
    v.gainR = Math.sin(angle);

    const f0 = toFreq(midi, p.detuneCents);
    v.delay = this.clampDelay(v, loopDelay(f0, v.damping, this.sampleRate));
    this.excite(v, p.excitation, Math.round(this.sampleRate / f0));
  }

  private clampDelay(v: Voice, d: number): number {
    return Math.min(v.buf.length - 8, Math.max(4, d));
  }

  /** Fills the whole delay line with one shaped noise period, tiled, so pitch bends never read silence. */
  private excite(v: Voice, e: ExcitationParams, period: number): void {
    const len = Math.max(8, period);
    const burst = new Float32Array(len);
    for (let k = 0; k < len; k++) burst[k] = this.random();

    // Pick-position comb (circular, since the string is periodic).
    const offset = Math.round(e.pick * len);
    let shaped = burst;
    if (offset > 0 && offset < len) {
      shaped = new Float32Array(len);
      for (let k = 0; k < len; k++) {
        shaped[k] = (burst[k] as number) - (burst[(k - offset + len) % len] as number);
      }
    }
    // Pluck brightness: one-pole low-pass, run twice around the circle to settle its state.
    const c = Math.min(0.98, Math.max(0, e.lowpass));
    let y = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < len; k++) {
        y = (1 - c) * (shaped[k] as number) + c * y;
        shaped[k] = y;
      }
    }
    // Remove DC, normalise to the requested peak.
    let mean = 0;
    for (let k = 0; k < len; k++) mean += shaped[k] as number;
    mean /= len;
    let peak = 1e-9;
    for (let k = 0; k < len; k++) {
      shaped[k] = (shaped[k] as number) - mean;
      peak = Math.max(peak, Math.abs(shaped[k] as number));
    }
    const scale = e.level / peak;
    const size = v.buf.length;
    for (let j = 0; j < size; j++) v.buf[j] = (shaped[j % len] as number) * scale;
    v.writePos = size;
  }

  private render(
    v: Voice,
    left: Float32Array,
    right: Float32Array,
    from: number,
    to: number,
  ): void {
    const n = to - from;
    const sr = this.sampleRate;

    // Advance the (possibly gliding) pitch across this chunk.
    let midiEnd = v.midi;
    if (v.rampLeft > 0) {
      const step = Math.min(n, v.rampLeft);
      midiEnd = v.midi + ((v.targetMidi - v.midi) * step) / v.rampLeft;
      v.rampLeft -= step;
      if (v.rampLeft <= 0) midiEnd = v.targetMidi;
    }
    const f1 = toFreq(midiEnd, v.detuneCents);
    const d0 = v.delay;
    const d1 = this.clampDelay(v, loopDelay(f1, v.damping, sr));
    v.midi = midiEnd;
    v.delay = d1;

    // Loop gain gives a constant 60 dB decay time regardless of the (gliding) pitch.
    const g = Math.pow(10, -3 / (v.t60 * f1));
    const a = v.damping;
    const buf = v.buf;
    const mask = this.mask;
    let wp = v.writePos;
    let lp1 = v.lp1;
    let env = v.env;
    let peak = 0;
    const releaseCoef = this.releaseCoef;
    const gateCoef = this.gateCoef;

    for (let i = 0; i < n; i++) {
      const d = d0 + ((d1 - d0) * (i + 1)) / n;
      const pos = wp - d;
      const i0 = Math.floor(pos);
      const x = pos - i0;
      // 4-point Lagrange through samples at −1, 0, 1, 2, evaluated between 0 and 1.
      const h0 = (-x * (x - 1) * (x - 2)) / 6;
      const h1 = ((x + 1) * (x - 1) * (x - 2)) / 2;
      const h2 = (-(x + 1) * x * (x - 2)) / 2;
      const h3 = ((x + 1) * x * (x - 1)) / 6;
      const y =
        h0 * (buf[(i0 - 1) & mask] as number) +
        h1 * (buf[i0 & mask] as number) +
        h2 * (buf[(i0 + 1) & mask] as number) +
        h3 * (buf[(i0 + 2) & mask] as number);

      lp1 = (1 - a) * y + a * lp1;
      buf[wp & mask] = g * lp1;
      wp++;

      if (v.releasing) env *= releaseCoef;
      else if (v.gating) env *= gateCoef;
      const out = y * env;
      if (Math.abs(out) > peak) peak = Math.abs(out);
      left[from + i] = (left[from + i] as number) + out * v.gainL;
      right[from + i] = (right[from + i] as number) + out * v.gainR;
    }

    v.writePos = wp & mask;
    v.lp1 = Math.abs(lp1) < 1e-20 ? 0 : lp1;
    v.env = env;
    v.peak = peak;

    if (v.gate > 0 && peak < v.gate) v.gating = true;
    if (env < 1e-4) v.active = false;
    if (peak < 1e-6) {
      if (++v.quietChunks > 8) v.active = false;
    } else v.quietChunks = 0;
  }
}
