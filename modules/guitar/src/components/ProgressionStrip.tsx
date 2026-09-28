import { useMemo } from 'react';
import { chordName, chroma, flattenDetailed, voicingStatus, type ChordEvent, type FlatEvent, type Song } from '@sw/core';
import { capoedTuning } from '@sw/core/fret/capo';
import { useSong } from '@sw/song-store/react';
import { ChordDiagram } from '@sw/ui';
import { selectBestVoicing } from '../state/chordActions';
import { selectProgressionEvent } from '../state/progressionChordActions';
import { useStore } from '../state/store';

/** Selecting a block is a direct user gesture (owner request, §7 Phase 3 change 2): it also plays
 *  the chord's shape, the one the neck then shows — the best voicing `selectProgressionEvent`'s own
 *  chord-selection effect would pick anyway, just sounded here because a click chose it. */
function selectAndPlay(eventId: string): void {
  if (selectProgressionEvent(eventId)) selectBestVoicing({ play: true });
}

const ORIGIN_TINT = {
  diatonic: 'var(--t-diatonic)',
  borrowed: 'var(--t-borrowed)',
  secondary: 'var(--t-secondary)',
};
const ORIGIN_COLOR = {
  diatonic: 'var(--c-diatonic)',
  borrowed: 'var(--c-borrowed)',
  secondary: 'var(--c-secondary)',
};

interface Group {
  arrangementIndex: number;
  sectionId: string;
  name: string;
  items: FlatEvent[];
}

/** One chord block. A committed voicing (§3.2) shows its mini diagram, flagged if it's gone stale
 *  (Phase 4 item 4–5) — exactly the badge `ChordPanel` shows when that chord is focused. */
function StripChord({ event, song, selected }: { event: ChordEvent; song: Song; selected: boolean }) {
  const voicing = event.attachments?.guitar;
  const stale = voicing ? voicingStatus(event, song) !== 'ok' : false;
  return (
    <button
      type="button"
      className={`strip-chord${stale ? ' stale' : ''}`}
      aria-pressed={selected}
      aria-label={`Chord: ${chordName(event.chord)}, ${event.chord.numeral}, ${event.chord.origin}${
        voicing ? (stale ? ', voicing needs a re-fit' : ', voicing committed') : ''
      }`}
      style={{
        backgroundColor: ORIGIN_TINT[event.chord.origin],
        borderColor: ORIGIN_COLOR[event.chord.origin],
      }}
      onClick={() => selectAndPlay(event.id)}
    >
      <span className="strip-chord-name">{chordName(event.chord)}</span>
      <span className="strip-chord-numeral">{event.chord.numeral}</span>
      {voicing && (
        <span className="strip-chord-diagram">
          <ChordDiagram
            frets={voicing.frets}
            tuning={capoedTuning(voicing.tuning, voicing.capo)}
            rootPc={chroma(event.chord.root)}
            size="mini"
          />
          {stale && (
            <span className="strip-chord-stale-badge" aria-hidden="true">
              ⚠
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function groupByArrangementSlot(flat: FlatEvent[], nameOf: (sectionId: string) => string): Group[] {
  const groups: Group[] = [];
  for (const item of flat) {
    const last = groups[groups.length - 1];
    if (last && last.arrangementIndex === item.arrangementIndex) {
      last.items.push(item);
    } else {
      groups.push({ arrangementIndex: item.arrangementIndex, sectionId: item.sectionId, name: nameOf(item.sectionId), items: [item] });
    }
  }
  return groups;
}

/**
 * The progression strip (§7 Phase 3 item 2): sections in arrangement order, read-only, above the
 * bottom panel, shown only in song context. Chord blocks show name, numeral and origin tint as in
 * the progression module; tapping one focuses the Chords tab on that chord (§7 Phase 3 item 3).
 * Horizontally scrollable so a long song stays compact.
 */
export function ProgressionStrip() {
  const song = useSong((s) => s.currentSong());
  const progressionEventId = useStore((s) => s.progressionEventId);

  const groups = useMemo(() => {
    if (!song) return [];
    const flat = flattenDetailed(song);
    return groupByArrangementSlot(flat, (id) => song.sections.find((s) => s.id === id)?.name ?? '?');
  }, [song]);

  if (!song || groups.length === 0) {
    return (
      <section className="progression-strip" aria-label="Progression">
        <p className="muted">This song has no chords yet — add some in the Progression tab.</p>
      </section>
    );
  }

  return (
    <section className="progression-strip" aria-label="Progression">
      <ol className="strip-scroll">
        {groups.map((g) => (
          <li key={g.arrangementIndex} className="strip-group">
            <span className="strip-section-name">{g.name}</span>
            <ol className="strip-chords">
              {g.items.map(({ event }) => (
                <li key={`${g.arrangementIndex}:${event.id}`}>
                  <StripChord event={event} song={song} selected={event.id === progressionEventId} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
