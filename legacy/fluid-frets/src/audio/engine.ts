import type { Instrument, PluckOptions, SoundPresetId, VoiceHandle } from './instrument';
import { SynthInstrument, type SynthEngine } from './synth/SynthInstrument';
import { volumeToGain } from './volume';

export type EngineStatus =
  /** Nothing created yet: browsers only allow audio after a user gesture. */
  | 'idle'
  | 'loading'
  | 'running'
  /** Created but not allowed to run (autoplay policy, iOS interruption, tab hidden…). */
  | 'suspended'
  | 'unsupported';

/** `?noworklet` in the URL forces the compatibility (ScriptProcessor) engine, for testing. */
function forceFallbackEngine(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('noworklet');
}

/** Master bus: gain (volume / mute) → soft limiter → speakers. Shared with offline tests. */
export function createMasterBus(ctx: BaseAudioContext): {
  input: GainNode;
  gain: GainNode;
  output: AudioNode;
} {
  const gain = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  gain.connect(limiter);
  limiter.connect(ctx.destination);
  return { input: gain, gain, output: limiter };
}

/**
 * Owns the AudioContext and master bus: instrument → gain → soft limiter → speakers.
 * The context is created lazily inside a user gesture (required by iOS/Safari and Chrome).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private instrument: Instrument | null = null;
  private synth: SynthInstrument | null = null;
  private status: EngineStatus = 'idle';
  private detail = '';
  private readonly listeners = new Set<() => void>();

  private volume = 0.8;
  private muted = false;
  private presetId: SoundPresetId = 'acoustic';

  /** Which synthesis engine is running: the AudioWorklet, or the ScriptProcessor fallback. */
  get synthEngine(): SynthEngine | null {
    return this.synth?.engine ?? null;
  }

  /** The AudioContext, if created (useful for scheduling and tests). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  getStatus = (): EngineStatus => this.status;
  getDetail = (): string => this.detail;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setStatus(status: EngineStatus, detail = ''): void {
    if (status === this.status && detail === this.detail) return;
    this.status = status;
    this.detail = detail;
    for (const l of this.listeners) l();
  }

  /**
   * Creates/resumes the context. Call synchronously from a pointer/key handler so browsers
   * treat it as a user gesture.
   */
  unlock(): void {
    if (this.status === 'unsupported') return;
    if (!this.ctx) this.create();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      // A resumed context that hasn't yet produced sound can still be muted on iOS; the silent
      // buffer below is the usual belt-and-braces trick.
      void ctx.resume().catch(() => this.syncState());
      this.playSilentBuffer(ctx);
    }
  }

  private create(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      this.setStatus('unsupported', 'Web Audio is not available in this browser.');
      return;
    }
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const bus = createMasterBus(ctx);
    const master = bus.input;
    // Pass-through tap so the output level can be inspected (tests, future meters).
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    bus.output.connect(analyser);
    this.analyser = analyser;

    this.ctx = ctx;
    this.master = master;
    this.applyVolume();
    ctx.onstatechange = () => this.syncState();

    const synth = new SynthInstrument(ctx, master, forceFallbackEngine());
    synth.setPreset(this.presetId);
    this.instrument = synth;
    this.synth = synth;
    this.setStatus('loading');
    synth.ready.then(
      () => this.syncState(),
      (err: unknown) =>
        this.setStatus(
          'unsupported',
          err instanceof Error ? err.message : 'Audio failed to start.',
        ),
    );
  }

  private syncState(): void {
    const ctx = this.ctx;
    if (!ctx || this.status === 'unsupported') return;
    this.setStatus(ctx.state === 'running' ? 'running' : 'suspended');
  }

  private playSilentBuffer(ctx: AudioContext): void {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : volumeToGain(this.volume);
    // Short ramp avoids zipper noise while dragging the slider.
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  setPreset(id: SoundPresetId): void {
    this.presetId = id;
    this.instrument?.setPreset(id);
  }

  /** The most recent ~40 ms of output samples (empty until audio has started). */
  getOutputSnapshot(): Float32Array {
    if (!this.analyser) return new Float32Array(0);
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return data;
  }

  /** Peak of the most recent ~40 ms of output (0–1). */
  getOutputPeak(): number {
    return this.getOutputSnapshot().reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  }

  /** Plays a note. Safe to call before the engine is ready: it unlocks and queues the note. */
  pluck(string: number, midi: number, opts?: PluckOptions): VoiceHandle | null {
    this.unlock();
    const instrument = this.instrument;
    if (!instrument) return null;
    return instrument.pluck(string, midi, { when: this.ctx?.currentTime, ...opts });
  }

  /**
   * Plays several notes spaced `spacing` seconds apart on the audio clock (a strum or arpeggio),
   * in the order given. Unlocks audio first, like `pluck`.
   */
  pluckMany(
    notes: readonly { string: number; midi: number }[],
    opts: { velocity?: number; spacing?: number } = {},
  ): void {
    this.unlock();
    const instrument = this.instrument;
    if (!instrument) return;
    const start = (this.ctx?.currentTime ?? 0) + 0.02;
    const spacing = opts.spacing ?? 0.03;
    notes.forEach(({ string, midi }, i) => {
      instrument.pluck(string, midi, { velocity: opts.velocity ?? 0.6, when: start + i * spacing });
    });
  }

  setPitch(voice: VoiceHandle, midi: number, rampMs?: number): void {
    this.instrument?.setPitch(voice, midi, rampMs);
  }

  damp(voice: VoiceHandle, when?: number): void {
    this.instrument?.damp(voice, when);
  }
}

export const audioEngine = new AudioEngine();
