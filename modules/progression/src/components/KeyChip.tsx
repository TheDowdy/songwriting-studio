import { keyLabel, keyOfSection } from '@sw/core';
import { useStore } from '../state/store';

/** The key of the section being edited, as a button that shows or hides the key picker. */
export default function KeyChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const song = useStore((s) => s.song);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const key = keyOfSection(song, activeSectionId);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Key: ${keyLabel(key)}`}
      className={`h-10 shrink-0 rounded-full border px-4 text-base italic ${open ? 'border-accent text-accent' : 'border-fg hover:bg-surface-2'}`}
    >
      Key: {keyLabel(key)} {open ? '▴' : '▾'}
    </button>
  );
}
