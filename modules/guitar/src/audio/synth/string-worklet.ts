import { applyWorkletMessage, PROCESSOR_NAME, type WorkletMessage } from './protocol';
import { StringBank } from './stringDsp';

class StringProcessor extends AudioWorkletProcessor {
  private readonly bank = new StringBank(sampleRate);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<WorkletMessage>) =>
      applyWorkletMessage(this.bank, e.data, sampleRate);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const left = out[0];
    const right = out[1] ?? out[0];
    this.bank.process(left, right, left.length, currentFrame);
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, StringProcessor);
