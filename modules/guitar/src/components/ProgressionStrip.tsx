import { useMemo } from 'react';
import { chordName, flattenDetailed, type FlatEvent } from '@sw/core';
import { useSong } from '@sw/song-store/react';
import { selectProgressionEvent } from '../state/progressionChordActions';
import { useStore } from '../state/store';

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
                  <button
                    type="button"
                    className="strip-chord"
                    aria-pressed={event.id === progressionEventId}
                    aria-label={`Chord: ${chordName(event.chord)}, ${event.chord.numeral}, ${event.chord.origin}`}
                    style={{
                      backgroundColor: ORIGIN_TINT[event.chord.origin],
                      borderColor: ORIGIN_COLOR[event.chord.origin],
                    }}
                    onClick={() => selectProgressionEvent(event.id)}
                  >
                    <span className="strip-chord-name">{chordName(event.chord)}</span>
                    <span className="strip-chord-numeral">{event.chord.numeral}</span>
                  </button>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
