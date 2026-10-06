import { createContext, useContext, type ReactNode } from 'react';
import type { ChordEvent, ChordRef, PatternId, Section, Song, StrumPattern, VariantGeneratorId, VariantOptions } from '@sw/core';
import type { Density } from '../layout';

/**
 * What the shared song strip needs from the workspace that shows it: which chord and section are
 * selected, what is playing, and what to do when the user acts. The strip draws the same section
 * lanes in every workspace (the chords workspace and the guitar workspace each provide their own
 * host, backed by their own stores); the song's data is edited through these actions so each
 * workspace keeps its own side effects (undo, selection, previews).
 */
export interface StripHost {
  song: Song;
  /** Block width per beat: compact for the guitar workspace, comfortable for the chords one. */
  density: Density;
  /** 'rows': each section its own full-width row (the chords workspace). 'inline': every section side by
   *  side in one scrolling lane, section actions behind a menu (the guitar workspace, short on height). */
  layout: 'rows' | 'inline';
  /** Show the strum pattern lane under each row of chords. Off, a custom pattern's strokes show inside the chords instead. */
  showLane: boolean;
  /** Mark chords with no committed guitar voicing (a dashed edge), which matters on the neck. */
  showVoicingState: boolean;

  selectedEventId: string | null;
  laneEventId: string | null;
  activeSectionId: string | null;
  replaceTargetId: string | null;
  playing: boolean;
  playingEventId: string | null;
  playingBeat: number;
  patternEditorOpen: boolean;

  // Selection and UI state.
  /** A chord block was pressed: select it (and sound it, in the way this workspace does). */
  selectEvent(event: ChordEvent): void;
  setActiveSection(sectionId: string): void;
  setLaneEvent(eventId: string | null): void;
  setPatternEditorOpen(open: boolean): void;
  previewPattern(pattern: StrumPattern, chord: ChordRef, attachments: ChordEvent['attachments']): void;

  // Edits to the song.
  setBeats(eventId: string, beats: number): void;
  reorderEvents(sectionId: string, from: number, to: number): void;
  moveEvent(eventId: string, toSectionId: string, toIndex: number): void;
  addSection(name?: string): void;
  renameSection(sectionId: string, name: string): void;
  duplicateSection(sectionId: string): void;
  removeSection(sectionId: string): void;
  setSectionRepeat(sectionId: string, repeat: number): void;
  clearSection(sectionId: string): void;
  makeVariant(sectionId: string, generator: VariantGeneratorId, options: VariantOptions): void;
  setBlockPattern(eventId: string, patternId: PatternId | null): void;
  setBlockLength(eventId: string, chords: number): void;
  patternForChordOnly(eventId: string): void;
  patternForSection(sectionId: string, patternId: PatternId): void;
  patternForSong(patternId: PatternId): void;
  setSongPattern(patternId: Song['pattern']): void;
  saveStrumPattern(pattern: StrumPattern): void;
  deleteStrumPattern(id: string): void;

  // Slots for what each workspace adds to the lane.
  /** Shown in place of a section's chords when it has none (default: a drop zone). */
  renderEmpty?(section: Section): ReactNode;
  /** Shown under a section's lane (the chord options, the pattern block options, …). */
  renderSectionFooter?(section: Section): ReactNode;
  /** Shown under the sections (e.g. the arrangement editor). */
  renderAfterSections?(): ReactNode;
  /** Words for a chord with no committed guitar voicing, for its accessible name. */
  noVoicingText?: string;
  /** Scroll/jump to the section a variant was made from; defaults to scrolling it into view. */
  onJumpToSource?(sectionId: string): void;
}

const Ctx = createContext<StripHost | null>(null);

export function StripHostProvider({ host, children }: { host: StripHost; children: ReactNode }) {
  return <Ctx.Provider value={host}>{children}</Ctx.Provider>;
}

export function useStripHost(): StripHost {
  const host = useContext(Ctx);
  if (!host) throw new Error('useStripHost needs a StripHostProvider');
  return host;
}
