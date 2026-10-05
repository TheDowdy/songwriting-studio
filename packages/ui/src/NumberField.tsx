import { useEffect, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}

/**
 * A number input that can be emptied and retyped. It keeps what's typed as a draft and only
 * calls `onCommit` while the draft is a whole number within [min, max]; on blur (or Enter) it
 * clamps what's there, or restores the last good value if the field was left empty.
 */
export function NumberField({ value, min, max, onCommit, onBlur, onKeyDown, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  // Follow outside changes (slider, loading a song) without clobbering a half-typed draft.
  useEffect(() => {
    setDraft((d) => (Number(d) === value && d.trim() !== '' ? d : String(value)));
  }, [value]);

  const settle = () => {
    const n = Math.round(Number(draft));
    if (draft.trim() === '' || Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={(e) => {
        settle();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') settle();
        onKeyDown?.(e);
      }}
    />
  );
}
