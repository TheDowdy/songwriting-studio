import { findEvent } from '@sw/core';
import { songStore } from '@sw/song-store';
import { mirrorStripUi } from '@sw/timeline';
import { useStore } from './store';

/** What the shell's song strip draws as selected, mirrored from the focused chord while the guitar
 *  workspace is in use. (This workspace has no strum lane, replace target or active section of its own.) */
const mirror = () => {
  const id = useStore.getState().progressionEventId;
  const song = songStore.getState().currentSong();
  const found = song && id ? findEvent(song, id) : null;
  mirrorStripUi({
    selectedEventId: id,
    laneEventId: null,
    activeSectionId: found?.section.id ?? null,
    replaceTargetId: null,
    patternEditorOpen: false,
  });
};

useStore.subscribe((s, prev) => {
  if (s.progressionEventId !== prev.progressionEventId) mirror();
});
mirror();
