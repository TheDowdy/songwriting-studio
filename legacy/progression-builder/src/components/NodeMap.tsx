import { useEffect, useMemo, useState } from 'react';
import { chordKey, chordName } from '../theory/chords';
import { keyLabel } from '../theory/scales';
import type { ChordRef, Key, Origin, Suggestion } from '../theory/types';
import ChordDetail from './ChordDetail';
import FlavorPicker from './FlavorPicker';

const SIZE = 400;
const C = SIZE / 2;
const RING = 140;
const R_CENTER = 46;
const R_NODE = 33;

const ORIGIN_TINT: Record<Origin, string> = {
  diatonic: 'var(--t-diatonic)',
  borrowed: 'var(--t-borrowed)',
  secondary: 'var(--t-secondary)',
};

const ORIGIN_COLOR: Record<Origin, string> = {
  diatonic: 'var(--c-diatonic)',
  borrowed: 'var(--c-borrowed)',
  secondary: 'var(--c-secondary)',
};
const ORIGIN_LABEL: Record<Origin, { name: string; hint: string }> = {
  diatonic: { name: 'In key', hint: 'Uses only notes from the key' },
  borrowed: { name: 'Borrowed', hint: 'From a related scale, for extra colour' },
  secondary: { name: 'Secondary', hint: 'A dominant that pushes toward another chord' },
};

/** Angles (radians, 0 = top, clockwise) for n nodes: best score at the top, then alternating sides. */
function ringAngles(n: number): number[] {
  const step = (2 * Math.PI) / n;
  return Array.from({ length: n }, (_, i) => {
    const offset = i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -i / 2;
    return offset * step;
  });
}

const polar = (angle: number, r: number) => ({ x: C + r * Math.sin(angle), y: C - r * Math.cos(angle) });

interface NodeSpec {
  chord: ChordRef;
  angle: number;
  score?: number;
  reason: string;
  startHere?: boolean;
}

interface Props {
  musicKey: Key;
  center: ChordRef | null;
  suggestions: Suggestion[];
  startRing: ChordRef[];
  onPreview: (chord: ChordRef) => void;
  onAdd: (chord: ChordRef) => void;
}

function NodeLabel({ chord, r }: { chord: ChordRef; r: number }) {
  const name = chordName(chord);
  const size = name.length > 5 ? 11 : name.length > 3 ? 14 : 17;
  return (
    <>
      <text y={-3} textAnchor="middle" fontSize={size} fontWeight={700} fill="var(--fg)">
        {name}
      </text>
      <text y={r * 0.42} textAnchor="middle" fontSize={r > 40 ? 13 : 11} fill="var(--muted)" className="font-mono">
        {chord.numeral}
      </text>
    </>
  );
}

