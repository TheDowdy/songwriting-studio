import './patterns.css';
import { patternOptions } from '@sw/core';
import type { PatternId, Song } from '@sw/core';

interface Props {
  song: Pick<Song, 'patterns'>;
  /** This chord's or section's own pattern; undefined = it follows the level above. */
  value: PatternId | undefined;
  /** What "no choice" means here, e.g. "Same as the song (Block)". */
  inheritLabel: string;
  onChange: (id: PatternId | null) => void;
  label?: string;
}

/** A picker for one chord's or section's own pattern, with "same as the song" as the first choice. */
export function PatternSelect({ song, value, inheritLabel, onChange, label = 'Strum pattern' }: Props) {
  const options = patternOptions(song);
  return (
    <label className="pb-field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as PatternId))}>
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
      </select>
    </label>
  );
}
