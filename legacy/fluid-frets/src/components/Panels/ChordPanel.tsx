import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  arpeggiateChord,
  chordContext,
  selectBestVoicing,
  selectVoicing,
  stepVoicing,
  strumChord,
} from '../../state/chordActions';
import { useStore } from '../../state/store';
import {
  ADDED,
  ALTERATIONS,
  describeChord,
  EXTENSIONS,
  normalizeChord,
  QUALITIES,
  SEVENTHS,
  validateChord,
  type ChordSpec,
} from '../../theory/chords';
import { MAX_STRUM_MS, MIN_STRUM_MS } from '../../theory/chordSettings';
import { identifyChord } from '../../theory/identify';
import { chromaticName, formatNoteName } from '../../theory/notes';
import { findVoicings, shapeNotes, shapeText, targetFromChord } from '../../theory/voicings';
import { ChordDiagram } from './ChordDiagram';

const ALTERATION_TEXT: Record<string, string> = {
  b5: '♭5',
  '#5': '♯5',
  b9: '♭9',
  '#9': '♯9',
  '#11': '♯11',
  b13: '♭13',
};
const OMIT = [
  { key: 'omit3' as const, label: 'no3' },
  { key: 'omit5' as const, label: 'no5' },
];
/** Horizontal drag needed on the voicing card to step to the next/previous voicing. */
const SWIPE_PX = 50;

interface ChipProps {
  label: string;
  pressed: boolean;
  /** Why this option can't be chosen right now, or null. */
  reason: string | null;
  onChoose: () => void;
  onBlocked: (reason: string) => void;
}

/**
 * A choice chip. An option that would make an invalid chord stays visible but greyed, with the
 * reason as its tooltip; tapping it shows the reason below (touch has no hover).
 */
function Chip({ label, pressed, reason, onChoose, onBlocked }: ChipProps) {
  const blocked = reason !== null && !pressed;
  return (
    <button
      type="button"
      className={`chip${blocked ? ' unavailable' : ''}`}
      aria-pressed={pressed}
      aria-disabled={blocked || undefined}
      title={blocked ? (reason as string) : undefined}
      onClick={() => (blocked ? onBlocked(reason as string) : onChoose())}
    >
      {label}
    </button>
  );
}

/**
 * One entry in the voicing strip. A chord can have hundreds of voicings, so the diagram is only
 * built once its slot scrolls near the viewport.
 */
