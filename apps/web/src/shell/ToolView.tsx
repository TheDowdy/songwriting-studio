import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { AudioBanner } from './AudioBanner';
import { Header } from './Header';
import { moduleById, TOOL_MODULES, type ModuleProps } from './modules';

interface Props {
  params: { moduleId: string };
}

/** `#/tools/:moduleId` (PLAN.md §4): a module opened stand-alone, with no song (`songId: null`).
 *  Only modules with `scope: 'song-or-tool'` can be reached this way (currently just the guitar
 *  fretboard explorer, exactly as Fluid Frets worked on its own before Phase 2). */
export default function ToolView({ params }: Props) {
  const [, navigate] = useLocation();
  const activeModule = moduleById(params.moduleId);

  useEffect(() => activeModule?.onDeactivate, [activeModule]);

  if (!activeModule || activeModule.scope !== 'song-or-tool') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-lg font-medium">Nothing here.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-4 h-10 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
        >
          Back to library
        </button>
      </div>
    );
  }

  const moduleNavigate: ModuleProps['navigate'] = ({ module, songId }) => {
    if (songId) navigate(`/song/${songId}/${module}`);
    else navigate(`/tools/${module}`);
  };

  return (
    <div className="mod-shell flex min-h-dvh flex-col">
      <Header
        modules={TOOL_MODULES}
        activeModuleId={activeModule.id}
        hrefFor={(id) => `/tools/${id}`}
        backHref="/"
      />
      {/* The guitar module shows its own richer banner (it also reports engine failures); the
          shell's generic one only needs to cover every other module. */}
      {activeModule.id !== 'guitar' && <AudioBanner />}
      <div className="min-h-0 flex-1">
        <activeModule.Component
          key={activeModule.id}
          songId={null}
          focus={{}}
          navigate={moduleNavigate}
        />
      </div>
    </div>
  );
}
