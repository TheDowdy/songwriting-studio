import './patterns.css';
import { STRUM_PRESETS, patternOptions } from '@sw/core';
import type { PatternId, Song } from '@sw/core';

interface Props {
  song: Pick<Song, 'patterns'>;
  /** This chord's or section's own pattern; undefined = it follows the level above. */
  value: PatternId | undefined;
  /** What "no choice" means here, e.g. "Same as the song (Block)". */
  inheritLabel: string;
  onChange: (id: PatternId | null) => void;
  label?: string;
  /**
   * When given, the picker also offers a "New pattern" group (a blank pattern or one of the presets);
   * choosing one calls this with `'blank'` or the preset's name instead of `onChange`.
   */
  onCreate?: (start: string) => void;
}

/** A picker for one chord's or block's own pattern, with "same as the song" as the first choice. */
export function PatternSelect({ song, value, inheritLabel, onChange, label = 'Strum pattern', onCreate }: Props) {
  const options = patternOptions(song);
  return (
    <label className="pb-field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('new:')) onCreate?.(v.slice(4));
          else onChange(v === '' ? null : (v as PatternId));
        }}
      >
        <option value="">{inheritLabel}</option>
        <optgroup label="Built in">
          {options.filter((o) => !o.custom).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </optgroup>
        {options.some((o) => o.custom) && (
          <optgroup label="Your patterns">
            {options.filter((o) => o.custom).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        {onCreate && (
          <optgroup label="New pattern">
            <option value="new:blank">Blank</option>
            {STRUM_PRESETS.map((p) => (
              <option key={p.name} value={`new:${p.name}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
