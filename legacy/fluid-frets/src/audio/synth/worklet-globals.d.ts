/** Globals that exist only inside an AudioWorkletGlobalScope. */
declare const sampleRate: number;
declare const currentFrame: number;
declare const currentTime: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (...args: never[]) => AudioWorkletProcessor,
): void;
