import { useMemo } from 'react';
import { chordName, chroma } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { useSong } from '@sw/song-store/react';
import { ChordDiagram } from '@sw/ui';
import { flaggedChords, revoiceAll, revoiceWith, SHOWN_CANDIDATES } from '../state/revoice';
import { useStore } from '../state/store';

/**
 * The re-voicing assistant (Phase 7 item 2): each chord whose committed voicing no longer fits,
 * with its old shape for reference and the three best shapes in the song's setup now — nearest
 * where the hand was, then a good shape, then the same strings sounding. One tap commits one;
 * "Re-voice all" picks the smoothest set through each section. Both can be undone.
 */
export function RevoicePanel() {
  const song = useSong((s) => s.currentSong());
  const pref = useStore((s) => s.accidentalPref);
  const rules = useStore((s) => s.voicingRules);
  const fretCount = useStore((s) => s.fretCount);
  const flagged = useMemo(
    () => (song ? flaggedChords(song, SHOWN_CANDIDATES, { accidentalPref: pref, voicingRules: rules, fretCount }) : []),
    [song, pref, rules, fretCount],
  );
  const close = () => useStore.getState().setRevoiceOpen(false);
  if (!song) return null;
  const tuningNow = capoedTuning(song.guitar.tuning, song.guitar.capo);

  return (
    <section className="revoice-panel" aria-label="Re-voice chords" data-testid="revoice-panel">
      <div className="strip-toolbar-row">
        <strong>
          {flagged.length === 0
            ? 'Every voicing fits.'
            : `${flagged.length} ${flagged.length === 1 ? 'chord needs' : 'chords need'} a new voicing`}
        </strong>
        {flagged.length > 0 && (
          <button type="button" className="button primary" onClick={() => revoiceAll()}>
            Re-voice all
          </button>
        )}
        <button type="button" className="button" onClick={close}>
          Close
        </button>
      </div>
      <ol className="revoice-list">
        {flagged.map(({ event, voicing, candidates }) => (
          <li key={event.id} className="revoice-row" data-testid="revoice-row">
            <span className="revoice-chord">
              <strong>{chordName(event.chord)}</strong> <span className="muted">{event.chord.numeral}</span>
            </span>
            <figure className="revoice-old" title="The old shape, for reference">
              <ChordDiagram
                frets={voicing.frets}
                tuning={capoedTuning(voicing.tuning, voicing.capo)}
                rootPc={chroma(event.chord.root)}
                capo={voicing.capo}
                size="mini"
              />
              <figcaption className="muted">was</figcaption>
            </figure>
            <span className="revoice-arrow" aria-hidden="true">
              →
            </span>
            {candidates.length === 0 && <span className="muted">No playable shape in this tuning</span>}
            {candidates.map(({ voicing: c }, i) => (
              <button
                key={c.frets.join()}
                type="button"
                className="revoice-candidate"
                aria-label={`Use ${c.frets.map((f) => (f === null ? 'x' : f)).join('-')} for ${chordName(event.chord)}`}
                onClick={() => revoiceWith(event.id, c.frets)}
              >
                <ChordDiagram frets={c.frets} tuning={tuningNow} rootPc={chroma(event.chord.root)} capo={song.guitar.capo} size="mini" />
                {i === 0 && <span className="revoice-best">closest</span>}
              </button>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
