import { useStore } from 'zustand';
import type { Song } from '@sw/core';
import { playhead } from './playhead';

/** The chip's text: the section's name, plus its variant label ("up the neck") if it has one. */
export function chipLabel(song: Song, sectionId: string): string {
  const section = song.sections.find((s) => s.id === sectionId);
  if (!section) return '?';
  return section.variantLabel ? `${section.name} · ${section.variantLabel}` : section.name;
}

/**
 * The song's playing order as a row of chips (Verse · Chorus · Verse · Chorus …). The chip being
 * played is filled in the play colour and bold, like the red slash on the sounding beat. A variant
 * chip keeps its source section's colour tint and carries its label. Selecting a chip tells the
 * module which section to scroll to; the module owns editing the arrangement.
 */
export function SongOrderRow({ song, onSelect }: { song: Song; onSelect?: (sectionId: string) => void }) {
  const playingSlot = useStore(playhead, (s) => s.slot);
  if (song.arrangement.length === 0) return null;
  // Tint chips by their family: a section and its variants share a tint index.
  const family = (sectionId: string) => {
    const s = song.sections.find((x) => x.id === sectionId);
    return s?.variantOf ?? s?.id ?? sectionId;
  };
  const families = [...new Set(song.arrangement.map(family))];
  return (
    <nav className="sw-order" aria-label="Song order">
      <span className="sw-order-title">Song order</span>
      <ol className="sw-order-list">
        {song.arrangement.map((sectionId, slot) => {
          const section = song.sections.find((s) => s.id === sectionId);
          const playing = playingSlot === slot;
          return (
            <li key={`${slot}:${sectionId}`}>
              <button
                type="button"
                className={`sw-order-chip${playing ? ' playing' : ''}${section?.variantOf ? ' variant' : ''}`}
                data-family={families.indexOf(family(sectionId)) % 4}
                aria-current={playing ? 'step' : undefined}
                onClick={() => onSelect?.(sectionId)}
              >
                {chipLabel(song, sectionId)}
                {section && section.repeat > 1 && <span className="sw-order-repeat"> ×{section.repeat}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
