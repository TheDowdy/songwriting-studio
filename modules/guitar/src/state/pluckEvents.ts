/**
 * A tiny event bus announcing that a string was just plucked, so the fretboard can wobble the
 * string and pulse the marker without React state (which would re-render on every strum hit).
 */
export interface PluckEvent {
  /** 0 = lowest string. */
  string: number;
  /** Fret of the sounding note (0 = open). */
  fret: number;
  /** 0–1. */
  velocity: number;
}

type Listener = (event: PluckEvent) => void;

const listeners = new Set<Listener>();

export function onPluck(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitPluck(event: PluckEvent): void {
  for (const l of listeners) l(event);
}
