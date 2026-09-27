/**
 * The guitar module's bottom-panel tab (§7 Phase 3 change 1: the Explore tab was removed — every
 * gesture it offered, tap-to-hear, strum-by-dragging and peg retuning, already works on every
 * other tab, and the Scales tab's Chromatic scale shows all 12 notes). Pure; no store here, so the
 * sanitising rule is unit-tested on its own (§8: treat anything read from storage as untrusted).
 */
export type GuitarTab = 'scale' | 'chord' | 'identify';

const VALID_TABS: readonly GuitarTab[] = ['scale', 'chord', 'identify'];

/** The tab a fresh page — or a persisted 'explore'/unknown value — opens on: Chords when a song
 *  is open, Scales as a stand-alone tool. */
export function defaultGuitarTab(hasSong: boolean): GuitarTab {
  return hasSong ? 'chord' : 'scale';
}

/** Untrusted tab input (storage, §8): a still-valid tab passes through unchanged; the removed
 *  'explore' value and any other garbage sanitise to `null`, meaning "use the context's default"
 *  (`defaultGuitarTab`) — which the caller resolves once it knows whether a song is open. */
export function sanitizeGuitarTab(raw: unknown): GuitarTab | null {
  return typeof raw === 'string' && (VALID_TABS as readonly string[]).includes(raw)
    ? (raw as GuitarTab)
    : null;
}
