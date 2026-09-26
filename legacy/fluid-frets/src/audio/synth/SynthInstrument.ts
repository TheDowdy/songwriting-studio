import { midiToFreq } from '../../theory/notes';
import { createEffectChain, type EffectChain } from '../effects';
import type { Instrument, PluckOptions, SoundPresetId, VoiceHandle } from '../instrument';
import { DEFAULT_PRESET_ID, getSoundPreset } from './presets';
import type { PluckParams } from './stringDsp';
import workletUrl from './string-worklet.ts?worker&url';
import { applyWorkletMessage, PROCESSOR_NAME, type WorkletMessage } from './protocol';
import { StringBank } from './stringDsp';

const STRING_COUNT = 6;
/** Max random detune per pluck, in cents (±). */
const DETUNE_CENTS = 1.5;

/** Frames per ScriptProcessor callback: ~23 ms at 44.1 kHz, a compromise between latency and glitches. */
const FALLBACK_BUFFER = 1024;

export type SynthEngine = 'worklet' | 'script-processor';

/**
 * Physical-model string synth: one polyphonic AudioWorklet (see stringDsp.ts) feeding a
 * per-preset effect chain. Messages sent before the worklet has loaded are queued.
 *
 * AudioWorklet needs a secure context (https or localhost). Where it is missing — such as a page
 * served over plain http on a LAN — the same string model runs in a ScriptProcessorNode on the
 * main thread instead: a little more latency, and it can glitch if the page is busy, but it plays.
 */
export class SynthInstrument implements Instrument {
  private node: AudioNode | null = null;
  private post: ((m: WorkletMessage) => void) | null = null;
  /** Which engine is producing sound. */
  engine: SynthEngine = 'worklet';
  private queue: WorkletMessage[] = [];
  private chain: EffectChain | null = null;
  private presetId: SoundPresetId = DEFAULT_PRESET_ID;
  private nextId = 1;
  /** Resolves when the worklet is loaded and audio can flow; rejects if it cannot load. */
  readonly ready: Promise<void>;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly destination: AudioNode,
    /** Force the ScriptProcessor fallback (testing, or a browser with a broken AudioWorklet). */
    private readonly forceFallback = false,
  ) {
    this.applyPreset();
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    if (this.forceFallback || !this.ctx.audioWorklet) {
      this.loadFallback();
      return;
    }
    try {
      await this.ctx.audioWorklet.addModule(workletUrl);
    } catch {
      // Some browsers expose audioWorklet but refuse to load it (blocked, or unsupported syntax).
      this.loadFallback();
      return;
    }
    const node = new AudioWorkletNode(this.ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.attach(node, (m) => node.port.postMessage(m));
  }

  /** The same string model, run on the main thread in a ScriptProcessorNode. */
  private loadFallback(): void {
    const ctx = this.ctx as AudioContext;
    const bank = new StringBank(ctx.sampleRate);
    const node = ctx.createScriptProcessor(FALLBACK_BUFFER, 0, 2);
    node.onaudioprocess = (e) => {
      const left = e.outputBuffer.getChannelData(0);
      const right = e.outputBuffer.numberOfChannels > 1 ? e.outputBuffer.getChannelData(1) : left;
      bank.process(left, right, left.length, Math.round(e.playbackTime * ctx.sampleRate));
    };
    this.engine = 'script-processor';
    this.attach(node, (m) => applyWorkletMessage(bank, m, ctx.sampleRate));
  }

  private attach(node: AudioNode, post: (m: WorkletMessage) => void): void {
    if (this.chain) node.connect(this.chain.input);
    this.node = node;
    this.post = post;
    for (const m of this.queue) post(m);
    this.queue = [];
  }

  private send(message: WorkletMessage): void {
    if (this.post) this.post(message);
    else this.queue.push(message);
  }

  private applyPreset(): void {
    const old = this.chain;
    const chain = createEffectChain(this.ctx, getSoundPreset(this.presetId));
    chain.output.connect(this.destination);
    this.node?.disconnect();
    this.node?.connect(chain.input);
    this.chain = chain;
    if (old) {
      // Let anything still in the old chain's reverb tail finish being disconnected quietly.
      old.output.disconnect();
      old.dispose();
    }
  }

  setPreset(id: SoundPresetId): void {
    if (id === this.presetId) return;
    this.presetId = id;
    this.applyPreset();
  }

  pluck(string: number, midi: number, opts: PluckOptions = {}): VoiceHandle {
    const velocity = Math.min(1, Math.max(0, opts.velocity ?? 0.8));
    const brightness = Math.min(1, Math.max(0, opts.brightness ?? 0));
    const preset = getSoundPreset(this.presetId).string;
    const freq = midiToFreq(midi);
    const id = this.nextId++;
    const params: PluckParams = {
      id,
      string,
      midi,
      ...(opts.when !== undefined ? { when: opts.when } : {}),
      detuneCents: (Math.random() * 2 - 1) * DETUNE_CENTS,
      // Spread strings gently across the stereo field, low strings left.
      pan: ((string / (STRING_COUNT - 1)) * 2 - 1) * 0.3,
      excitation: {
        lowpass:
          Math.min(0.97, preset.pluckLowpass + (1 - velocity) * preset.velocitySoftening * 1.5) *
          (1 - 0.4 * brightness),
        pick: preset.pickPosition,
        level: 0.2 + 0.8 * velocity,
      },
      loop: {
        // Low strings sustain longer than high ones.
        t60: Math.min(
          20,
          Math.max(0.3, preset.sustain * Math.pow(freq / 110, -preset.sustainExponent)),
        ),
        damping: Math.min(0.9, preset.damping * Math.pow(freq / 220, -0.2)),
        gate: preset.gate,
      },
    };
    this.send({ type: 'pluck', params });
    return { id, string };
  }

  setPitch(voice: VoiceHandle, midi: number, rampMs = 30): void {
    this.send({ type: 'pitch', id: voice.id, midi, rampMs });
  }

  damp(voice: VoiceHandle, when?: number): void {
    this.send({ type: 'damp', id: voice.id, ...(when !== undefined ? { when } : {}) });
  }
}
