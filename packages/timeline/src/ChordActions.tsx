import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { NumberField } from '@sw/ui';

/**
 * The pieces of the "selected chord" action row, shared by the chords and guitar workspaces so the
 * two look and read the same: a title, a Beats stepper, and pill buttons. Each module composes the
 * row from these and supplies the actions it has (the chords workspace has Make major and
 * Piano / guitar; the guitar workspace has Inversion and Strum pattern).
 */
export const MAX_BEATS = 32;

export function ActionBar({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`sw-actions ${className}`.trim()} />;
}

/** The chord being edited: its name, and its Roman numeral if it has one. */
export function ChordTitle({ name, numeral }: { name: string; numeral?: string }) {
  return (
    <strong className="sw-actions-title">
      {name} {numeral && <span className="sw-actions-numeral">{numeral}</span>}
    </strong>
  );
}

export function ActionButton({
  danger = false,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return <button type="button" {...rest} className={`sw-action${danger ? ' danger' : ''} ${className}`.trim()} />;
}

/** − 2 +: step the chord's length a beat at a time, or type a number. */
export function BeatsStepper({ beats, onChange }: { beats: number; onChange: (beats: number) => void }) {
  return (
    <span className="sw-beats" role="group" aria-label="Beats">
      <span className="sw-beats-label" aria-hidden="true">
        Beats
      </span>
      <ActionButton aria-label="One beat shorter" disabled={beats <= 1} onClick={() => onChange(beats - 1)}>
        −
      </ActionButton>
      <NumberField
        min={1}
        max={MAX_BEATS}
        value={beats}
        onCommit={onChange}
        aria-label="Beats for selected chord"
        className="sw-beats-value"
      />
      <ActionButton aria-label="One beat longer" disabled={beats >= MAX_BEATS} onClick={() => onChange(beats + 1)}>
        +
      </ActionButton>
    </span>
  );
}

export type { ReactNode };
