import { useState } from 'react';
import { MAX_FRETS, MIN_FRETS, useStore, type FretSpacing } from '../../state/store';
import { applyCapo } from '../../state/capoActions';
import { chooseFretCount } from '../../state/guitarActions';
import { selectTuning } from '../../state/tuningActions';
import { MAX_CAPO } from '@sw/core/fret/capo';
import { midiToName } from '@sw/core/fret/notes';
import { CUSTOM_ID } from '@sw/core/fret/savedTunings';
import { getPreset, PRESET_GROUPS } from '@sw/core/fret/tunings';
import { GuitarControls } from './GuitarControls';
import { SaveTuningDialog } from './SaveTuningDialog';
import { SettingsDialog } from './SettingsDialog';
import { SoundControls } from './SoundControls';

const fretOptions = Array.from({ length: MAX_FRETS - MIN_FRETS + 1 }, (_, i) => MIN_FRETS + i);
const capoOptions = Array.from({ length: MAX_CAPO + 1 }, (_, i) => i);

export function Toolbar() {
  const tuning = useStore((s) => s.tuning);
  const saved = useStore((s) => s.savedTunings);
  const fretCount = useStore((s) => s.fretCount);
  const capo = useStore((s) => s.capo);
  const pref = useStore((s) => s.accidentalPref);
  const leftHanded = useStore((s) => s.leftHanded);
  const fretSpacing = useStore((s) => s.fretSpacing);
  const { setAccidentalPref, setLeftHanded, setFretSpacing } = useStore.getState();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(false);

  const isPreset = getPreset(tuning.id) !== undefined;
  const isSaved = saved.some((t) => t.id === tuning.id);
  const notes = (strings: readonly number[]) => strings.map((m) => midiToName(m, pref)).join(' ');

  return (
    // A labelled <section>, not a second <header>: the shell above already provides the page's
    // one "banner" landmark (its own <header>), and two would be a duplicate-landmark a11y
    // violation — but its controls still need to be *some* landmark region, so a plain <div>
    // isn't quite right either.
    <section className="toolbar" aria-label="Guitar toolbar">
      {/* The app-level identity ("Songwriting Studio") and navigation live in the shell header
          above this one; this just names the module itself (was "Fluid Frets" pre-Phase-2). */}
      <h1 className="toolbar-title">Guitar</h1>

      <label className="field">
        <span>Tuning</span>
        <select
          value={isPreset || isSaved ? tuning.id : CUSTOM_ID}
          onChange={(e) => {
            const chosen = getPreset(e.target.value) ?? saved.find((t) => t.id === e.target.value);
            if (chosen) selectTuning(chosen);
          }}
        >
          {!isPreset && !isSaved && (
            <option value={CUSTOM_ID}>Custom — {notes(tuning.strings)}</option>
          )}
          {PRESET_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.tunings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {notes(t.strings)}
                </option>
              ))}
            </optgroup>
          ))}
          {saved.length > 0 && (
            <optgroup label="My tunings">
              {saved.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {notes(t.strings)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <button type="button" className="button" onClick={() => setSaving(true)}>
        Save tuning
      </button>

      <label className="field">
        <span>Frets</span>
        <select value={fretCount} onChange={(e) => chooseFretCount(Number(e.target.value))}>
          {fretOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Capo</span>
        <select value={capo} onChange={(e) => applyCapo(Number(e.target.value))}>
          {capoOptions.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'None' : n}
            </option>
          ))}
        </select>
      </label>

      <GuitarControls />

      <label className="field">
        <span>Spacing</span>
        <select value={fretSpacing} onChange={(e) => setFretSpacing(e.target.value as FretSpacing)}>
          <option value="auto">Auto</option>
          <option value="realistic">Realistic</option>
          <option value="even">Even</option>
        </select>
      </label>

      <label className="field">
        <span>Accidentals</span>
        <select
          value={pref}
          onChange={(e) => setAccidentalPref(e.target.value as 'sharp' | 'flat')}
        >
          <option value="sharp">♯ Sharps</option>
          <option value="flat">♭ Flats</option>
        </select>
      </label>

      <SoundControls />

      <label className="check">
        <input
          type="checkbox"
          checked={leftHanded}
          onChange={(e) => setLeftHanded(e.target.checked)}
        />
        <span>Left-handed</span>
      </label>

      <button type="button" className="button" onClick={() => setSettings(true)}>
        Settings
      </button>

      <SaveTuningDialog open={saving} onClose={() => setSaving(false)} />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} />
    </section>
  );
}
