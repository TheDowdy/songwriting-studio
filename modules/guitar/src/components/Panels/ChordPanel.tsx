import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  arpeggiateChord,
  chordContext,
  chordContextFor,
  selectBestVoicing,
  selectVoicing,
  stepVoicing,
  strumChord,
} from '../../state/chordActions';
import { inversionOptions } from '../../state/bassMode';
import { clearCurrentVoicing, commitCurrentVoicing, refitCurrentVoicing } from '../../state/progressionChordActions';
import { addChordToProgression } from '../../state/progressionEdits';
import { useStore } from '../../state/store';
import { chordName, findEvent, voicingStatus, type VoicingStatus } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { normalizeChord, type ChordSpec } from '@sw/core/fret/chords';
import { MAX_STRUM_MS, MIN_STRUM_MS } from '@sw/core/fret/chordSettings';
import { identifyChord } from '@sw/core/fret/identify';
import { chromaticName, formatNoteName } from '@sw/core/fret/notes';
import { shapeNotes, shapeText } from '@sw/core/fret/voicings';
import { useSong } from '@sw/song-store/react';
import { Chip, ChordBuilderChips, ChordDiagram } from '@sw/ui';
import { centreWithin } from '../../state/scrollWithin';

/** Horizontal drag needed on the voicing card to step to the next/previous voicing. */
const SWIPE_PX = 50;

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

  // Keep the chosen voicing in view when it changes (Prev/Next, root click, best voicing) — by
  // scrolling the list only, never the page (scrollIntoView would move both).
  useEffect(() => {
    if (selected) centreWithin(ref.current?.closest('.voicing-list') ?? null, ref.current);
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      className="voicing-thumb"
      aria-pressed={selected}
      aria-label={`Voicing ${index + 1}: ${shapeText(frets)}`}
      onClick={() => selectVoicing(index, { play: true })}
    >
      {near || selected ? (
        <ChordDiagram frets={frets} tuning={tuning} rootPc={rootPc} />
      ) : (
        <span className="diagram-placeholder" />
      )}
    </button>
  );
});

