import { useEffect, useId, useRef, useState } from 'react';
import {
  FINISHES,
  getGuitarModel,
  GUITAR_MODELS,
  INLAY_STYLES,
  NO_CUSTOMISE,
  WOODS,
  type GuitarModelId,
  type InlayStyle,
  type WoodId,
} from '../Fretboard/guitarSkins';
import { selectGuitarModel } from '../../state/guitarActions';
import { useStore } from '../../state/store';

/** Guitar model selector and the "Customise" popover (wood, inlays, finish, match sound). */
export function GuitarControls() {
  const modelId = useStore((s) => s.guitarModel);
  const custom = useStore((s) => s.customise);
  const matchSound = useStore((s) => s.matchSound);
  const { setCustomise, setMatchSound } = useStore.getState();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const model = getGuitarModel(modelId);

  // Close on Escape or a press outside, like a popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onPress = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open]);

  const wood = custom.wood ?? model.wood;
  const inlay = custom.inlay ?? model.inlay;
  const finish = (custom.finish ?? model.finish).toLowerCase();

  return (
    <div className="guitar-controls" ref={root}>
      <label className="field">
        <span>Guitar</span>
        <select
          value={modelId}
          onChange={(e) => selectGuitarModel(e.target.value as GuitarModelId)}
        >
          {GUITAR_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Customise
      </button>

      {open && (
        <div id={panelId} className="popover" role="dialog" aria-label="Customise guitar">
          <fieldset className="chip-group">
            <legend>Fretboard</legend>
            {(Object.keys(WOODS) as WoodId[]).map((id) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={wood === id}
                onClick={() => setCustomise({ wood: id })}
              >
                {WOODS[id].name}
              </button>
            ))}
          </fieldset>
          <fieldset className="chip-group">
            <legend>Inlays</legend>
            {INLAY_STYLES.map((i) => (
              <button
                key={i.id}
                type="button"
                className="chip"
                aria-pressed={inlay === i.id}
                onClick={() => setCustomise({ inlay: i.id as InlayStyle })}
              >
                {i.name}
              </button>
            ))}
          </fieldset>
          <fieldset className="chip-group">
            <legend>Finish</legend>
            {FINISHES.map((f) => (
              <button
                key={f.hex}
                type="button"
                className="swatch-button"
                style={{ background: f.hex }}
                aria-label={f.name}
                title={f.name}
                aria-pressed={finish === f.hex}
                onClick={() => setCustomise({ finish: f.hex })}
              />
            ))}
          </fieldset>
          <label className="check">
            <input
              type="checkbox"
              checked={matchSound}
              onChange={(e) => setMatchSound(e.target.checked)}
            />
            <span>Match sound to guitar</span>
          </label>
          <div className="popover-actions">
            <button
              type="button"
              className="button"
              onClick={() => setCustomise(NO_CUSTOMISE)}
              disabled={custom.wood === null && custom.inlay === null && custom.finish === null}
            >
              Reset to {model.name}
            </button>
            <button type="button" className="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
