import { createStore } from 'zustand/vanilla';

/** What the shell's single transport controls, read by whichever module is playing. */
export type PlayScope = 'song' | 'section';

export interface TransportSettings {
  loop: boolean;
  /** Play, and loop, the whole song or just the section of the selected chord. */
  scope: PlayScope;
}

export const transportSettings = createStore<TransportSettings>(() => ({ loop: true, scope: 'song' }));

export const setLoop = (loop: boolean) => transportSettings.setState({ loop });
export const setScope = (scope: PlayScope) => transportSettings.setState({ scope });

/**
 * How the shell's transport drives the module that is showing. Each module owns its own sound
 * engine (the chords workspace plays samples in the song's instrument; the guitar workspace plays
 * the guitar synth), so the shell never imports an engine: it calls this. `subscribe` fires
 * whenever `isPlaying` may have changed.
 */
export interface PlaybackAdapter {
  subscribe(listener: () => void): () => void;
  isPlaying(): boolean;
  /** Starts playing, using `transportSettings` for loop and scope. Call from a click or key press. */
  play(): void;
  stop(): void;
}
