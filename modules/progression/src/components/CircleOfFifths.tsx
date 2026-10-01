import { useMemo, useState } from 'react';
import { circleOfFifths, fmt, keyLabel } from '@sw/core';
import type { ChordRef, CircleRole, CircleSegment, GuitarSetup, Key } from '@sw/core';
import ChordFocusCard from './ChordFocusCard';

const SIZE = 400;
const C = SIZE / 2;
/** Inner and outer radius of each ring, with a hairline gap between them. */
const RINGS = {
  major: { r0: 148, r1: 196 },
  minor: { r0: 100, r1: 146 },
  dim: { r0: 58, r1: 98 },
} as const;
const GAP_DEG = 0.8;

const polar = (deg: number, r: number) => ({
  x: C + r * Math.sin((deg * Math.PI) / 180),
  y: C - r * Math.cos((deg * Math.PI) / 180),
});

/** An annular sector from `a0` to `a1` degrees (clockwise from the top) between two radii. */
function sector(a0: number, a1: number, r0: number, r1: number): string {
  const p = (deg: number, r: number) => polar(deg, r);
  const [o0, o1, i1, i0] = [p(a0, r1), p(a1, r1), p(a1, r0), p(a0, r0)];
  return `M ${o0.x} ${o0.y} A ${r1} ${r1} 0 0 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${r0} ${r0} 0 0 0 ${i0.x} ${i0.y} Z`;
}

const ROLE_STYLE: Record<CircleRole, { fill: string; stroke: string; text: string }> = {
  tonic: { fill: 'var(--accent)', stroke: 'var(--accent)', text: 'var(--accent-fg)' },
  diatonic: { fill: 'var(--t-diatonic)', stroke: 'var(--c-diatonic)', text: 'var(--fg)' },
  borrowed: { fill: 'var(--t-borrowed)', stroke: 'var(--c-borrowed)', text: 'var(--fg)' },
  other: { fill: 'var(--surface-2)', stroke: 'var(--line)', text: 'var(--muted)' },
};
const ROLE_LABEL: Record<CircleRole, string> = {
  tonic: 'Key chord',
  diatonic: 'In the key',
  borrowed: 'Borrowed',
  other: 'Outside the key',
};

const labelOf = (s: CircleSegment) => (s.ring === 'dim' ? `${fmt(s.root)}°` : s.ring === 'minor' ? `${fmt(s.root)}m` : fmt(s.root));
const RING_NAME = { major: 'major', minor: 'minor', dim: 'diminished' } as const;
const idOf = (s: CircleSegment) => `${s.ring}:${s.position}`;

function reasonFor(s: CircleSegment): string {
  switch (s.role) {
    case 'tonic':
      return 'The home chord of the key. Everything resolves here.';
    case 'diatonic':
      return `In the key, as ${s.chord.numeral}.`;
    case 'borrowed':
      return `Borrowed from the parallel key, for a darker or brighter colour (${s.chord.numeral}).`;
    default:
      return s.ring === 'dim'
        ? 'Outside the key: a tense, unstable diminished chord. Try the flavor menu for a diminished seventh.'
        : 'Outside the key: a distant or surprising choice, good for a sudden shift or a discord.';
  }
}

interface Props {
  musicKey: Key;
  guitar?: GuitarSetup;
  replacing?: boolean;
  onPreview: (chord: ChordRef) => void;
  onAdd: (chord: ChordRef) => void;
  /** Make a chord's key the key of the section (a key shift). */
  onSetKey: (key: Key) => void;
}

/**
 * The whole circle of fifths: major chords on the outside, their relative minors in the middle and
 * the diminished chord built on each major key's leading tone inside. Segments are shaded by how they
 * relate to the key (key chord, in the key, borrowed, outside), but every one can be picked, so
 * unusual chords and key shifts are one tap away.
 */