const VoicingThumb = memo(function VoicingThumb({
  index,
  frets,
  tuning,
  rootPc,
  selected,
}: {
  index: number;
  frets: (number | null)[];
  tuning: readonly number[];
  rootPc: number;
  selected: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { root: el.closest('.voicing-list'), rootMargin: '0px 400px 0px 400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  // Keep the chosen voicing in view when it changes (Prev/Next, root click, best voicing).
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      className="voicing-thumb"
      aria-pressed={selected}
      aria-label={`Voicing ${index + 1}: ${shapeText(frets)}`}
      onClick={() => selectVoicing(index)}
    >
      {near || selected ? (
        <ChordDiagram frets={frets} tuning={tuning} rootPc={rootPc} />
      ) : (
        <span className="diagram-placeholder" />
      )}
    </button>
  );
});

/** Chord builder, voicing browser and shape editor (PLAN.md §9.3, §11). */
export function ChordPanel() {
  const spec = useStore((s) => s.chordSpec);
  const rules = useStore((s) => s.voicingRules);
  const display = useStore((s) => s.chordDisplay);
  const play = useStore((s) => s.chordPlay);
  const shape = useStore((s) => s.chordShape);
  const index = useStore((s) => s.voicingIndex);
  const editing = useStore((s) => s.editingShape);
  const pref = useStore((s) => s.accidentalPref);
  const tuning = useStore((s) => s.tuning);
  const fretCount = useStore((s) => s.fretCount);
  const { setChordSpec, setVoicingRules, setChordDisplay, setChordPlay, setEditingShape } =
    useStore.getState();
  const [message, setMessage] = useState<string | null>(null);

  const info = useMemo(() => describeChord(spec, pref), [spec, pref]);
  const voicings = useMemo(
    () => findVoicings(tuning.strings, fretCount, targetFromChord(info), rules),
    [tuning.strings, fretCount, info, rules],
  );
  const current = index !== null ? voicings[index] : undefined;

  // What the shape on the neck actually is, which changes as it is edited.
  const heard = useMemo(
    () =>
      shape
        ? identifyChord(
            shapeNotes(tuning.strings, shape).map((n) => n.midi),
            pref,
          )
        : [],
    [shape, tuning.strings, pref],
  );
  const reading = heard[0];
  const matches = reading?.name === info.name;

  const candidate = (patch: Partial<ChordSpec>) => normalizeChord({ ...spec, ...patch });
  const reasonFor = (patch: Partial<ChordSpec>) => validateChord(candidate(patch));
  const choose = (patch: Partial<ChordSpec>) => {
    setMessage(null);
    setChordSpec(candidate(patch));
  };
  const toggle = <T extends string>(list: readonly T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  // Swipe on the voicing card to step through the list (touch).
  const swipe = useRef<{ x: number; id: number } | null>(null);

  return (
    <div className="panel-body chord-panel">
      <div className="panel-row">
        <label className="field">
          <span>Root</span>
          <select value={spec.rootPc} onChange={(e) => choose({ rootPc: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, pc) => {
              const sharp = formatNoteName(chromaticName(pc, 'sharp'));
              const flat = formatNoteName(chromaticName(pc, 'flat'));
              return (
                <option key={pc} value={pc}>
                  {sharp === flat ? sharp : `${sharp} / ${flat}`}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span>Bass note (slash chord)</span>
          <select
            value={spec.bassPc ?? ''}
            onChange={(e) =>
              choose({ bassPc: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">None</option>
            {Array.from({ length: 12 }, (_, pc) =>
              pc === spec.rootPc ? null : (
                <option key={pc} value={pc}>
                  {formatNoteName(chromaticName(pc, pref))}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <div className="builder-grid">
        <fieldset className="chip-group">
          <legend>Chord</legend>
          {QUALITIES.map((q) => (
            <Chip
              key={q.id}
              label={q.label}
              pressed={spec.quality === q.id}
              reason={reasonFor({ quality: q.id })}
              onChoose={() => choose({ quality: q.id })}
              onBlocked={setMessage}
            />
          ))}
        </fieldset>
        <fieldset className="chip-group">
          <legend>6th / 7th</legend>
          {SEVENTHS.map((v) => (
            <Chip
              key={v.id}
              label={v.label}
              pressed={spec.seventh === v.id}
              reason={reasonFor({ seventh: v.id })}
              onChoose={() => choose({ seventh: v.id })}
              onBlocked={setMessage}
            />
          ))}
        </fieldset>
        <fieldset className="chip-group">
          <legend>Extension</legend>
          {EXTENSIONS.map((v) => (
            <Chip
              key={v.id}
              label={v.label}
              pressed={spec.extension === v.id}
              reason={reasonFor({ extension: v.id })}
              onChoose={() => choose({ extension: v.id })}
              onBlocked={setMessage}
            />
          ))}
        </fieldset>
        <fieldset className="chip-group">
          <legend>Alterations</legend>
          {ALTERATIONS.map((a) => (
            <Chip
              key={a}
              label={ALTERATION_TEXT[a] as string}
              pressed={spec.alterations.includes(a)}
              reason={reasonFor({ alterations: toggle(spec.alterations, a) })}
              onChoose={() => choose({ alterations: toggle(spec.alterations, a) })}
              onBlocked={setMessage}
            />
          ))}
        </fieldset>
        <fieldset className="chip-group">
          <legend>Added</legend>
          {ADDED.map((a) => (
            <Chip
              key={a}
              label={a}
              pressed={spec.added.includes(a)}
              reason={reasonFor({ added: toggle(spec.added, a) })}
              onChoose={() => choose({ added: toggle(spec.added, a) })}
              onBlocked={setMessage}
            />
          ))}
        </fieldset>
        <fieldset className="chip-group">
          <legend>Omit</legend>
          {OMIT.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              pressed={spec[o.key]}
              reason={reasonFor({ [o.key]: !spec[o.key] })}
              onChoose={() => choose({ [o.key]: !spec[o.key] })}
              onBlocked={setMessage}
            />
          ))}
        </fieldset>
      </div>
      <p className="chip-message" role="status" aria-live="polite">
        {message}
      </p>

      <div className="chord-summary">
        <h2 className="chord-name" data-testid="chord-name">
          {info.name}
        </h2>
        <p data-testid="chord-formula">
          <span className="muted">Formula</span> {info.formula}
        </p>
        <p data-testid="chord-notes">
          <span className="muted">Notes</span>{' '}
          {info.tones.map((t) => formatNoteName(t.name)).join(' ')}
        </p>
      </div>

      <div className="panel-row display-options">
        <label className="check">
          <input
            type="checkbox"
            checked={display.showIntervals}
            onChange={(e) => setChordDisplay({ showIntervals: e.target.checked })}
          />
          <span>Show intervals (R, 3, 5, ♭7)</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={display.colourByFunction}
            onChange={(e) => setChordDisplay({ colourByFunction: e.target.checked })}
          />
          <span>Colour by function</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={display.hideOthers}
            onChange={(e) => setChordDisplay({ hideOthers: e.target.checked })}
          />
          <span>Hide other notes</span>
        </label>
      </div>

      <section
        className="voicing-card"
        aria-label="Voicing"
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, id: e.pointerId };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          if (dx <= -SWIPE_PX) stepVoicing(1);
          else if (dx >= SWIPE_PX) stepVoicing(-1);
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="voicing-nav">
          <button
            type="button"
            className="button"
            onClick={() => stepVoicing(-1)}
            disabled={voicings.length === 0}
          >
            ◀ Prev
          </button>
          <div className="voicing-status">
            {voicings.length === 0 ? (
              <strong data-testid="voicing-status">No voicings under these rules</strong>
            ) : (
              <strong data-testid="voicing-status">
                {index !== null
                  ? `Voicing ${index + 1} of ${voicings.length}`
                  : `Edited shape · ${voicings.length} voicings`}
              </strong>
            )}
            {shape && (
              <span className="shape-text" data-testid="shape-text">
                {shapeText(shape)}
              </span>
            )}
          </div>
          <button
            type="button"
            className="button"
            onClick={() => stepVoicing(1)}
            disabled={voicings.length === 0}
          >
            Next ▶
          </button>
        </div>

        {shape && reading && (
          <p className="shape-reading" data-testid="shape-reading">
            {matches ? (
              <>✓ {info.name}</>
            ) : (
              <>
                now: <strong>{reading.name}</strong>
              </>
            )}
            {heard.length > 1 && (
              <span className="muted">
                {' '}
                · also{' '}
                {heard
                  .slice(1, 4)
                  .map((h) => h.name)
                  .join(', ')}
              </span>
            )}
            {current && (
              <span className="muted">
                {' '}
                · {current.fingers} finger{current.fingers === 1 ? '' : 's'}
                {current.barre !== null ? ', barre' : ''}
              </span>
            )}
          </p>
        )}

        <div className="panel-row play-row">
          <button type="button" className="button" onClick={() => strumChord()} disabled={!shape}>
            ▶ Play
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={play.direction === 'up'}
            onClick={() => setChordPlay({ direction: play.direction === 'down' ? 'up' : 'down' })}
            title="Strum direction: a downstroke sounds low → high strings"
          >
            {play.direction === 'down' ? '↓ Down' : '↑ Up'}
          </button>
          <label className="field tempo">
            <span>
              Strum speed <output>{play.speedMs} ms</output>
            </span>
            <input
              type="range"
              min={MIN_STRUM_MS}
              max={MAX_STRUM_MS}
              value={play.speedMs}
              onChange={(e) => setChordPlay({ speedMs: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() => arpeggiateChord()}
            disabled={!shape}
          >
            Arpeggiate
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={editing}
            onClick={() => setEditingShape(!editing)}
            title="Edit shape: tap any lit note to move that string's note there (root notes too)"
          >
            Edit shape
          </button>
          <button
            type="button"
            className="button"
            onClick={() => selectBestVoicing()}
            disabled={voicings.length === 0}
          >
            Best voicing
          </button>
        </div>
        <p className="muted hint">
          Tap a lit root note for the best voicing there. Tap another lit note to move that string’s
          note; tap the sounding note again to mute it; tap the ✕ / ○ behind the nut to toggle mute
          and open.
        </p>
      </section>

      <details className="rules">
        <summary>Voicing rules &amp; filters</summary>
        <div className="panel-row">
          <label className="check">
            <input
              type="checkbox"
              checked={rules.rootInBass}
              onChange={(e) => setVoicingRules({ rootInBass: e.target.checked })}
            />
            <span>Root in bass only</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={rules.noInnerMutes}
              onChange={(e) => setVoicingRules({ noInnerMutes: e.target.checked })}
            />
            <span>No muted inner strings</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={rules.includeOpen}
              onChange={(e) => setVoicingRules({ includeOpen: e.target.checked })}
            />
            <span>Include open strings</span>
          </label>
          <label className="field">
            <span>Max stretch (frets)</span>
            <select
              value={rules.maxStretch}
              onChange={(e) => setVoicingRules({ maxStretch: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Max fingers</span>
            <select
              value={rules.maxFingers}
              onChange={(e) => setVoicingRules({ maxFingers: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Min strings sounding</span>
            <select
              value={String(rules.minStrings)}
              onChange={(e) =>
                setVoicingRules({
                  minStrings: e.target.value === 'auto' ? 'auto' : Number(e.target.value),
                })
              }
            >
              <option value="auto">Auto</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {voicings.length > 0 && (
        <ul
          className="voicing-list"
          aria-label="All voicings, by position on the neck"
          data-testid="voicing-list"
        >
          {voicings.map((v, i) => (
            <li key={shapeText(v.frets)}>
              <VoicingThumb
                index={i}
                frets={v.frets}
                tuning={tuning.strings}
                rootPc={spec.rootPc}
                selected={index === i}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Exposed for tests and the debug hook. */
export { chordContext };
