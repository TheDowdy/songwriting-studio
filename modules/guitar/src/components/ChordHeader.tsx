import { useChordHeader } from '../hooks/useChordHeader';
import { formatNoteName } from '@sw/core/fret/notes';
import { ChordDiagram } from '@sw/ui';
import { markerStyle, type ScaleStyleOptions } from './Fretboard/markerStyle';

/**
 * The chord-focus header (owner request): the notes of whatever chord is currently selected,
 * shown above the neck with a larger chord name and a small diagram of its voicing. Hidden
 * (`useChordHeader` returns null) whenever no chord is in focus — the Scales tab with no chord
 * overlay, an empty Identify selection, or a Scales overlay that isn't a chord — so it then takes
 * no space.
 */
export function ChordHeader() {
  const header = useChordHeader();
  if (!header) return null;
  const { chord, voicing, capo, display } = header;

  const styleOptions: ScaleStyleOptions | null = display && {
    colourMode: display.colourMode,
    palette: display.palette,
    hideOutOfScale: false,
    chromatic: display.chromatic,
  };
  const notesText = chord.tones.map((t) => formatNoteName(t.note)).join(', ');

  return (
    <div className="chord-header" role="group" aria-label={`${chord.name}: ${notesText}`}>
      <div className="chord-header-info" aria-hidden="true">
        <div className="chord-header-title">
          <span className="chord-header-name" data-testid="chord-header-name">
            {chord.name}
          </span>
          {chord.label && <span className="chord-header-label">{chord.label}</span>}
          {capo !== null && <span className="capo-badge">{`Capo ${capo}`}</span>}
        </div>
        <ul className="chord-header-notes" data-testid="chord-header-notes">
          {chord.tones.map((t, i) => {
            const view = display?.views[t.pc];
            const style =
              styleOptions?.colourMode && view ? markerStyle(view, styleOptions, false, true) : null;
            return (
              <li
                key={`${t.pc}-${i}`}
                className="chord-header-note"
                style={style ? { background: style.fill, color: style.text } : undefined}
              >
                <span className="chord-header-note-name">{formatNoteName(t.note)}</span>
                <span className="chord-header-note-interval">{t.interval}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {voicing && (
        <ChordDiagram frets={voicing.frets} tuning={voicing.tuning} rootPc={voicing.rootPc} />
      )}
    </div>
  );
}
