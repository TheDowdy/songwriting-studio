import { stopChordPlayback } from '../../state/chordActions';
import { stopScale } from '../../state/scalePlayback';
import { useStore, type AppMode } from '../../state/store';
import { ChordPanel } from './ChordPanel';
import { IdentifyPanel } from './IdentifyPanel';
import { ScalePanel } from './ScalePanel';

const TABS: { mode: AppMode; label: string }[] = [
  { mode: 'scale', label: 'Scales' },
  { mode: 'chord', label: 'Voicings' },
  { mode: 'identify', label: 'Identify' },
];

/** Phones in landscape have little height, so start with the panel folded away there. */
export const startsCollapsed = () =>
  typeof matchMedia === 'function' && matchMedia('(max-height: 500px)').matches;

interface PanelState {
  collapsed: boolean;
  setCollapsed: (next: boolean | ((c: boolean) => boolean)) => void;
}

/**
 * The mode switch (§13): Scales, Chords and Identify (the Explore tab was removed — §7 Phase 3
 * change 1). It sits directly above the neck it changes, with the button that folds the panel
 * below the neck away to give the neck the whole screen.
 */
export function ModeTabs({ collapsed, setCollapsed }: PanelState) {
  const mode = useStore((s) => s.mode);

  const choose = (next: AppMode) => {
    if (next === mode) return;
    stopScale();
    stopChordPlayback();
    useStore.getState().chooseMode(next);
    setCollapsed(false);
  };

  return (
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
              const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
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
  );
}

/** The panel for the chosen mode, under the neck. */
export function BottomPanel({ collapsed }: Pick<PanelState, 'collapsed'>) {
  const mode = useStore((s) => s.mode);
  return (
    <section className="bottom-panel" aria-label="Note display">
      <div id="panel-body" role="tabpanel" aria-labelledby={`tab-${mode}`} hidden={collapsed}>
        {mode === 'scale' ? <ScalePanel /> : mode === 'chord' ? <ChordPanel /> : <IdentifyPanel />}
      </div>
    </section>
  );
}