/**
 * Chord builder, voicing browser and shape editor (PLAN.md §9.3, §11). In song context (§7 Phase 3
 * item 3) the builder gives way to a read-only "Progression chord" header showing whichever chord
 * the strip focused; the voicing browser, strum/arpeggio and shape editing all still work, now
 * searched on `tuning + capo` (item 4).
 */
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
  const capo = useStore((s) => s.capo);
  const songId = useStore((s) => s.songId);
  const progressionEventId = useStore((s) => s.progressionEventId);
  const progressionChord = useStore((s) => s.progressionChord);
  const bassMode = useStore((s) => s.bassMode);
  const { setChordSpec, setVoicingRules, setChordDisplay, setChordPlay, setEditingShape, setBassMode } =
    useStore.getState();

  // The focused event straight from the song store (not the `progressionChord` mirror above,
  // which drops attachments) — reactive, so a commit/clear/re-fit here or a chord edit in the
  // progression module updates the badge/mini diagram without needing a re-focus.
  const song = useSong((s) => (songId ? s.library[songId] : undefined));
  const focusedEvent = useMemo(() => {
    const found = song && progressionEventId ? findEvent(song, progressionEventId) : null;
    return found ? found.section.events[found.index]! : null;
  }, [song, progressionEventId]);
  const committed = focusedEvent?.attachments?.guitar ?? null;
  const staleness: VoicingStatus = useMemo(
    () => (song && focusedEvent ? voicingStatus(focusedEvent, song) : 'none'),
    [song, focusedEvent],
  );

  const soundingTuning = useMemo(() => capoedTuning(tuning.strings, capo), [tuning.strings, capo]);

  // Always the same list `chordActions` searches (root taps, Prev/Next, "Best voicing"), so a
  // voicing list index here means the same shape there — including the bass/inversion control's
  // filter in song context (Phase 4 item 3).
  const { info, voicings } = useMemo(
    () =>
      chordContextFor({
        chordSpec: spec,
        accidentalPref: pref,
        tuningStrings: tuning.strings,
        fretCount,
        voicingRules: rules,
        capo,
        songId,
        progressionChord,
        bassMode,
      }),
    [spec, pref, tuning.strings, fretCount, rules, capo, songId, progressionChord, bassMode],
  );
  const current = index !== null ? voicings[index] : undefined;

  // What the shape on the neck actually is, which changes as it is edited.
  const heard = useMemo(
    () =>
      shape
        ? identifyChord(
            shapeNotes(soundingTuning, shape).map((n) => n.midi),
            pref,
          )
        : [],
    [shape, soundingTuning, pref],
  );
  const reading = heard[0];
  const matches = reading?.name === info.name;

  const choose = (patch: Partial<ChordSpec>) => setChordSpec(normalizeChord({ ...spec, ...patch }));

  // Swipe on the voicing card to step through the list (touch).
  const swipe = useRef<{ x: number; id: number } | null>(null);

  return (
    <div className="panel-body chord-panel">
      {songId && progressionChord && (
        <p className="muted" data-testid="progression-chord-header">
          From the progression: <strong>{chordName(progressionChord)}</strong> ({progressionChord.numeral}){' '}
          {capo > 0 && <span className="capo-badge">{`Capo ${capo}`}</span>}
        </p>
      )}
      {songId && progressionChord && (
        <fieldset className="chip-group bass-control" data-testid="bass-control">
          <legend>Bass</legend>
          <Chip label="Root" pressed={bassMode === 'root'} reason={null} onChoose={() => setBassMode('root')} onBlocked={() => {}} />
          {inversionOptions(progressionChord).map((n) => (
            <Chip
              key={n}
              label={n === 1 ? '1st' : n === 2 ? '2nd' : '3rd'}
              pressed={bassMode === n}
              reason={null}
              onChoose={() => setBassMode(n)}
              onBlocked={() => {}}
            />
          ))}
          <Chip label="Any bass" pressed={bassMode === 'any'} reason={null} onChoose={() => setBassMode('any')} onBlocked={() => {}} />
        </fieldset>
      )}
      {!songId && (
      <>
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

      <ChordBuilderChips spec={spec} onChange={setChordSpec} />
      </>
      )}

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
        {/* Forced on in song context (§7 Phase 3 item 3) — nothing to toggle, so nothing shown. */}
        {!songId && (
          <label className="check">
            <input
              type="checkbox"
              checked={display.hideOthers}
              onChange={(e) => setChordDisplay({ hideOthers: e.target.checked })}
            />
            <span>Hide other notes</span>
          </label>
        )}
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
          if (dx <= -SWIPE_PX) stepVoicing(1, { play: true });
          else if (dx >= SWIPE_PX) stepVoicing(-1, { play: true });
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="voicing-nav">
          <button
            type="button"
            className="button"
            onClick={() => stepVoicing(-1, { play: true })}
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
            {committed && <span className="committed-badge" data-testid="committed-badge">Committed</span>}
          </div>
          <button
            type="button"
            className="button"
            onClick={() => stepVoicing(1, { play: true })}
            disabled={voicings.length === 0}
          >
            Next ▶
          </button>
        </div>

        {songId && staleness !== 'none' && staleness !== 'ok' && (
          <p className="stale-voicing" role="status" data-testid="stale-voicing">
            <span className="stale-badge" aria-hidden="true">
              ⚠
            </span>{' '}
            {staleness === 'tuning-changed'
              ? "This voicing no longer matches the song's tuning/capo."
              : "This voicing no longer matches the chord."}{' '}
            <button type="button" className="button" onClick={() => refitCurrentVoicing()}>
              Re-fit
            </button>
          </p>
        )}

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
            onClick={() => selectBestVoicing({ play: true })}
            disabled={voicings.length === 0}
          >
            Best voicing
          </button>
          {songId && (
            <button type="button" className="button" onClick={() => commitCurrentVoicing()} disabled={!shape}>
              Use this voicing
            </button>
          )}
          {songId && (
            <button type="button" className="button primary" onClick={() => addChordToProgression(spec, shape)} disabled={!shape}>
              Add to progression
            </button>
          )}
          {songId && committed && (
            <button type="button" className="button" onClick={() => clearCurrentVoicing()}>
              Remove voicing
            </button>
          )}
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
                tuning={soundingTuning}
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
