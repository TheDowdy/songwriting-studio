import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import SheetMusic from './SheetMusic';

/** Full-screen sheet-music page: a white "paper" that prints exactly as shown. Portalled straight
 *  onto `document.body` (not just this module's own root) so printing can hide the whole shell
 *  — header, module tabs, everything — and show only this overlay, wherever it's opened from. */
export default function SheetView({ onClose }: { onClose: () => void }) {
  const [showNumerals, setShowNumerals] = useState(true);

  useEffect(() => {
    document.body.classList.add('sheet-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('sheet-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet-overlay fixed inset-0 z-50 overflow-y-auto bg-bg" role="dialog" aria-label="Sheet music">
      <div className="sheet-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
        <button onClick={onClose} className="h-10 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">
          Back to editor
        </button>
        <label className="ml-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showNumerals} onChange={(e) => setShowNumerals(e.target.checked)} className="size-4" />
          Roman numerals
        </label>
        <button
          onClick={() => window.print()}
          className="ml-auto h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg"
        >
          Print / Save as PDF
        </button>
      </div>
      <div className="px-3 py-6">
        <SheetMusic showNumerals={showNumerals} />
      </div>
    </div>,
    document.body,
  );
}
