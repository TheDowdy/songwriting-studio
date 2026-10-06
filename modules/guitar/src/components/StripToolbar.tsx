import { useMemo, useState } from 'react';
import { chordName, chroma, findEvent, inversionCount, inversionOf, keyOfEvent, patternIdFor, patternLabel, toChordSpec, type ChordRef } from '@sw/core';
import { DEFAULT_CHORD, type ChordSpec } from '@sw/core/fret/chords';
import { chromaticName, formatNoteName } from '@sw/core/fret/notes';
import { useSong } from '@sw/song-store/react';
import { ChordBuilderChips, PatternSelect } from '@sw/ui';
import { songStore } from '@sw/song-store';
import { chordChoices } from '../state/chordChoices';
import {
  addChordAfter,
  adjustChordBeats,
  chordFromBuilder,
  duplicateChord,
  removeChord,
  replaceChord,
  setChordFlavour,
  setChordInversion,
} from '../state/progressionEdits';
import { ActionBar, ActionButton, BeatsStepper, ChordTitle } from '@sw/timeline';
import { useStore } from '../state/store';

const INVERSION_LABEL = ['Root', '1st', '2nd', '3rd'];

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

/** "Build any chord…": a root plus the full rich builder, for a chord no suggestion covers. */
function BuildAnyChord({ onUse, eventId }: { onUse: (chord: ChordRef) => void; eventId: string | null }) {
  const pref = useStore((s) => s.accidentalPref);
  const tonic = useSong((s) => { const song = s.currentSong(); return song ? keyOfEvent(song, eventId).tonic : undefined; });
  // Start on the key's tonic: the likeliest root, and one tap from any other.
  const [spec, setSpec] = useState<ChordSpec>(() => ({ ...DEFAULT_CHORD, rootPc: tonic ? chroma(tonic) : DEFAULT_CHORD.rootPc }));
  const chord = chordFromBuilder(spec, eventId);
  return (
    <div className="build-any" data-testid="build-any">
      <label className="field">
        <span>Root</span>
        <select value={spec.rootPc} onChange={(e) => setSpec({ ...spec, rootPc: Number(e.target.value) })}>
          {Array.from({ length: 12 }, (_, pc) => (
            <option key={pc} value={pc}>
              {formatNoteName(chromaticName(pc, pref))}
            </option>
          ))}
        </select>
      </label>
      <ChordBuilderChips spec={spec} onChange={setSpec} />
      <button type="button" className="button primary" disabled={!chord} onClick={() => chord && onUse(chord)}>
        Use {chord ? chordName(chord) : 'this chord'}
      </button>
    </div>
  );
}

/** Ranked suggestions, then the key's other chords, then "Build any chord…" (Phase 6 item 1). */
function ChordChoicePanel({
  eventId,
  mode,
  onChoose,
}: {
  eventId: string | null;
  mode: 'add' | 'replace';
  onChoose: (chord: ChordRef) => void;
}) {
  const song = useSong((s) => s.currentSong());
  const [building, setBuilding] = useState(false);
  const choices = useMemo(() => (song ? chordChoices(song, eventId, mode) : null), [song, eventId, mode]);
  if (!choices) return null;
  const chip = (chord: ChordRef, title?: string) => (
    <button
      key={`${chordName(chord)}:${chord.numeral}`}
      type="button"
      className="choice-chip"
      title={title}
      style={{ backgroundColor: ORIGIN_TINT[chord.origin], borderColor: ORIGIN_COLOR[chord.origin] }}
      onClick={() => onChoose(chord)}
    >
      <span className="choice-chip-name">{chordName(chord)}</span>
      <span className="choice-chip-numeral">{chord.numeral}</span>
    </button>
  );
  return (
    <div className="choice-panel" data-testid={`choices-${mode}`}>
      {choices.suggested.length > 0 && (
        <div className="choice-row" role="group" aria-label="Suggested chords">
          <span className="choice-label">Suggested</span>
          {choices.suggested.map((s) => chip(s.chord, s.reason))}
        </div>
      )}
      <div className="choice-row" role="group" aria-label="Chords in the key">
        <span className="choice-label">{choices.suggested.length > 0 ? 'In the key' : 'Start with'}</span>
        {choices.diatonic.map((c) => chip(c))}
        <button type="button" className="button" aria-expanded={building} onClick={() => setBuilding((v) => !v)}>
          Build any chord…
        </button>
      </div>
      {building && <BuildAnyChord onUse={onChoose} eventId={eventId} />}
    </div>
  );
}

type Panel = 'flavour' | 'inversion' | 'replace' | 'add' | null;

