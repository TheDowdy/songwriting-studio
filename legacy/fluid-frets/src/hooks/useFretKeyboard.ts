import { useCallback, useState } from 'react';
import { strumFingering } from '../state/chordActions';
import { useStore } from '../state/store';
import { tapFret } from '../state/tap';
import { formatNoteName, pitchClass, type Spelling } from '../theory/notes';
import { STRING_COUNT } from '../theory/tunings';

export interface FretCursor {
  /** 0 = lowest string. */
  string: number;
  /** 0 = open. */
  fret: number;
}

interface Options {
  fretCount: number;
  leftHanded: boolean;
  spelling: Spelling;
}

/**
 * Keyboard access to the neck, which is otherwise pointer-only. Focus the fretboard and a cursor
 * appears: the arrow keys move it across the notes as they look on screen (up = higher string,
 * right = towards the body, or towards the nut when left-handed), Home / End jump to the nut and
 * the last fret, Enter or Space does what a tap does in the current tab (plays the note, or edits
 * the chord shape / picks the note), and Shift + Enter strums. The note under the cursor is
 * announced to screen readers.
 */
export function useFretKeyboard({ fretCount, leftHanded, spelling }: Options) {
  const [cursor, setCursor] = useState<FretCursor | null>(null);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const describe = useCallback(
    (c: FretCursor, suffix = '') => {
      const open = useStore.getState().tuning.strings[c.string] ?? 40;
      const note = formatNoteName(spelling[pitchClass(open + c.fret)] as (typeof spelling)[number]);
      const where = c.fret === 0 ? 'open' : `fret ${c.fret}`;
      return `String ${STRING_COUNT - c.string}, ${where}: ${note}${suffix}`;
    },
    [spelling],
  );

  const move = (from: FretCursor, ds: number, df: number): FretCursor => ({
    string: Math.min(STRING_COUNT - 1, Math.max(0, from.string + ds)),
    fret: Math.min(fretCount, Math.max(0, from.fret + df)),
  });

  const handlers = {
    onFocus: (e: React.FocusEvent<SVGSVGElement>) => {
      // Focus on a peg inside the board bubbles up here; only the board itself owns the cursor.
      if (e.target !== e.currentTarget) return;
      // A mouse or touch tap also focuses the board; only show the cursor for keyboard focus.
      if (!e.currentTarget.matches(':focus-visible')) return;
      const c = cursor ?? { string: 0, fret: 0 };
      setCursor(c);
      setFocused(true);
      setAnnouncement(describe(c));
    },
    onBlur: (e: React.FocusEvent<SVGSVGElement>) => {
      if (e.target === e.currentTarget) setFocused(false);
    },
    onKeyDown: (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
      const c = cursor ?? { string: 0, fret: 0 };
      const toward = leftHanded ? -1 : 1;
      let next: FretCursor | null = null;
      switch (e.key) {
        case 'ArrowRight':
          next = move(c, 0, toward);
          break;
        case 'ArrowLeft':
          next = move(c, 0, -toward);
          break;
        case 'ArrowUp':
          next = move(c, 1, 0);
          break;
        case 'ArrowDown':
          next = move(c, -1, 0);
          break;
        case 'Home':
          next = { ...c, fret: 0 };
          break;
        case 'End':
          next = { ...c, fret: fretCount };
          break;
        case 'Enter':
        case ' ': {
          if (e.shiftKey) {
            const { strumShape, tuning } = useStore.getState();
            strumFingering(strumShape ?? tuning.strings.map(() => 0));
            setAnnouncement('Strummed');
          } else {
            tapFret(c.string, c.fret);
            setAnnouncement(describe(c, ' — played'));
          }
          break;
        }
        default:
          return;
      }
      e.preventDefault();
      if (next) {
        setCursor(next);
        setFocused(true);
        setAnnouncement(describe(next));
      }
    },
  };

  return { cursor, focused, announcement, handlers };
}
