import { useMemo } from 'react';
import { clearIdentify, playIdentified, sendToChordMode } from '../../state/identifyActions';
import { useStore } from '../../state/store';
import { MAX_STRUM_MS, MIN_STRUM_MS } from '../../theory/chordSettings';
import { readSelection, type IdentifyCell } from '../../theory/identifySelection';
import { formatNoteName } from '../../theory/notes';

const cellText = (c: IdentifyCell) => (c === null ? '–' : c === 'x' ? 'x' : String(c));

/** Pick notes on the neck and see what chord they make (PLAN.md §12). */
export function IdentifyPanel() {
  const selection = useStore((s) => s.identifySel);
  const tuning = useStore((s) => s.tuning);
  const pref = useStore((s) => s.accidentalPref);
  const play = useStore((s) => s.chordPlay);
  const { setChordPlay } = useStore.getState();

  const { notes, readings } = useMemo(
    () => readSelection(tuning.strings, selection, pref),
    [tuning.strings, selection, pref],
  );
  const best = readings[0];
  const alternatives = readings.slice(1);
  const sounding = notes.length > 0;
  const sendable = !!best?.spec;

  return (
    <div className="panel-body identify-panel">
      <p className="muted hint">
        Tap notes on the neck to pick them, one per string; tap another fret on a string to move its
        note, or the same one to clear it. The note behind the nut cycles unused → ○ open → ✕ muted.
        The chord is named as you pick.
      </p>

      <div className="identify-result" aria-live="polite">
        <p className="identify-shape">
          <span className="muted">Strings 6→1</span>{' '}
          <span className="shape-text" data-testid="identify-shape">
            {selection.map(cellText).join(' ')}
          </span>
        </p>
        <h2 className="chord-name" data-testid="identify-name">
          {best ? best.name : sounding ? 'No chord found' : '—'}
        </h2>
        {best && best.kind === 'chord' && best.spec && best.bassPc !== best.rootPc && (
          <p className="muted">Slash chord: {formatNoteName(notes[0]!.name)} in the bass</p>
        )}
        {alternatives.length > 0 && (
          <p data-testid="identify-alternatives">
            <span className="muted">Also</span> {alternatives.map((a) => a.name).join(', ')}
          </p>
        )}
        {sounding && (
          <>
            <p data-testid="identify-notes">
              <span className="muted">Notes</span>{' '}
              {notes.map((n) => formatNoteName(n.name)).join(' ')}
            </p>
            <p data-testid="identify-intervals">
              <span className="muted">Intervals from the root</span>{' '}
              {notes.map((n) => n.interval).join(' ')}
            </p>
          </>
        )}
      </div>

      <div className="panel-row play-row">
        <button type="button" className="button" onClick={playIdentified} disabled={!sounding}>
          ▶ Find chord
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
          onClick={() => sendToChordMode()}
          disabled={!sendable}
          title={
            sendable
              ? 'Open this chord in the Chords tab with this shape as its voicing'
              : 'Only a chord (three or more notes, or a power chord) can be sent'
          }
        >
          Send to Chord mode
        </button>
        <button
          type="button"
          className="button"
          onClick={clearIdentify}
          disabled={selection.every((c) => c === null)}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
