import type { DriveSpec, FilterSpec, ReverbSpec, SoundPreset } from './synth/presets';

/** A per-preset signal chain: body/pickup EQ → drive → cab → (dry + reverb) → out. */
export interface EffectChain {
  input: AudioNode;
  output: AudioNode;
  dispose(): void;
}

function makeFilter(ctx: BaseAudioContext, spec: FilterSpec): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = spec.type;
  f.frequency.value = spec.freq;
  if (spec.q !== undefined) f.Q.value = spec.q;
  if (spec.gain !== undefined) f.gain.value = spec.gain;
  return f;
}

/** Soft-clip curve: tanh with pre-gain and optional DC bias (asymmetry), re-centred at zero. */
export function driveCurve(
  { amount, asymmetry }: DriveSpec,
  samples = 2048,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const zero = Math.tanh(asymmetry * amount * 0.5);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x + asymmetry * amount * 0.5) - zero;
  }
  return curve;
}

/** Exponentially decaying stereo noise, low-passed per sample so the tail darkens. */
export function makeImpulse(ctx: BaseAudioContext, { decay, damping }: ReverbSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.floor(decay * sr));
  const buffer = ctx.createBuffer(2, length, sr);
  const a = Math.exp((-2 * Math.PI * damping) / sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let seed = 12345 + ch * 7919;
    let lp = 0;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      lp = (1 - a) * noise + a * lp;
      // −60 dB at the end of `decay`.
      data[i] = lp * Math.pow(10, (-3 * i) / (decay * sr));
    }
  }
  return buffer;
}

export function createEffectChain(ctx: BaseAudioContext, preset: SoundPreset): EffectChain {
  const nodes: AudioNode[] = [];
  const input = ctx.createGain();
  nodes.push(input);
  let tail: AudioNode = input;
  const chain = (node: AudioNode) => {
    tail.connect(node);
    tail = node;
    nodes.push(node);
  };

  for (const spec of preset.body) chain(makeFilter(ctx, spec));

  if (preset.drive) {
    for (const spec of preset.drive.pre ?? []) chain(makeFilter(ctx, spec));
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(preset.drive);
    shaper.oversample = '4x';
    chain(shaper);
    for (const spec of preset.drive.post ?? []) chain(makeFilter(ctx, spec));
  }
  for (const spec of preset.cab ?? []) chain(makeFilter(ctx, spec));

  const trim = ctx.createGain();
  trim.gain.value = preset.level;
  chain(trim);

  const output = ctx.createGain();
  nodes.push(output);
  const dry = ctx.createGain();
  dry.gain.value = 1 - preset.reverb.mix * 0.5;
  const wet = ctx.createGain();
  wet.gain.value = preset.reverb.mix;
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, preset.reverb);
  tail.connect(dry);
  dry.connect(output);
  tail.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);
  nodes.push(dry, wet, convolver);

  return {
    input,
    output,
    dispose() {
      for (const n of nodes) n.disconnect();
    },
  };
}
