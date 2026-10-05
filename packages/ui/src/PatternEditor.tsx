import './patterns.css';
import { customPatternId, newId } from '@sw/core';
import type { Song, StrumPattern } from '@sw/core';
import { PatternBuilder } from './PatternBuilder';

interface Props {
  song: Song;
  pattern: StrumPattern;
  onSave: (pattern: StrumPattern) => void;
  onDelete: (id: string) => void;
  /** Called with a renamed copy; the caller saves it and decides where it is used. */
  onDuplicate: (copy: StrumPattern) => void;
  onPreview: (pattern: StrumPattern) => void;
}

/** How many chords (and whether the song itself) use a pattern, as a sentence. */
function usage(song: Song, pattern: StrumPattern): string {
  const id = customPatternId(pattern.id);
  const chords = song.sections.reduce((n, s) => n + s.events.filter((e) => e.pattern === id).length, 0);
  const parts: string[] = [];
  if (song.pattern === id) parts.push('the whole song');
  if (chords > 0) parts.push(chords === 1 ? '1 chord' : `${chords} chords`);
  return parts.length > 0 ? `Used by ${parts.join(', ')}.` : 'Not used yet.';
}

/** The pattern builder with what the selected block needs next to it: copy the pattern, delete it, see where it is used. */
export function PatternEditor({ song, pattern, onSave, onDelete, onDuplicate, onPreview }: Props) {
  return (
    <section className="pb pb-editor" aria-label="Pattern editor">
      <PatternBuilder pattern={pattern} onChange={onSave} onPreview={() => onPreview(pattern)} />
      <div className="pb-row">
        <button
          type="button"
          className="pb-btn"
          onClick={() =>
            onDuplicate({ ...pattern, id: newId(), name: `${pattern.name} copy`, steps: pattern.steps.map((s) => (s ? { ...s } : null)) })
          }
        >
          Duplicate pattern
        </button>
        <button
          type="button"
          className="pb-btn"
          onClick={() => {
            if (confirm(`Delete “${pattern.name}”? Anything using it goes back to the song default.`)) onDelete(pattern.id);
          }}
        >
          Delete pattern
        </button>
        <p className="pb-hint" aria-live="polite">
          {usage(song, pattern)}
        </p>
      </div>
    </section>
  );
}
