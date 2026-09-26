import { useState } from 'react';
import { stopChordPlayback } from '../../state/chordActions';
import { stopScale } from '../../state/scalePlayback';
import { useStore, type AppMode } from '../../state/store';
import { ChordPanel } from './ChordPanel';
import { IdentifyPanel } from './IdentifyPanel';
import { ScalePanel } from './ScalePanel';

const TABS: { mode: AppMode; label: string }[] = [
  { mode: 'explore', label: 'Explore' },
  { mode: 'scale', label: 'Scales' },
  { mode: 'chord', label: 'Chords' },
  { mode: 'identify', label: 'Identify' },
];

/** Phones in landscape have little height, so start with the panel folded away there. */
const startsCollapsed = () =>
  typeof matchMedia === 'function' && matchMedia('(max-height: 500px)').matches;

/**
 * The tabbed panel under the neck (§13): Explore (chromatic), Scales, Chords and Identify. It folds away to give the neck the whole screen.
 */
export function BottomPanel() {
  const mode = useStore((s) => s.mode);
  const [collapsed, setCollapsed] = useState(startsCollapsed);

  const choose = (next: AppMode) => {
    if (next === mode) return;
    stopScale();
    stopChordPlayback();
    useStore.getState().setMode(next);
    setCollapsed(false);
  };

  return (
    <section className="bottom-panel" aria-label="Note display">
      <div className="tabs">
        <div role="tablist" aria-label="Mode" className="tablist">
          {TABS.map((t) => (
            <button
              key={t.mode}
              type="button"
              role="tab"
              id={`tab-${t.mode}`}
              aria-selected={mode === t.mode}
              aria-controls="panel-body"
              tabIndex={mode === t.mode ? 0 : -1}
              className="tab"
              onClick={() => choose(t.mode)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                const i = TABS.findIndex((x) => x.mode === mode);
                const next =
                  TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                if (next) {
                  choose(next.mode);
                  document.getElementById(`tab-${next.mode}`)?.focus();
                }
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="button collapse"
          aria-expanded={!collapsed}
          aria-controls="panel-body"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '▲ Show panel' : '▼ Hide panel'}
        </button>
      </div>
      <div id="panel-body" role="tabpanel" aria-labelledby={`tab-${mode}`} hidden={collapsed}>
        {mode === 'scale' ? (
          <ScalePanel />
        ) : mode === 'chord' ? (
          <ChordPanel />
        ) : mode === 'identify' ? (
          <IdentifyPanel />
        ) : (
          <p className="panel-body muted">
            Every note in the current tuning. Tap a note to hear it, drag across the strings to
            strum, and turn the pegs to retune. Open the Scales tab to see a key on the neck.
          </p>
        )}
      </div>
    </section>
  );
}
