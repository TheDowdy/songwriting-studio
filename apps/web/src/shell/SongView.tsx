import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useSong } from '@sw/song-store/react';
import { AudioBanner } from './AudioBanner';
import { SongOrderRow } from '@sw/timeline';
import { Header } from './Header';
import { getLastModule, setLastModule } from './lastModule';
import { Transport } from './Transport';
import { DEFAULT_SONG_MODULE_ID, moduleById, SONG_MODULES, type ModuleProps } from './modules';

interface Props {
  params: { songId: string; moduleId?: string };
}

/** `#/song/:songId/:moduleId?` (PLAN.md §4): the shell header plus the active module, all sharing
 *  the one song-store song — there is no per-module copy of the song. */
export default function SongView({ params }: Props) {
  const { songId } = params;
  const [, navigate] = useLocation();
  const search = useSearch();
  const song = useSong((s) => s.library[songId]);
  const currentSongId = useSong((s) => s.currentSongId);
  const loadSong = useSong((s) => s.loadSong);
  const setTitle = useSong((s) => s.setTitle);

  const moduleId = params.moduleId ?? getLastModule(songId) ?? DEFAULT_SONG_MODULE_ID;
  const activeModule = moduleById(moduleId) ?? SONG_MODULES[0]!;

  // Make this song the store's current one, so every module (which reads the store's current
  // song, not a copy) shows it. Nothing renders below until that's actually true, so a
  // navigation between two songs never flashes the previous one.
  //
  // A module switching songs itself (the progression's Songs panel opening, importing or
  // starting one) must move the URL to match *before* or in the same tick as switching the
  // store's current song (see each module's own `navigate({ songId })` calls) — otherwise this
  // effect would see the URL still pointing at the old song and immediately load that back,
  // undoing the switch.
  useEffect(() => {
    if (song && currentSongId !== songId) loadSong(songId);
  }, [song, songId, currentSongId, loadSong]);

  useEffect(() => {
    if (song) setLastModule(songId, activeModule.id);
  }, [song, songId, activeModule.id]);

  // Stop whatever the previous module was doing (audio, gestures) when the module (or song, or
  // this view) changes or unmounts (PLAN.md §5).
  useEffect(() => activeModule.onDeactivate, [activeModule]);

  if (!song) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-lg font-medium">Song not found.</p>
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
  if (currentSongId !== songId) return null; // switching; the effect above resolves this

  const query = new URLSearchParams(search);
  const focus: ModuleProps['focus'] = {
    eventId: query.get('event') ?? undefined,
    sectionId: query.get('section') ?? undefined,
  };

  const moduleNavigate: ModuleProps['navigate'] = ({ module, songId: toSongId, eventId }) => {
    const target = toSongId ?? songId;
    navigate(`/song/${target}/${module}${eventId ? `?event=${encodeURIComponent(eventId)}` : ''}`);
  };

  return (
    <div className="mod-shell flex min-h-dvh flex-col">
      <Header
        title={song.title}
        onRenameTitle={setTitle}
        modules={SONG_MODULES}
        activeModuleId={activeModule.id}
        hrefFor={(id) => `/song/${songId}/${id}`}
        backHref="/"
      />
      {/* The guitar module shows its own richer banner (it also reports engine failures); the
          shell's generic one only needs to cover every other module. */}
      {activeModule.id !== 'guitar' && <AudioBanner />}
      <main className="min-h-0 flex-1 pb-44 lg:pb-0">
      {activeModule.playback && <Transport playback={activeModule.playback} Extras={activeModule.TransportExtras} />}
      {!activeModule.hasOwnSongOrder && (
        <div className="px-4 py-1">
          <SongOrderRow
            song={song}
            onSelect={(id) =>
              document.getElementById(`strip-section-${id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
            }
          />
        </div>
      )}
        <activeModule.Component
          key={`${songId}:${activeModule.id}`}
          songId={songId}
          focus={focus}
          navigate={moduleNavigate}
        />
      </main>
    </div>
  );
}