export default function CircleOfFifths({ musicKey, guitar, replacing, onPreview, onAdd, onSetKey }: Props) {
  const segments = useMemo(() => circleOfFifths(musicKey), [musicKey]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const focused = segments.find((s) => idOf(s) === focusId) ?? null;

  const focus = (s: CircleSegment) => {
    setFocusId(idOf(s));
    onPreview(s.chord);
  };

  return (
    <section aria-label="Circle of fifths" className="w-full px-1 pb-3 pt-2">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="map-svg mx-auto block h-auto w-full max-w-[520px]" role="group" aria-label="All chords, by fifths">
        {segments.map((s) => {
          const { r0, r1 } = RINGS[s.ring];
          const a0 = s.position * 30 - 15 + GAP_DEG;
          const a1 = s.position * 30 + 15 - GAP_DEG;
          const mid = polar(s.position * 30, (r0 + r1) / 2);
          const style = ROLE_STYLE[s.role];
          const selected = idOf(s) === focusId;
          const name = labelOf(s);
          const size = s.ring === 'major' ? 19 : s.ring === 'minor' ? 15 : 12;
          const showNumeral = s.role === 'tonic' || s.role === 'diatonic';
          return (
            <g
              key={idOf(s)}
              className="map-node"
              role="button"
              tabIndex={0}
              aria-label={`${name}, ${RING_NAME[s.ring]}. ${ROLE_LABEL[s.role]}`}
              aria-pressed={selected}
              onClick={() => focus(s)}
              onDoubleClick={() => onAdd(s.chord)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  focus(s);
                }
              }}
            >
              <path
                className="node-body"
                d={sector(a0, a1, r0, r1)}
                fill={style.fill}
                stroke={selected ? 'var(--fg)' : style.stroke}
                strokeWidth={selected ? 3.5 : 1}
                strokeLinejoin="round"
              />
              <text x={mid.x} y={mid.y - (showNumeral ? 3 : 0)} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={500} fill={style.text}>
                {name}
              </text>
              {showNumeral && (
                <text x={mid.x} y={mid.y + size * 0.62} textAnchor="middle" dominantBaseline="central" fontSize={9} className="font-mono" fill={s.role === 'tonic' ? style.text : 'var(--muted)'}>
                  {s.chord.numeral}
                </text>
              )}
            </g>
          );
        })}
        <g aria-hidden="true" pointerEvents="none">
          <circle cx={C} cy={C} r={52} fill="var(--bg)" stroke="var(--fg)" strokeWidth={1.5} />
          <text x={C} y={C - 4} textAnchor="middle" fontSize={17} fontStyle="italic" fontWeight={500} fill="var(--fg)">
            {keyLabel(musicKey).split(' ')[0]}
          </text>
          <text x={C} y={C + 14} textAnchor="middle" fontSize={11} fontStyle="italic" fill="var(--muted)">
            {keyLabel(musicKey).split(' ').slice(1).join(' ')}
          </text>
        </g>
      </svg>

      <div className="mx-auto min-h-[4.5rem] max-w-[520px] space-y-2 px-1" aria-live="polite">
        {focused ? (
          <ChordFocusCard
            key={focusId}
            chord={focused.chord}
            reason={reasonFor(focused)}
            musicKey={musicKey}
            guitar={guitar}
            replacing={replacing}
            onPreview={onPreview}
            onAdd={onAdd}
            extra={
              focused.ring !== 'dim' ? (
                <button
                  onClick={() => onSetKey({ tonic: focused.root, mode: focused.ring === 'minor' ? 'minor' : 'major' })}
                  className="shrink-0 rounded-full border border-fg px-4 py-2 text-base italic hover:bg-surface-2"
                >
                  Use as key
                </button>
              ) : null
            }
          />
        ) : (
          <p className="pt-2 text-center text-base italic text-muted">Tap any chord to hear it. Press + to add it, or use it as the new key.</p>
        )}
      </div>

      <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm italic text-muted" aria-label="Legend">
        {(Object.keys(ROLE_LABEL) as CircleRole[]).map((r) => (
          <li key={r} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm border" style={{ background: ROLE_STYLE[r].fill, borderColor: ROLE_STYLE[r].stroke }} />
            {ROLE_LABEL[r]}
          </li>
        ))}
      </ul>
    </section>
  );
}
