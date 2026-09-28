import { applyCapo } from '../state/capoActions';
import { useStore } from '../state/store';
import { applyTuning } from '../state/tuningActions';
import { Dialog } from './Toolbar/Dialog';

/**
 * Asks before a tuning or capo change that would leave committed voicings behind (Phase 7 item 1).
 * They're kept and flagged, never deleted; confirming opens the re-voice panel to fix them.
 */
export function ConfirmGuitarChange() {
  const pending = useStore((s) => s.pendingGuitarChange);
  const close = () => useStore.getState().setPendingGuitarChange(null);
  const what = pending?.kind === 'capo' ? 'capo' : 'tuning';
  const confirm = () => {
    if (!pending) return;
    close();
    const applied =
      pending.kind === 'tuning' ? applyTuning(pending.tuning, { confirmed: true }) : applyCapo(pending.capo, { confirmed: true });
    if (!applied) return;
    if (pending.kind === 'tuning') useStore.getState().jumpToTuning(pending.tuning);
    useStore.getState().setRevoiceOpen(true);
  };
  return (
    <Dialog open={!!pending} title={`Change the ${what}?`} onClose={close}>
      {pending && (
        <>
          <p data-testid="confirm-guitar-change">
            {pending.count === 1 ? '1 chord has a voicing' : `${pending.count} chords have voicings`} for the old {what}.
            {pending.count === 1 ? " It'll be kept and flagged" : " They'll be kept and flagged"}, and you can re-voice{' '}
            {pending.count === 1 ? 'it' : 'them'} afterwards.
          </p>
          <div className="dialog-actions">
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
            <button type="button" className="button primary" onClick={confirm}>
              Change {what}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
