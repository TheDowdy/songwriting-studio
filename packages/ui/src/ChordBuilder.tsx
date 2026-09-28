/**
 * The rich chord builder's chips (moved here from the guitar module in Songwriting Studio Phase 5
 * item 4, so the progression module's Flavor picker offers exactly the same options). An option
 * that would make an invalid chord stays visible but greyed, with the reason as its tooltip;
 * tapping it shows the reason below the chips (touch has no hover).
 *
 * Styling comes from each module's own stylesheet (`.chip`, `.chip-group`, `.builder-grid`,
 * `.chip-message`), so the chips match whichever module they sit in.
 */
import { useState } from 'react';
import {
  ADDED,
  ALTERATIONS,
  EXTENSIONS,
  normalizeChord,
  QUALITIES,
  SEVENTHS,
  validateChord,
  type ChordSpec,
} from '@sw/core/fret/chords';

const ALTERATION_TEXT: Record<string, string> = {
  b5: '♭5',
  '#5': '♯5',
  b9: '♭9',
  '#9': '♯9',
  '#11': '♯11',
  b13: '♭13',
};
const OMIT = [
  { key: 'omit3' as const, label: 'no3' },
  { key: 'omit5' as const, label: 'no5' },
];

export interface ChipProps {
  label: string;
  pressed: boolean;
  /** Why this option can't be chosen right now, or null. */
  reason: string | null;
  onChoose: () => void;
  onBlocked: (reason: string) => void;
}

/** A choice chip. An option that would make an invalid chord stays visible but greyed. */
export function Chip({ label, pressed, reason, onChoose, onBlocked }: ChipProps) {
  const blocked = reason !== null && !pressed;
  return (
    <button
      type="button"
      className={`chip${blocked ? ' unavailable' : ''}`}
      aria-pressed={pressed}
      aria-disabled={blocked || undefined}
      title={blocked ? (reason as string) : undefined}
      onClick={() => (blocked ? onBlocked(reason as string) : onChoose())}
    >
      {label}
    </button>
  );
}

/** Which chip groups to show. The progression module leaves out `quality`: its Flavor picker
 *  changes a chord's colour, never its function. */
export type ChordBuilderGroup = 'quality' | 'seventh' | 'extension' | 'alterations' | 'added' | 'omit';

export const ALL_CHORD_BUILDER_GROUPS: readonly ChordBuilderGroup[] = [
  'quality',
  'seventh',
  'extension',
  'alterations',
  'added',
  'omit',
];

export interface ChordBuilderChipsProps {
  spec: ChordSpec;
  /** Called with the new, normalised spec when an available chip is chosen. */
  onChange: (next: ChordSpec) => void;
  groups?: readonly ChordBuilderGroup[];
}

export function ChordBuilderChips({ spec, onChange, groups = ALL_CHORD_BUILDER_GROUPS }: ChordBuilderChipsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const candidate = (patch: Partial<ChordSpec>) => normalizeChord({ ...spec, ...patch });
  const reasonFor = (patch: Partial<ChordSpec>) => validateChord(candidate(patch));
  const choose = (patch: Partial<ChordSpec>) => {
    setMessage(null);
    onChange(candidate(patch));
  };
  const toggle = <T extends string>(list: readonly T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const show = (g: ChordBuilderGroup) => groups.includes(g);

  return (
    <>
      <div className="builder-grid">
        {show('quality') && (
          <fieldset className="chip-group">
            <legend>Chord</legend>
            {QUALITIES.map((q) => (
              <Chip
                key={q.id}
                label={q.label}
                pressed={spec.quality === q.id}
                reason={reasonFor({ quality: q.id })}
                onChoose={() => choose({ quality: q.id })}
                onBlocked={setMessage}
              />
            ))}
          </fieldset>
        )}
        {show('seventh') && (
          <fieldset className="chip-group">
            <legend>6th / 7th</legend>
            {SEVENTHS.map((v) => (
              <Chip
                key={v.id}
                label={v.label}
                pressed={spec.seventh === v.id}
                reason={reasonFor({ seventh: v.id })}
                onChoose={() => choose({ seventh: v.id })}
                onBlocked={setMessage}
              />
            ))}
          </fieldset>
        )}
        {show('extension') && (
          <fieldset className="chip-group">
            <legend>Extension</legend>
            {EXTENSIONS.map((v) => (
              <Chip
                key={v.id}
                label={v.label}
                pressed={spec.extension === v.id}
                reason={reasonFor({ extension: v.id })}
                onChoose={() => choose({ extension: v.id })}
                onBlocked={setMessage}
              />
            ))}
          </fieldset>
        )}
        {show('alterations') && (
          <fieldset className="chip-group">
            <legend>Alterations</legend>
            {ALTERATIONS.map((a) => (
              <Chip
                key={a}
                label={ALTERATION_TEXT[a] as string}
                pressed={spec.alterations.includes(a)}
                reason={reasonFor({ alterations: toggle(spec.alterations, a) })}
                onChoose={() => choose({ alterations: toggle(spec.alterations, a) })}
                onBlocked={setMessage}
              />
            ))}
          </fieldset>
        )}
        {show('added') && (
          <fieldset className="chip-group">
            <legend>Added</legend>
            {ADDED.map((a) => (
              <Chip
                key={a}
                label={a}
                pressed={spec.added.includes(a)}
                reason={reasonFor({ added: toggle(spec.added, a) })}
                onChoose={() => choose({ added: toggle(spec.added, a) })}
                onBlocked={setMessage}
              />
            ))}
          </fieldset>
        )}
        {show('omit') && (
          <fieldset className="chip-group">
            <legend>Omit</legend>
            {OMIT.map((o) => (
              <Chip
                key={o.key}
                label={o.label}
                pressed={spec[o.key]}
                reason={reasonFor({ [o.key]: !spec[o.key] })}
                onChoose={() => choose({ [o.key]: !spec[o.key] })}
                onBlocked={setMessage}
              />
            ))}
          </fieldset>
        )}
      </div>
      <p className="chip-message" role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
