import { useId } from 'react';
import { useScaleView } from '../../hooks/useScaleView';
import { describeChord } from '../../theory/chords';
import { playScale, stopScale } from '../../state/scalePlayback';
import { useStore } from '../../state/store';
import { chromaticName, formatNoteName, noteNamePc } from '../../theory/notes';
import {
  diatonicChords,
  NO_OVERLAY,
  supportsDiatonicChords,
  type Overlay,
} from '../../theory/overlays';
import { positionStarts, WINDOW_FRETS } from '../../theory/scalePlayback';
import {
  MAX_TEMPO,
  MIN_TEMPO,
  type PlaybackDirection,
  type PlaybackRange,
} from '../../theory/scaleSettings';
import { getScale, SCALES } from '../../theory/scales';

const encodeOverlay = (o: Overlay): string =>
  o.kind === 'none' || o.kind === 'chord'
    ? o.kind
    : o.kind === 'scale'
      ? `scale:${o.scaleId}`
      : `${o.kind}:${o.degree}`;

function decodeOverlay(value: string): Overlay {
  if (value === 'chord') return { kind: 'chord' };
  const [kind, arg] = value.split(':');
  if (kind === 'scale' && arg) return { kind, scaleId: arg };
  if ((kind === 'triad' || kind === 'seventh') && arg !== undefined) {
    return { kind, degree: Number(arg) };
  }
  return NO_OVERLAY;
}

/** Key, scale, overlay, colour options and scale playback (§10). */
export function ScalePanel() {
  const settings = useStore((s) => s.scaleSettings);
  const playback = useStore((s) => s.playback);
  const playing = useStore((s) => s.playing);
  const pref = useStore((s) => s.accidentalPref);
  const fretCount = useStore((s) => s.fretCount);
  const chordSpec = useStore((s) => s.chordSpec);
  const chordName = describeChord(chordSpec, pref).name;
  const { setScaleSettings, setPlayback } = useStore.getState();
  const vm = useScaleView();
  const id = useId();

  const def = getScale(settings.scaleId);
  const chordsOk = supportsDiatonicChords(def);
  const root = vm?.root;
  const triads = root && diatonicChords(root, def, 'triad', pref);
  const sevenths = root && diatonicChords(root, def, 'seventh', pref);
  const starts = positionStarts(fretCount);
  const positionValue =
    playback.position !== 'auto' && starts.includes(playback.position)
      ? String(playback.position)
      : 'auto';

  const changeScale = (scaleId: string) => {
    const next = getScale(scaleId);
    // A chord overlay makes no sense once the scale can't produce diatonic chords.
    const overlay =
      (settings.overlay.kind === 'triad' || settings.overlay.kind === 'seventh') &&
      !supportsDiatonicChords(next)
        ? NO_OVERLAY
        : settings.overlay;
    setScaleSettings({ scaleId, overlay });
  };

  return (
    <div className="panel-body">
      <div className="panel-row">
        <label className="field">
          <span>Key</span>
          <select
            value={settings.rootPc}
            onChange={(e) => setScaleSettings({ rootPc: Number(e.target.value) })}
          >
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
          <span>Scale</span>
          <select value={settings.scaleId} onChange={(e) => changeScale(e.target.value)}>
            {SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Overlay rings</span>
          <select
            value={encodeOverlay(settings.overlay)}
            onChange={(e) => setScaleSettings({ overlay: decodeOverlay(e.target.value) })}
          >
            <option value="none">None</option>
            <option value="chord">
              Chord from the Chords tab{chordName ? ` (${chordName})` : ''}
            </option>
            {chordsOk && triads && sevenths ? (
              <>
                <optgroup label="Diatonic triads">
                  {triads.map((c) => (
                    <option key={c.degree} value={`triad:${c.degree}`}>
                      {c.numeral} — {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Diatonic seventh chords">
                  {sevenths.map((c) => (
                    <option key={c.degree} value={`seventh:${c.degree}`}>
                      {c.numeral} — {c.name}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              <optgroup label="Diatonic chords (need a 7-note scale)" disabled>
                <option disabled>—</option>
              </optgroup>
            )}
            <optgroup label={`Scale on the same root`}>
              {SCALES.filter((s) => s.id !== def.id).map((s) => (
                <option key={s.id} value={`scale:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.colourMode}
            onChange={(e) => setScaleSettings({ colourMode: e.target.checked })}
          />
          <span>Colour by degree</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.hideOutOfScale}
            onChange={(e) => setScaleSettings({ hideOutOfScale: e.target.checked })}
          />
          <span>Hide out-of-scale notes</span>
        </label>
      </div>

      {vm && (
        <p className="scale-info" data-testid="scale-info">
          <strong>
            {formatNoteName(vm.root)} {def.name}
          </strong>
          <span className="muted">
            {' '}
            · {def.degrees.map((d) => d.label).join(' ')} ·{' '}
            {def.degrees
              .map((d) => formatNoteName(vm.spelling[(noteNamePc(vm.root) + d.interval) % 12]!))
              .join(' ')}
          </span>
        </p>
      )}

      <div className="panel-row playback" role="group" aria-labelledby={`${id}-play`}>
        <span id={`${id}-play`} className="panel-label">
          Play scale
        </span>
        <button
          type="button"
          className="button play"
          aria-pressed={playing}
          onClick={() => (playing ? stopScale() : playScale())}
        >
          {playing ? '■ Stop' : '▶ Play'}
        </button>

        <label className="field tempo">
          <span>
            Tempo <output>{playback.tempo} BPM</output>
          </span>
          <input
            type="range"
            min={MIN_TEMPO}
            max={MAX_TEMPO}
            step={1}
            value={playback.tempo}
            onChange={(e) => setPlayback({ tempo: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>Direction</span>
          <select
            value={playback.direction}
            onChange={(e) => setPlayback({ direction: e.target.value as PlaybackDirection })}
          >
            <option value="up">Ascending</option>
            <option value="down">Descending</option>
            <option value="updown">Up and down</option>
          </select>
        </label>

        <label className="field">
          <span>Range</span>
          <select
            value={playback.range}
            onChange={(e) => setPlayback({ range: e.target.value as PlaybackRange })}
          >
            <option value="octave">1 octave</option>
            <option value="two-octaves">2 octaves</option>
            <option value="neck">Whole neck</option>
          </select>
        </label>

        <label className="field">
          <span>Position</span>
          <select
            value={positionValue}
            disabled={playback.range === 'neck'}
            onChange={(e) =>
              setPlayback({ position: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })
            }
          >
            <option value="auto">Auto</option>
            {starts.map((lo) => (
              <option key={lo} value={lo}>
                Frets {lo}–{lo + WINDOW_FRETS - 1}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
