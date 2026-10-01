import { useEffect, useMemo, useState } from 'react';
import './patterns.css';
import {
  STRUM_PRESETS,
  customPatternId,
  emptyStrumPattern,
  newId,
  strumPatternFromPreset,
} from '@sw/core';
import type { PatternId, PatternTarget, Song, StrumPattern } from '@sw/core';
import { PatternBuilder } from './PatternBuilder';

interface Props {
  song: Song;
  /** The chord in focus: "This chord" and "Rest of this section" apply from it. */
  focusedEventId: string | null;
  /** The section being edited, for "This section" when no chord is focused. */
  activeSectionId: string | null;
  onSave: (pattern: StrumPattern) => void;
  onDelete: (id: string) => void;
  onApply: (target: PatternTarget, patternId: PatternId) => void;
  onPreview: (pattern: StrumPattern) => void;
}

/** How many chords, sections and whether the song itself use a pattern, as a sentence. */
function usage(song: Song, id: PatternId): string {
  const chords = song.sections.reduce((n, s) => n + s.events.filter((e) => e.pattern === id).length, 0);
  const sections = song.sections.filter((s) => s.pattern === id).length;
  const parts: string[] = [];
  if (song.pattern === id) parts.push('the whole song');
  if (sections > 0) parts.push(sections === 1 ? '1 section' : `${sections} sections`);
  if (chords > 0) parts.push(chords === 1 ? '1 chord' : `${chords} chords`);
  return parts.length > 0 ? `Used by ${parts.join(', ')}.` : 'Not used yet. Choose where to use it below.';
}

/**
 * Make, edit and place the song's own strum patterns: pick or start a pattern, build it, hear it, and
 * use it for one chord, the rest of a section, a whole section or the whole song. Placing is done with
 * the pure operations in `@sw/core`; this only shows the choices.
 */
export function PatternPanel({ song, focusedEventId, activeSectionId, onSave, onDelete, onApply, onPreview }: Props) {
  const patterns = song.patterns ?? [];
  const [editingId, setEditingId] = useState<string | null>(patterns[0]?.id ?? null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!editingId || !patterns.some((p) => p.id === editingId)) setEditingId(patterns[0]?.id ?? null);
  }, [patterns, editingId]);

  const pattern = patterns.find((p) => p.id === editingId) ?? null;
  const patternId = pattern ? customPatternId(pattern.id) : null;
  const sectionId = useMemo(() => {
    const own = focusedEventId ? song.sections.find((s) => s.events.some((e) => e.id === focusedEventId)) : undefined;
    return own?.id ?? activeSectionId ?? song.sections[0]?.id ?? null;
  }, [song.sections, focusedEventId, activeSectionId]);

  const apply = (target: PatternTarget, where: string) => {
    if (!patternId) return;
    onApply(target, patternId);
    setMessage(`“${pattern!.name}” is now used for ${where}.`);
  };

  const create = (value: string) => {
    if (value === '') return;
    const id = newId();
    const preset = STRUM_PRESETS.find((p) => p.name === value);
    onSave(preset ? strumPatternFromPreset(id, preset) : emptyStrumPattern(id, 'New pattern'));
    setEditingId(id);
    setMessage('');
  };

  return (
    <section className="pb pb-panel" aria-label="Strum patterns">
      <h3>Strum patterns</h3>
      <div className="pb-row">
        {patterns.length > 0 && (
          <label className="pb-field">
            <span>Pattern to edit</span>
            <select value={editingId ?? ''} onChange={(e) => { setEditingId(e.target.value); setMessage(''); }}>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="pb-field">
          <span>New pattern from</span>
          <select value="" onChange={(e) => create(e.target.value)}>
            <option value="">Choose a start…</option>
            <option value="blank">Blank</option>
            {STRUM_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {pattern && (
          <>
            <button
              type="button"
              className="pb-btn"
              onClick={() => {
                const id = newId();
                onSave({ ...pattern, id, name: `${pattern.name} copy`, steps: pattern.steps.map((s) => (s ? { ...s } : null)) });
                setEditingId(id);
              }}
            >
              Duplicate pattern
            </button>
            <button
              type="button"
              className="pb-btn"
              onClick={() => {
                if (confirm(`Delete “${pattern.name}”? Anything using it goes back to the default.`)) onDelete(pattern.id);
              }}
            >
              Delete pattern
            </button>
          </>
        )}
      </div>

      {!pattern ? (
        <p className="pb-hint">You haven’t made a strum pattern yet. Choose a starting point above to build one.</p>
      ) : (
        <>
          <PatternBuilder pattern={pattern} onChange={onSave} onPreview={() => onPreview(pattern)} />
          <div className="pb-row" role="group" aria-label="Use this pattern for">
            <span className="pb-label">Use it for</span>
            <button type="button" className="pb-btn" disabled={!focusedEventId} onClick={() => apply({ scope: 'chord', eventId: focusedEventId! }, 'the selected chord')}>
              Selected chord
            </button>
            <button type="button" className="pb-btn" disabled={!focusedEventId} onClick={() => apply({ scope: 'from-chord', eventId: focusedEventId! }, 'the selected chord and the ones after it in its section')}>
              Rest of section
            </button>
            <button type="button" className="pb-btn" disabled={!sectionId} onClick={() => apply({ scope: 'section', sectionId: sectionId! }, 'this section')}>
              Whole section
            </button>
            <button type="button" className="pb-btn pb-primary" onClick={() => apply({ scope: 'song' }, 'the whole song')}>
              Entire song
            </button>
          </div>
          <p className="pb-hint" aria-live="polite">
            {message || usage(song, patternId!)}
          </p>
        </>
      )}
    </section>
  );
}

