import { useMemo } from 'react';
import { useRegisterStrip, type StripBehavior } from '@sw/timeline';
import { previewChordInSong, previewStrumPattern } from '../state/playback';
import { useStore } from '../state/store';

/**
 * How the shell's song strip behaves in the chords workspace: pressing a chord selects it and
 * plays it, and every edit goes through this module's store so the chord map, selection and
 * replace target stay in step. Registered once; the handlers read the store when they run.
 */
export function useChordsStrip(): void {
  const behavior = useMemo<StripBehavior>(() => {
    const st = () => useStore.getState();
    return {
      defaults: { density: 'comfortable', showLane: true, foldOnShortScreen: false },
      quickAddSections: true,
      showVoicingState: false,
      songOrderEditable: true,
      selectEvent: (event) => {
        st().selectEvent(event.id);
        if (!st().isPlaying) void previewChordInSong(event.chord, event.beats, event.attachments);
      },
      setActiveSection: (id) => st().setActiveSection(id),
      setLaneEvent: (id) => st().setLaneEvent(id),
      setPatternEditorOpen: (open) => st().setPatternEditorOpen(open),
      previewPattern: (pattern, chord, attachments) => void previewStrumPattern(pattern, chord, attachments),
      setBeats: (id, beats) => st().setEventBeats(id, beats),
      reorderEvents: (sectionId, from, to) => st().reorderEvents(sectionId, from, to),
      moveEvent: (id, toSection, toIndex) => st().moveEvent(id, toSection, toIndex),
      addSection: (name) => st().addSection(name),
      renameSection: (id, name) => st().renameSection(id, name),
      duplicateSection: (id) => st().duplicateSection(id),
      removeSection: (id) => st().removeSection(id),
      setSectionRepeat: (id, repeat) => st().setSectionRepeat(id, repeat),
      clearSection: (id) => st().clearSection(id),
      makeVariant: (id, generator, options) => st().makeVariantWithGenerator(id, generator, options),
      setBlockPattern: (id, pattern) => st().setBlockPattern(id, pattern),
      setBlockLength: (id, chords) => st().setBlockLength(id, chords),
      patternForChordOnly: (id) => st().patternForChordOnly(id),
      patternForSection: (id, pattern) => st().patternForSection(id, pattern),
      patternForSong: (pattern) => st().patternForSong(pattern),
      setSongPattern: (pattern) => st().setPattern(pattern),
      saveStrumPattern: (pattern) => st().saveStrumPattern(pattern),
      deleteStrumPattern: (id) => st().deleteStrumPattern(id),
    };
  }, []);
  useRegisterStrip(behavior);
}
