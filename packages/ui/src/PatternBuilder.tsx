import { useState } from 'react';
import './patterns.css';
import {
  PATTERN_BEATS_MAX,
  PATTERN_BEATS_MIN,
  STEPS_PER_BEAT,
  cycleStrumStroke,
  resizeStrumPattern,
  setStrumStep,
} from '@sw/core';
import type { StepsPerBeat, StrumExtent, StrumPattern, StrumStep } from '@sw/core';

/** What to call each step within its beat: "1 & 2 &" for eighths, "1 e & a" for sixteenths. */
const COUNTS: Record<StepsPerBeat, string[]> = { 1: [''], 2: ['', '&'], 4: ['', 'e', '&', 'a'] };
const GRID_NAME: Record<StepsPerBeat, string> = { 1: 'Quarter notes', 2: 'Eighth notes', 4: 'Sixteenth notes' };
const EXTENTS: { id: StrumExtent; label: string }[] = [
  { id: 'full', label: 'All strings' },
  { id: 'low', label: 'Low strings' },
  { id: 'high', label: 'High strings' },
];

const arrow = (step: StrumStep | null) => (!step ? '·' : step.stroke === 'down' ? '↓' : '↑');

function describe(step: StrumStep | null): string {
  if (!step) return 'rest';
  const base = step.stroke === 'down' ? 'down strum' : 'up strum';
  const strings = step.extent === 'low' ? ', low strings' : step.extent === 'high' ? ', high strings' : '';
  return `${base}${strings}${step.accent ? ', accent' : ''}`;
}

interface Props {
  pattern: StrumPattern;
  onChange: (pattern: StrumPattern) => void;
  /** Hear the pattern once through. */
  onPreview?: () => void;
}

/**
 * Edits one strum pattern: a row of steps, each a rest, a down strum or an up strum. Tap a step to go
 * rest, down, up, rest; then choose which strings it sounds (all, low or high: a partial strum) and
 * whether it is accented. The length and the grid (quarter, eighth or sixteenth notes) can change
 * without moving the strokes already placed.
 */
export function PatternBuilder({ pattern, onChange, onPreview }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const step = selected !== null ? (pattern.steps[selected] ?? null) : null;
  const total = pattern.steps.length;

  const edit = (i: number, next: StrumStep | null) => onChange(setStrumStep(pattern, i, next));

  return (
    <div className="pb" role="group" aria-label="Strum pattern builder">
      <div className="pb-row">
        <label className="pb-field">
          <span>Pattern name</span>
          <input value={pattern.name} maxLength={60} onChange={(e) => onChange({ ...pattern, name: e.target.value })} />
        </label>
        <label className="pb-field">
          <span>Length in beats</span>
          <select
            value={pattern.beats}
            onChange={(e) => {
              setSelected(null);
              onChange(resizeStrumPattern(pattern, Number(e.target.value), pattern.stepsPerBeat));
            }}
          >
            {Array.from({ length: PATTERN_BEATS_MAX - PATTERN_BEATS_MIN + 1 }, (_, i) => PATTERN_BEATS_MIN + i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="pb-field">
          <span>Steps in each beat</span>
          <select
            value={pattern.stepsPerBeat}
            onChange={(e) => {
              setSelected(null);
              onChange(resizeStrumPattern(pattern, pattern.beats, Number(e.target.value) as StepsPerBeat));
            }}
          >
            {STEPS_PER_BEAT.map((n) => (
              <option key={n} value={n}>
                {GRID_NAME[n]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pb-grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(2.4rem, 1fr))` }}>
        {pattern.steps.map((_, i) => {
          const sub = i % pattern.stepsPerBeat;
          const beat = Math.floor(i / pattern.stepsPerBeat) + 1;
          return (
            <span key={`c${i}`} className={`pb-count${sub === 0 ? ' pb-beat' : ''}`} style={sub === 0 && i > 0 ? { marginLeft: '0.5rem' } : undefined} aria-hidden="true">
              {sub === 0 ? beat : COUNTS[pattern.stepsPerBeat][sub]}
            </span>
          );
        })}
        {pattern.steps.map((s, i) => {
          const sub = i % pattern.stepsPerBeat;
          const beat = Math.floor(i / pattern.stepsPerBeat) + 1;
          const count = sub === 0 ? `${beat}` : `${beat} ${COUNTS[pattern.stepsPerBeat][sub] === '&' ? 'and' : COUNTS[pattern.stepsPerBeat][sub]}`;
          return (
            <button
              key={i}
              type="button"
              className={`pb-step${sub === 0 && i > 0 ? ' pb-beat-start' : ''}`}
              data-stroke={s?.stroke ?? 'rest'}
              data-selected={selected === i}
              data-accent={s?.accent ? 'true' : undefined}
              aria-label={`Step ${i + 1} of ${total}, on ${count}: ${describe(s)}`}
              aria-pressed={selected === i}
              onClick={() => {
                setSelected(i);
                edit(i, cycleStrumStroke(s));
              }}
            >
              {arrow(s)}
              {s && s.extent !== 'full' && <small>{s.extent === 'low' ? 'low' : 'high'}</small>}
            </button>
          );
        })}
      </div>

      <div className="pb-row" role="group" aria-label="Selected step">
        <span className="pb-label">{selected === null ? 'Select a step' : `Step ${selected + 1}`}</span>
        <div className="pb-seg" role="group" aria-label="Strings the stroke sounds">
          {EXTENTS.map((e) => (
            <button
              key={e.id}
              type="button"
              disabled={!step}
              aria-pressed={!!step && step.extent === e.id}
              onClick={() => selected !== null && step && edit(selected, { ...step, extent: e.id })}
            >
              {e.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pb-btn"
          disabled={!step}
          aria-pressed={!!step?.accent}
          onClick={() => selected !== null && step && edit(selected, { ...step, accent: !step.accent })}
        >
          Accent
        </button>
      </div>
      <p className="pb-hint">Tap a step to cycle rest, down and up. A partial strum sounds only the low or high strings.</p>

      <div className="pb-row">
        {onPreview && (
          <button type="button" className="pb-btn" onClick={onPreview}>
            ▶ Preview
          </button>
        )}
        <button
          type="button"
          className="pb-btn"
          disabled={pattern.steps.every((s) => s === null)}
          onClick={() => {
            setSelected(null);
            onChange({ ...pattern, steps: pattern.steps.map(() => null) });
          }}
        >
          Clear steps
        </button>
      </div>
    </div>
  );
}