/**
 * Editing the focused progression chord from the guitar module (Phase 6 item 1): Flavour (the rich
 * builder), Inversion, Replace, Beats ±, Duplicate, Remove, and adding a chord after it. With no
 * chord focused (an empty song), it offers chords to start the progression with.
 */
export function StripToolbar() {
  const song = useSong((s) => s.currentSong());
  const eventId = useStore((s) => s.progressionEventId);
  const addSectionId = useStore((s) => s.stripAddSectionId);
  const [panel, setPanel] = useState<Panel>(null);
  const event = useMemo(() => {
    const found = song && eventId ? findEvent(song, eventId) : null;
    return found ? found.section.events[found.index]! : null;
  }, [song, eventId]);

  if (!song) return null;

  // An empty section's "+ Add chord" (or a section just added with "+ Section").
  const addSection = addSectionId ? song.sections.find((s) => s.id === addSectionId) : undefined;
  if (addSection && song.sections.some((s) => s.events.length > 0)) {
    return (
      <section className="strip-toolbar" aria-label={`Add a chord to ${addSection.name}`}>
        <div className="strip-toolbar-row">
          <strong className="strip-toolbar-chord">First chord for {addSection.name}</strong>
          <button type="button" className="button" onClick={() => useStore.getState().setStripAddSectionId(null)}>
            Cancel
          </button>
        </div>
        <ChordChoicePanel
          eventId={null}
          mode="add"
          onChoose={(c) => {
            useStore.getState().setStripAddSectionId(null);
            addChordAfter(null, c, addSection.id);
          }}
        />
      </section>
    );
  }

  if (!event) {
    return (
      <section className="strip-toolbar" aria-label="Start the progression">
        <ChordChoicePanel eventId={null} mode="add" onChoose={(c) => addChordAfter(null, c)} />
      </section>
    );
  }

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const chord = event.chord;
  const inversion = inversionOf(chord);

  return (
    <section className="strip-toolbar" aria-label={`Edit ${chordName(chord)}`}>
      <ActionBar className="strip-toolbar-row">
        <ChordTitle name={chordName(chord)} numeral={chord.numeral} />
        <ActionButton aria-pressed={panel === 'flavour'} onClick={() => toggle('flavour')}>
          Flavour
        </ActionButton>
        <ActionButton aria-pressed={panel === 'inversion'} onClick={() => toggle('inversion')}>
          Inversion
        </ActionButton>
        <ActionButton aria-pressed={panel === 'replace'} onClick={() => toggle('replace')}>
          Replace
        </ActionButton>
        <BeatsStepper beats={event.beats} onChange={(n) => adjustChordBeats(event.id, n - event.beats)} />
        {song && (
          <PatternSelect
            song={song}
            value={event.pattern}
            inheritLabel={`Song default (${patternLabel(song, patternIdFor(song, { pattern: undefined }))})`}
            onChange={(id) => {
              const found = findEvent(song, event.id);
              if (found) songStore.getState().setChordPatterns(found.section.id, found.index, found.index, id || null);
            }}
          />
        )}
        <ActionButton onClick={() => duplicateChord(event.id)}>Duplicate</ActionButton>
        <ActionButton danger onClick={() => removeChord(event.id)}>
          Remove
        </ActionButton>
        <ActionButton aria-pressed={panel === 'add'} onClick={() => toggle('add')}>
          + Add after
        </ActionButton>
      </ActionBar>

      {panel === 'flavour' && (
        <div className="strip-toolbar-panel" data-testid="flavour-panel">
          <ChordBuilderChips spec={toChordSpec(chord)} onChange={(spec) => setChordFlavour(event.id, chord, spec)} />
        </div>
      )}
      {panel === 'inversion' && (
        <div className="strip-toolbar-panel chip-group" role="group" aria-label="Inversion">
          {Array.from({ length: inversionCount(chord) }, (_, i) => (
            <button
              key={i}
              type="button"
              className="chip"
              aria-pressed={inversion === i}
              onClick={() => setChordInversion(event.id, chord, i)}
            >
              {INVERSION_LABEL[i]}
            </button>
          ))}
        </div>
      )}
      {panel === 'replace' && (
        <div className="strip-toolbar-panel">
          <ChordChoicePanel eventId={event.id} mode="replace" onChoose={(c) => replaceChord(event.id, c)} />
        </div>
      )}
      {panel === 'add' && (
        <div className="strip-toolbar-panel">
          <ChordChoicePanel eventId={event.id} mode="add" onChoose={(c) => addChordAfter(event.id, c)} />
        </div>
      )}
    </section>
  );
}
