import { songStore } from '@sw/song-store';
import { useSong } from '@sw/song-store/react';
import { PatternPanel } from '@sw/ui';
import { previewStrumPattern } from '../state/progressionPlayback';
import { useStore } from '../state/store';

/** The strum pattern builder under the progression strip (song context only). */
export function StrumPatterns() {
  const songId = useStore((s) => s.songId);
  const focusedEventId = useStore((s) => s.progressionEventId);
  const song = useSong((s) => (songId ? s.library[songId] : undefined));
  if (!song) return null;
  return (
    <div className="strum-patterns">
      <PatternPanel
        song={song}
        focusedEventId={focusedEventId}
        activeSectionId={null}
        onSave={(p) => songStore.getState().saveStrumPattern(p)}
        onDelete={(id) => songStore.getState().deleteStrumPattern(id)}
        onApplyChords={(sectionId, from, to, id) => songStore.getState().setChordPatterns(sectionId, from, to, id)}
        onApplySection={(sectionId, id) => songStore.getState().patternForSection(sectionId, id)}
        onApplySong={(id) => songStore.getState().patternForSong(id)}
        onPreview={previewStrumPattern}
      />
    </div>
  );
}