export default function NodeMap({ musicKey, center, suggestions, startRing, onPreview, onAdd }: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [flavorOpen, setFlavorOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingChord, setPendingChord] = useState<ChordRef | null>(null);
  const centerId = center ? chordKey(center) : `start:${musicKey.tonic}:${musicKey.mode}`;

  // A new centre (or key) means a new set of nodes: clear the focused one.
  useEffect(() => setFocusId(null), [centerId]);
  // A new focus starts fresh: any flavor tweak was for the previous node.
  useEffect(() => {
    setFlavorOpen(false);
    setDetailOpen(false);
    setPendingChord(null);
  }, [focusId]);

  const nodes: NodeSpec[] = useMemo(() => {
    if (center) {
      const angles = ringAngles(suggestions.length);
      return suggestions.map((s, i) => ({ chord: s.chord, angle: angles[i], score: s.score, reason: s.reason }));
    }
    const step = (2 * Math.PI) / startRing.length;
    return startRing.map((chord, i) => ({
      chord,
      angle: i * step,
      reason: i === 0 ? `Start here: ${chord.numeral} is home, the chord everything resolves to` : `${chord.numeral} is in the key`,
      startHere: i === 0,
    }));
  }, [center, suggestions, startRing]);

  const idOf = (n: NodeSpec) => `${chordKey(n.chord)}#${n.angle}`;
  const focused = nodes.find((n) => idOf(n) === focusId) ?? null;
  const origins = [...new Set(nodes.map((n) => n.chord.origin))];

  const focus = (n: NodeSpec) => {
    setFocusId(idOf(n));
    onPreview(n.chord);
  };

  return (
    <section aria-label="Chord map" className="w-full rounded-xl border border-line bg-surface px-3 pb-3 pt-2 shadow-[var(--shadow)]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="map-svg mx-auto block h-auto w-full max-w-[520px]" role="group" aria-label="Suggested next chords">
        <defs>
          {(Object.keys(ORIGIN_COLOR) as Origin[]).map((o) => (
            <marker key={o} id={`arrow-${o}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={ORIGIN_COLOR[o]} />
            </marker>
          ))}
        </defs>

        <g key={centerId}>
          {center &&
            nodes.map((n, i) => {
              const from = polar(n.angle, R_CENTER + 3);
              const to = polar(n.angle, RING - R_NODE - 7);
              const score = n.score ?? 0;
              return (
                <line
                  key={`a-${idOf(n)}`}
                  className="map-arrow"
                  style={{ animationDelay: `${i * 25}ms` }}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={ORIGIN_COLOR[n.chord.origin]}
                  strokeWidth={1.2 + 4.3 * score}
                  strokeOpacity={0.22 + 0.7 * score}
                  strokeLinecap="round"
                  markerEnd={`url(#arrow-${n.chord.origin})`}
                />
              );
            })}

          {/* Centre */}
          <g transform={`translate(${C} ${C})`}>
          <g
            className="map-node"
            role="button"
            tabIndex={0}
            aria-label={center ? `Current chord ${chordName(center)}` : `Key ${keyLabel(musicKey)}`}
            onClick={() => center && onPreview(center)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && center && onPreview(center)}
          >
            <circle className="node-body" r={R_CENTER} fill="var(--surface)" stroke="var(--accent)" strokeWidth={3.5} />
            {center ? (
              <NodeLabel chord={center} r={R_CENTER} />
            ) : (
              <>
                <text y={-2} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--fg)">
                  {keyLabel(musicKey)}
                </text>
                <text y={16} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  pick a chord
                </text>
              </>
            )}
            {center && (
              <g
                transform={`translate(${R_CENTER * 0.74} ${-R_CENTER * 0.74})`}
                role="button"
                tabIndex={0}
                aria-label={`Add another ${chordName(center)} to the progression`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(center);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onAdd(center);
                  }
                }}
              >
                <circle r={15} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
                <path d="M -6 0 H 6 M 0 -6 V 6" stroke="var(--accent-fg)" strokeWidth={3} strokeLinecap="round" />
              </g>
            )}
          </g>
          </g>

          {/* Ring */}
          {nodes.map((n, i) => {
            const { x, y } = polar(n.angle, RING);
            const id = idOf(n);
            const isFocused = id === focusId;
            const color = ORIGIN_COLOR[n.chord.origin];
            return (
              <g key={id} transform={`translate(${x} ${y})`}>
              <g
                className="map-node"
                style={{ animationDelay: `${i * 25}ms` }}
                role="button"
                tabIndex={0}
                aria-label={`${chordName(n.chord)}, ${n.chord.numeral}. ${n.reason}`}
                aria-pressed={isFocused}
                onClick={() => focus(n)}
                onDoubleClick={() => onAdd(n.chord)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    focus(n);
                  }
                }}
              >
                <circle className="node-body" r={R_NODE} fill={ORIGIN_TINT[n.chord.origin]} stroke={color} strokeWidth={isFocused ? 4.5 : 2} />
                <NodeLabel chord={n.chord} r={R_NODE} />
                {n.startHere && (
                  <g transform={`translate(0 ${-R_NODE - 14})`}>
                    <rect x={-38} y={-10} width={76} height={20} rx={10} fill="var(--accent)" />
                    <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent-fg)">
                      START HERE
                    </text>
                  </g>
                )}
                {isFocused && (
                  <g
                    transform={`translate(${R_NODE * 0.78} ${-R_NODE * 0.78})`}
                    role="button"
                    aria-label={`Add ${chordName(n.chord)} to progression`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(n.chord);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <circle r={15} fill={color} stroke="var(--surface)" strokeWidth={2} />
                    <path d="M -6 0 H 6 M 0 -6 V 6" stroke="var(--surface)" strokeWidth={3} strokeLinecap="round" />
                  </g>
                )}
              </g>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mx-auto min-h-[4.5rem] max-w-[520px] space-y-2 px-1" aria-live="polite">
        {focused ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {chordName(pendingChord ?? focused.chord)}{' '}
                  <span className="font-normal text-muted">({(pendingChord ?? focused.chord).numeral})</span>
                </p>
                <p className="text-sm text-muted">{focused.reason}</p>
              </div>
              <button
                onClick={() => {
                  setDetailOpen(false);
                  setFlavorOpen((v) => !v);
                }}
                aria-pressed={flavorOpen}
                aria-label="Change flavor or inversion"
                className={`shrink-0 grid size-10 place-items-center rounded-lg border text-base ${flavorOpen ? 'border-accent text-accent' : 'border-line text-muted hover:bg-surface-2'}`}
              >
                ⚙
              </button>
              <button
                onClick={() => {
                  setFlavorOpen(false);
                  setDetailOpen((v) => !v);
                }}
                aria-pressed={detailOpen}
                aria-label="Expand: piano keyboard or guitar diagram"
                className={`shrink-0 grid size-10 place-items-center rounded-lg border text-base ${detailOpen ? 'border-accent text-accent' : 'border-line text-muted hover:bg-surface-2'}`}
              >
                ⛶
              </button>
              <button
                onClick={() => onAdd(pendingChord ?? focused.chord)}
                className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg"
              >
                + Add
              </button>
            </div>
            {flavorOpen && (
              <FlavorPicker
                chord={pendingChord ?? focused.chord}
                musicKey={musicKey}
                onPreview={onPreview}
                onChoose={setPendingChord}
                onClose={() => setFlavorOpen(false)}
              />
            )}
            {detailOpen && <ChordDetail chord={pendingChord ?? focused.chord} onClose={() => setDetailOpen(false)} />}
          </>
        ) : (
          <p className="pt-2 text-center text-sm text-muted">
            {center
              ? 'Tap a chord to hear it and see why it works. Press + to add it.'
              : 'Tap a chord to hear it, then press + to start your progression.'}
          </p>
        )}
      </div>

      <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {origins.map((o) => (
          <li key={o} className="flex items-center gap-1.5" title={ORIGIN_LABEL[o].hint}>
            <span className="inline-block size-2.5 rounded-full" style={{ background: ORIGIN_COLOR[o] }} />
            {ORIGIN_LABEL[o].name}
          </li>
        ))}
        {center && <li>Thicker arrow = stronger move</li>}
      </ul>
    </section>
  );
}
