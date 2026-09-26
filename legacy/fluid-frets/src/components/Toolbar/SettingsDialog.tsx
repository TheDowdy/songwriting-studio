import { useRef, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import { clearSettings } from '../../state/storage';
import { useStore, type ThemeSetting } from '../../state/store';
import { selectTuning } from '../../state/tuningActions';
import { midiToName } from '../../theory/notes';
import {
  deleteTuning,
  exportTunings,
  importTunings,
  renameTuning,
  resolveTuning,
} from '../../theory/savedTunings';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tuning range, strum behaviour and management (rename / delete / export / import) of saved tunings. */
export function SettingsDialog({ open, onClose }: Props) {
  const unlimited = useStore((s) => s.unlimitedRange);
  const strum = useStore((s) => s.strumOnTuningChange);
  const saved = useStore((s) => s.savedTunings);
  const pref = useStore((s) => s.accidentalPref);
  const palette = useStore((s) => s.palette);
  const theme = useStore((s) => s.theme);
  const largeNeck = useStore((s) => s.largeNeck);
  const [confirmReset, setConfirmReset] = useState(false);
  const {
    setUnlimitedRange,
    setStrumOnTuningChange,
    setSavedTunings,
    setPalette,
    setTheme,
    setLargeNeck,
  } = useStore.getState();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rename = (id: string, name: string) => {
    const result = renameTuning(useStore.getState().savedTunings, id, name);
    if (result.error) setMessage({ text: result.error, error: true });
    else {
      setMessage(null);
      setSavedTunings(result.saved);
      const { tuning, setTuning } = useStore.getState();
      const renamed = result.saved.find((t) => t.id === id);
      if (renamed && tuning.id === id) setTuning(renamed);
    }
  };

  const remove = (id: string) => {
    const state = useStore.getState();
    state.setSavedTunings(deleteTuning(state.savedTunings, id));
    // If the deleted tuning was selected, the strings stay but are now just "Custom".
    if (state.tuning.id === id) {
      state.setTuning(resolveTuning(state.tuning.strings, useStore.getState().savedTunings));
    }
    setMessage(null);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const result = importTunings(useStore.getState().savedTunings, await file.text());
    setSavedTunings(result.saved);
    const parts = [`Imported ${result.added}`];
    if (result.skipped) parts.push(`${result.skipped} already saved`);
    setMessage({
      text: `${parts.join(', ')}.${result.errors.length ? ' ' + result.errors.join(' ') : ''}`,
      error: result.added === 0 && result.errors.length > 0,
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} title="Settings" onClose={onClose}>
      <label className="field">
        <span>Theme</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeSetting)}>
          <option value="system">Follow my device</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={largeNeck}
          onChange={(e) => setLargeNeck(e.target.checked)}
        />
        <span>Large neck for touch (scrolls sideways; strings and pegs 40 px apart)</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => setUnlimitedRange(e.target.checked)}
        />
        <span>Unlimited tuning range (default: 7 semitones down, 5 up per string)</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={strum}
          onChange={(e) => setStrumOnTuningChange(e.target.checked)}
        />
        <span>Strum the open strings when a tuning is chosen</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={palette === 'colourblind'}
          onChange={(e) => setPalette(e.target.checked ? 'colourblind' : 'rainbow')}
        />
        <span>Colour-blind-friendly scale colours</span>
      </label>

      <h3 className="dialog-subtitle">My tunings</h3>
      {saved.length === 0 ? (
        <p className="muted">Nothing saved yet. Use “Save tuning” in the toolbar.</p>
      ) : (
        <ul className="tuning-list">
          {saved.map((t) => (
            <li key={t.id}>
              <input
                type="text"
                className="text-input"
                aria-label={`Rename ${t.name}`}
                defaultValue={t.name}
                onBlur={(e) => {
                  if (e.target.value !== t.name) rename(t.id, e.target.value);
                  else setMessage(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="muted notes">
                {t.strings.map((m) => midiToName(m, pref)).join(' ')}
              </span>
              <button type="button" className="button" onClick={() => selectTuning(t)}>
                Use
              </button>
              <button
                type="button"
                className="button danger"
                aria-label={`Delete ${t.name}`}
                onClick={() => remove(t.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dialog-actions start">
        <button
          type="button"
          className="button"
          disabled={saved.length === 0}
          onClick={() => downloadText('fluid-frets-tunings.json', exportTunings(saved))}
        >
          Export JSON
        </button>
        <button type="button" className="button" onClick={() => fileRef.current?.click()}>
          Import JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Import tunings file"
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
      </div>
      {message && (
        <p className={message.error ? 'dialog-warning' : 'muted'} role="status">
          {message.text}
        </p>
      )}

      <h3 className="dialog-subtitle">About</h3>
      <p className="muted" data-testid="audio-engine">
        Sound engine:{' '}
        {audioEngine.synthEngine === 'script-processor'
          ? 'compatibility mode (this page isn’t on https, so the browser’s AudioWorklet is unavailable)'
          : audioEngine.synthEngine === 'worklet'
            ? 'AudioWorklet'
            : 'starts when you first play a note'}
        .
      </p>
      <div className="reset-confirm">
        {confirmReset ? (
          <>
            <span>Forget every setting and saved tuning on this device?</span>
            <button
              type="button"
              className="button danger"
              onClick={() => {
                clearSettings();
                location.reload();
              }}
            >
              Yes, reset everything
            </button>
            <button type="button" className="button" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmReset(true)}>
            Reset all settings…
          </button>
        )}
      </div>

      <div className="dialog-actions">
        <button type="button" className="button primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
