import { useState } from 'react';
import { useStore } from '../../state/store';
import {
  cleanName,
  findSavedByName,
  MAX_NAME_LENGTH,
  saveTuning,
  suggestName,
} from '../../theory/savedTunings';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Asks for a name (pre-filled with the notes) and stores the current tuning in "My tunings". */
export function SaveTuningDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} title="Save tuning" onClose={onClose}>
      {/* Mounted only while open, so the name is re-suggested from the current strings each time. */}
      <SaveForm onClose={onClose} />
    </Dialog>
  );
}

function SaveForm({ onClose }: { onClose: () => void }) {
  const strings = useStore((s) => s.tuning.strings);
  const pref = useStore((s) => s.accidentalPref);
  const saved = useStore((s) => s.savedTunings);
  const [name, setName] = useState(() => suggestName(strings, pref));
  const [confirming, setConfirming] = useState(false);

  const clash = findSavedByName(saved, name);
  const valid = cleanName(name).length > 0;

  const commit = () => {
    if (!valid) return;
    // A duplicate name needs a second, explicit confirmation before it overwrites.
    if (clash && !confirming) {
      setConfirming(true);
      return;
    }
    const { savedTunings, setSavedTunings, setTuning } = useStore.getState();
    const result = saveTuning(savedTunings, name, strings);
    setSavedTunings(result.saved);
    setTuning(result.tuning);
    onClose();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          className="text-input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setName(e.target.value);
            setConfirming(false);
          }}
        />
      </label>
      {confirming && clash && (
        <p className="dialog-warning" role="alert">
          A tuning named “{clash.name}” already exists. Overwrite it?
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={!valid}>
          {confirming ? 'Overwrite' : 'Save'}
        </button>
      </div>
    </form>
  );
}
