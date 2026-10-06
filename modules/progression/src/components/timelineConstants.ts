import { DENSITIES } from '@sw/timeline';

/** Width of one beat on the timeline; a chord block (and its pattern lane cell) is `beats × BEAT_PX` wide.
 *  The shared comfortable density, so a 4-beat chord is 176px wide rather than the 216px it was. */
export const BEAT_PX = DENSITIES.comfortable.beatPx;
