import { voicingStatus } from '@sw/core';
import { useSong } from '@sw/song-store/react';
import { undoLastGuitarChange } from '../state/undo';
import { useStore } from '../state/store';

/** The guitar workspace's part of the shell's transport row: the re-voice panel's button when
 *  voicings no longer fit (Phase 4), and Undo for guitar changes (Phase 7 items 2–3). */
export default function TransportExtras() {
  const song = useSong((s) => s.currentSong());
  const undo = useStore((s) => s.guitarUndo);
  const revoiceOpen = useStore((s) => s.revoiceOpen);
  if (!song) return null;
  let stale = 0;
  for (const section of song.sections) {
    for (const event of section.events) if (event.attachments?.guitar && voicingStatus(event, song) !== 'ok') stale++;
  }
  return (
    <>
      {stale > 0 && (
        <button
          type="button"
          className="h-10 rounded-full border border-[var(--danger)] px-4 text-base italic text-[var(--danger)]"
          aria-pressed={revoiceOpen}
          onClick={() => useStore.getState().setRevoiceOpen(!revoiceOpen)}
        >
          ⚠ Re-voice {stale} {stale === 1 ? 'chord' : 'chords'}
        </button>
      )}
      {undo && undo.songId === song.id && (
        <button
          type="button"
          className="h-10 rounded-full border border-fg px-4 text-base italic hover:bg-surface-2"
          onClick={() => undoLastGuitarChange()}
        >
          ↶ Undo {undo.label}
        </button>
      )}
    </>
  );
}
