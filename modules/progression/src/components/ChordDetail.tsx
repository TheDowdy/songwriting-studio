import { useState } from 'react';
import { chordName, chroma, defaultGuitarShape, voicingStatus } from '@sw/core';
import type { ChordEvent, ChordRef, GuitarSetup } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { ChordDiagram } from '@sw/ui';
import PianoKeyboard from './PianoKeyboard';

type View = 'piano' | 'guitar';
const VIEW_KEY = 'chordbuilder:detailView';

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'guitar' ? 'guitar' : 'piano';
  } catch {
    return 'piano';
  }
}

function saveView(v: View): void {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

/**
 * The Guitar view (Phase 5 item 2): the chord's committed voicing, labelled "Your voicing" (and
 * flagged if it no longer fits), or else the shape the guitar module would show first on the
 * song's tuning and capo — the same scorer, so the two modules never disagree about it.
 */
function GuitarView({ chord, attachments, guitar }: { chord: ChordRef; attachments?: ChordEvent['attachments']; guitar: GuitarSetup }) {
  const committed = attachments?.guitar;
  const frets = committed ? committed.frets : defaultGuitarShape(chord, guitar);
  if (!frets) return <p className="text-sm text-muted">No playable shape for this chord in the song's tuning.</p>;
  const tuning = committed ? capoedTuning(committed.tuning, committed.capo) : capoedTuning(guitar.tuning, guitar.capo);
  const capo = committed ? committed.capo : guitar.capo;
  const status = committed ? voicingStatus({ chord, attachments }, { guitar }) : 'none';
  return (
    <figure className="detail-diagram inline-flex flex-col items-center gap-1.5" data-testid="detail-guitar">
      <ChordDiagram frets={frets} tuning={tuning} rootPc={chroma(chord.root)} capo={capo} />
      <figcaption className="text-xs text-muted">
        {committed ? <strong className="text-fg">Your voicing</strong> : 'Suggested voicing'}
        {status === 'chord-changed' && <span className="text-[var(--danger)]"> · no longer matches the chord</span>}
        {status === 'tuning-changed' && <span className="text-[var(--danger)]"> · no longer matches the tuning or capo</span>}
      </figcaption>
    </figure>
  );
}

interface Props {
  chord: ChordRef;
  /** The placed event's attachments, for its committed guitar voicing (none for a suggestion). */
  attachments?: ChordEvent['attachments'];
  /** The song's tuning and capo. */
  guitar: GuitarSetup;
  onClose: () => void;
  /** Opens the guitar module with this chord selected (§7 Phase 3 item 1). Omitted where there is
   *  no placed event to select — e.g. previewing a not-yet-added suggestion from the chord map. */
  onExplore?: () => void;
}

/** Section 7.6: expand a chord to see it on a piano keyboard or a guitar diagram, remembering
 *  which the player last chose. */
export default function ChordDetail({ chord, attachments, guitar, onClose, onExplore }: Props) {
  const [view, setView] = useState<View>(loadView);

  const choose = (v: View) => {
    setView(v);
    saveView(v);
  };

  return (
    <div role="dialog" aria-label={`${chordName(chord)} detail`} className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {chordName(chord)} <span className="font-normal text-muted">({chord.numeral})</span>
        </h3>
        <div className="flex items-center gap-2">
          {onExplore && (
            <button
              onClick={onExplore}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
            >
              Explore guitar voicings →
            </button>
          )}
          <button onClick={onClose} aria-label="Close chord detail" className="grid size-8 place-items-center rounded-lg text-lg text-muted hover:bg-surface-2">
            ×
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 rounded-lg bg-surface-2 p-1" role="group" aria-label="View">
        {(['piano', 'guitar'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => choose(v)}
            aria-pressed={view === v}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${view === v ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto py-1">{view === 'piano' ? <PianoKeyboard chord={chord} /> : <GuitarView chord={chord} attachments={attachments} guitar={guitar} />}</div>
    </div>
  );
}
