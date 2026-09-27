import { boardHeight, LAYOUT, nutX } from './geometry';

interface Props {
  capo: number;
  fretCount: number;
  wires: readonly number[];
}

const BAR_WIDTH = 11;
const OVERHANG = 6;

/**
 * The capo bar and the dimmed, unplayable region behind it (§7 Phase 3 item 4): the open-string
 * slot and every fret short of the capo. Drawn in the same right-handed group as the neck/frets/
 * strings (mirrored as a whole for left-handed play, like them), over everything else, so both the
 * wood and any note markers there read as out of play. `pointerEvents="none"` keeps every existing
 * tap/strum gesture on the neck working unchanged.
 */
export function Capo({ capo, fretCount, wires }: Props) {
  if (capo <= 0) return null;
  const at = Math.min(capo, fretCount);
  const barX = wires[at] ?? wires[wires.length - 1] ?? nutX;
  const left = nutX - LAYOUT.openSlotWidth;

  return (
    <g data-capo-bar aria-hidden pointerEvents="none">
      <rect
        data-capo-dim
        x={left}
        y={-OVERHANG}
        width={Math.max(0, barX - left)}
        height={boardHeight + OVERHANG * 2}
        fill="var(--bg, #14201a)"
        opacity={0.55}
      />
      <rect
        x={barX - BAR_WIDTH / 2}
        y={-OVERHANG}
        width={BAR_WIDTH}
        height={boardHeight + OVERHANG * 2}
        rx={4}
        fill="#4a4a4a"
        stroke="rgba(0,0,0,0.6)"
        strokeWidth={1.5}
      />
    </g>
  );
}
