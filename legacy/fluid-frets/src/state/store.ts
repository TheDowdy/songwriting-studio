import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SoundPresetId } from '../audio/instrument';
import {
  DEFAULT_MODEL_ID,
  isGuitarModelId,
  NO_CUSTOMISE,
  sanitizeCustomise,
  type Customise,
  type GuitarModelId,
} from '../components/Fretboard/guitarSkins';
import { settingsStorage, SETTINGS_KEY } from './storage';
import { DEFAULT_CHORD, normalizeChord, sanitizeChord, type ChordSpec } from '../theory/chords';
import {
  DEFAULT_CHORD_DISPLAY,
  DEFAULT_CHORD_PLAY,
  sanitizeChordDisplay,
  sanitizeChordPlay,
  sanitizeVoicingRules,
  type ChordDisplaySettings,
  type ChordPlaySettings,
} from '../theory/chordSettings';
import { emptySelection, type IdentifyCell } from '../theory/identifySelection';
import type { AccidentalPref } from '../theory/notes';
import type { PaletteId } from '../theory/scaleColors';
import {
  DEFAULT_PALETTE,
  DEFAULT_PLAYBACK,
  DEFAULT_SCALE_SETTINGS,
  sanitizePalette,
  sanitizePlayback,
  sanitizeScaleSettings,
  type PlaybackSettings,
  type ScaleSettings,
} from '../theory/scaleSettings';
import { sanitizeSaved, sanitizeTuning } from '../theory/savedTunings';
import { STANDARD_TUNING, type Tuning } from '../theory/tunings';
import { DEFAULT_VOICING_RULES, type VoicingRules } from '../theory/voicings';

export const MIN_FRETS = 18;
export const MAX_FRETS = 24;

/** 'auto' = realistic spacing on wide screens, even spacing below 900 px (§4). */
export type FretSpacing = 'auto' | 'realistic' | 'even';

/** Colour scheme: follow the operating system, or force one. */
export type ThemeSetting = 'system' | 'dark' | 'light';

/** Which panel is open: chromatic exploring, a key/scale overlay, a chord, or identifying a shape. */
export type AppMode = 'explore' | 'scale' | 'chord' | 'identify';

export interface AppState {
  /** The committed tuning (whole semitones). */
  tuning: Tuning;
  /**
   * What is drawn: equals `tuning.strings` at rest, but holds fractional MIDI values while a peg
   * is dragged or a tuning change is animating. Not persisted.
   */
  liveTuning: number[];
  savedTunings: Tuning[];
  fretCount: number;
  accidentalPref: AccidentalPref;
  leftHanded: boolean;
  fretSpacing: FretSpacing;
  theme: ThemeSetting;
  /** Draw the neck large (scrolling sideways on small screens) so strings and pegs are ≥ 40 px apart. */
  largeNeck: boolean;
  /** Lifts the −7/+5 semitone limit per string (§0). */
  unlimitedRange: boolean;
  /** Soft strum of the new open strings after choosing a tuning from the list (§6). */
  strumOnTuningChange: boolean;
  soundPreset: SoundPresetId;
  /** Which guitar is drawn around the notes (§4a). */
  guitarModel: GuitarModelId;
  /** The user's changes to the model's wood, inlays and finish. */
  customise: Customise;
  /** Choosing a guitar also picks its natural sound (the user can still change it after). */
  matchSound: boolean;
  /** Set once the user picks a fret count themselves; a guitar's default then stops applying. */
  fretCountUserSet: boolean;
  /** 0–1 slider position (perceptual curve is applied by the audio engine). */
  volume: number;
  muted: boolean;
  /**
   * Frets per string (null = muted) that a strum sounds instead of the open strings. Set by the
   * chord voicing (Phase 7) and open-selection (Phase 8) features; null = strum the open strings.
   * Not persisted.
   */
  strumShape: (number | null)[] | null;
  mode: AppMode;
  scaleSettings: ScaleSettings;
  /** Colours used by scale colour mode. */
  palette: PaletteId;
  playback: PlaybackSettings;
  chordSpec: ChordSpec;
  voicingRules: VoicingRules;
  chordDisplay: ChordDisplaySettings;
  chordPlay: ChordPlaySettings;
  /**
   * The fingering currently shown for the chord (per string: fret, or null = muted). Follows the
   * best voicing until the user picks another or edits it. Not persisted.
   */
  chordShape: (number | null)[] | null;
  /** Index of `chordShape` in the current voicing list, or null for a hand-edited shape. */
  voicingIndex: number | null;
  /** The picks made in Identify mode, per string. Not persisted. */
  identifySel: IdentifyCell[];
  /**
   * A fingering to show when the Chords tab next opens instead of its best voicing: set when an
   * identified shape is sent to chord mode, and used once. `spec` ties it to that chord.
   */
  adoptShape: { shape: (number | null)[]; spec: ChordSpec } | null;
  /** In edit mode every tap on a lit chord tone moves that string's note (root taps included). */
  editingShape: boolean;
  /** The note a scale playback is sounding right now (not persisted). */
  playhead: { string: number; fret: number } | null;
  playing: boolean;

  /** Sets the committed tuning without touching `liveTuning` (callers animate it). */
  setTuning: (tuning: Tuning) => void;
  /** Sets both the committed and drawn tuning at once, with no animation. */
  jumpToTuning: (tuning: Tuning) => void;
  setLive: (stringIndex: number, midi: number) => void;
  setSavedTunings: (saved: Tuning[]) => void;
  setFretCount: (fretCount: number) => void;
  setAccidentalPref: (pref: AccidentalPref) => void;
  setLeftHanded: (leftHanded: boolean) => void;
  setFretSpacing: (spacing: FretSpacing) => void;
  setUnlimitedRange: (unlimited: boolean) => void;
  setTheme: (theme: ThemeSetting) => void;
  setLargeNeck: (large: boolean) => void;
  setStrumOnTuningChange: (strum: boolean) => void;
  setSoundPreset: (id: SoundPresetId) => void;
  setGuitarModel: (id: GuitarModelId) => void;
  setCustomise: (patch: Partial<Customise>) => void;
  setMatchSound: (match: boolean) => void;
  setFretCountUserSet: (set: boolean) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setStrumShape: (shape: (number | null)[] | null) => void;
  setMode: (mode: AppMode) => void;
  setScaleSettings: (patch: Partial<ScaleSettings>) => void;
  setPalette: (palette: PaletteId) => void;
  setPlayback: (patch: Partial<PlaybackSettings>) => void;
  setChordSpec: (spec: ChordSpec) => void;
  setVoicingRules: (patch: Partial<VoicingRules>) => void;
  setChordDisplay: (patch: Partial<ChordDisplaySettings>) => void;
  setChordPlay: (patch: Partial<ChordPlaySettings>) => void;
  /** Shows a fingering; also what a strum gesture sounds. */
  setChordShape: (shape: (number | null)[] | null, voicingIndex: number | null) => void;
  setEditingShape: (editing: boolean) => void;
  setIdentifySel: (selection: IdentifyCell[]) => void;
  setAdoptShape: (adopt: { shape: (number | null)[]; spec: ChordSpec } | null) => void;
  setPlayhead: (playhead: { string: number; fret: number } | null) => void;
  setPlaying: (playing: boolean) => void;
}

/** The subset written to localStorage. Transient drawing state is deliberately left out. */
type Persisted = Pick<
  AppState,
  | 'tuning'
  | 'savedTunings'
  | 'fretCount'
  | 'accidentalPref'
  | 'leftHanded'
  | 'fretSpacing'
  | 'unlimitedRange'
  | 'theme'
  | 'largeNeck'
  | 'strumOnTuningChange'
  | 'soundPreset'
  | 'guitarModel'
  | 'customise'
  | 'matchSound'
  | 'fretCountUserSet'
  | 'volume'
  | 'muted'
  | 'mode'
  | 'scaleSettings'
  | 'palette'
  | 'playback'
  | 'chordSpec'
  | 'voicingRules'
  | 'chordDisplay'
  | 'chordPlay'
>;

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      tuning: STANDARD_TUNING,
      liveTuning: [...STANDARD_TUNING.strings],
      savedTunings: [],
      fretCount: 22,
      accidentalPref: 'sharp',
      leftHanded: false,
      fretSpacing: 'auto',
      unlimitedRange: false,
      theme: 'system',
      largeNeck: false,
      strumOnTuningChange: true,
      soundPreset: 'acoustic',
      guitarModel: DEFAULT_MODEL_ID,
      customise: NO_CUSTOMISE,
      matchSound: true,
      fretCountUserSet: false,
      volume: 0.8,
      muted: false,
      strumShape: null,
      mode: 'explore',
      scaleSettings: DEFAULT_SCALE_SETTINGS,
      palette: DEFAULT_PALETTE,
      playback: DEFAULT_PLAYBACK,
      chordSpec: DEFAULT_CHORD,
      voicingRules: DEFAULT_VOICING_RULES,
      chordDisplay: DEFAULT_CHORD_DISPLAY,
      chordPlay: DEFAULT_CHORD_PLAY,
      chordShape: null,
      voicingIndex: null,
      editingShape: false,
      identifySel: emptySelection(),
      adoptShape: null,
      playhead: null,
      playing: false,

      setTuning: (tuning) => set({ tuning }),
      jumpToTuning: (tuning) => set({ tuning, liveTuning: [...tuning.strings] }),
      setLive: (stringIndex, midi) =>
        set((s) => {
          const liveTuning = s.liveTuning.slice();
          liveTuning[stringIndex] = midi;
          return { liveTuning };
        }),
      setSavedTunings: (savedTunings) => set({ savedTunings }),
      setFretCount: (fretCount) =>
        set({ fretCount: Math.min(MAX_FRETS, Math.max(MIN_FRETS, Math.round(fretCount))) }),
      setAccidentalPref: (accidentalPref) => set({ accidentalPref }),
      setLeftHanded: (leftHanded) => set({ leftHanded }),
      setFretSpacing: (fretSpacing) => set({ fretSpacing }),
      setUnlimitedRange: (unlimitedRange) => set({ unlimitedRange }),
      setTheme: (theme) => set({ theme }),
      setLargeNeck: (largeNeck) => set({ largeNeck }),
      setStrumOnTuningChange: (strumOnTuningChange) => set({ strumOnTuningChange }),
      setSoundPreset: (soundPreset) => set({ soundPreset }),
      setGuitarModel: (guitarModel) => set({ guitarModel }),
      setCustomise: (patch) => set((s) => ({ customise: { ...s.customise, ...patch } })),
      setMatchSound: (matchSound) => set({ matchSound }),
      setFretCountUserSet: (fretCountUserSet) => set({ fretCountUserSet }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setMuted: (muted) => set({ muted }),
      setStrumShape: (strumShape) => set({ strumShape }),
      setMode: (mode) => set({ mode }),
      setScaleSettings: (patch) =>
        set((s) => ({ scaleSettings: { ...s.scaleSettings, ...patch } })),
      setPalette: (palette) => set({ palette }),
      setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),
      setChordSpec: (spec) => set({ chordSpec: normalizeChord(spec), editingShape: false }),
      setVoicingRules: (patch) => set((s) => ({ voicingRules: { ...s.voicingRules, ...patch } })),
      setChordDisplay: (patch) => set((s) => ({ chordDisplay: { ...s.chordDisplay, ...patch } })),
      setChordPlay: (patch) => set((s) => ({ chordPlay: { ...s.chordPlay, ...patch } })),
      setChordShape: (chordShape, voicingIndex) =>
        set({ chordShape, voicingIndex, strumShape: chordShape }),
      setEditingShape: (editingShape) => set({ editingShape }),
      setIdentifySel: (identifySel) => set({ identifySel }),
      setAdoptShape: (adoptShape) => set({ adoptShape }),
      setPlayhead: (playhead) => set({ playhead }),
      setPlaying: (playing) => set({ playing }),
    }),
    {
      name: SETTINGS_KEY,
      storage: settingsStorage,
      version: 1,
      partialize: (s): Persisted => ({
        tuning: s.tuning,
        savedTunings: s.savedTunings,
        fretCount: s.fretCount,
        accidentalPref: s.accidentalPref,
        leftHanded: s.leftHanded,
        fretSpacing: s.fretSpacing,
        unlimitedRange: s.unlimitedRange,
        theme: s.theme,
        largeNeck: s.largeNeck,
        strumOnTuningChange: s.strumOnTuningChange,
        soundPreset: s.soundPreset,
        guitarModel: s.guitarModel,
        customise: s.customise,
        matchSound: s.matchSound,
        fretCountUserSet: s.fretCountUserSet,
        volume: s.volume,
        muted: s.muted,
        mode: s.mode,
        scaleSettings: s.scaleSettings,
        palette: s.palette,
        playback: s.playback,
        chordSpec: s.chordSpec,
        voicingRules: s.voicingRules,
        chordDisplay: s.chordDisplay,
        chordPlay: s.chordPlay,
      }),
      // Never trust storage: validate the tuning data, and rebuild the drawn tuning from it.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Persisted>;
        const tuning = sanitizeTuning(p.tuning);
        return {
          ...current,
          ...p,
          tuning,
          theme: p.theme === 'dark' || p.theme === 'light' ? p.theme : 'system',
          largeNeck: p.largeNeck === true,
          guitarModel: isGuitarModelId(p.guitarModel) ? p.guitarModel : DEFAULT_MODEL_ID,
          customise: sanitizeCustomise(p.customise),
          matchSound: p.matchSound !== false,
          fretCountUserSet: p.fretCountUserSet === true,
          mode:
            p.mode === 'scale' || p.mode === 'chord' || p.mode === 'identify' ? p.mode : 'explore',
          chordSpec: sanitizeChord(p.chordSpec),
          voicingRules: sanitizeVoicingRules(p.voicingRules),
          chordDisplay: sanitizeChordDisplay(p.chordDisplay),
          chordPlay: sanitizeChordPlay(p.chordPlay),
          scaleSettings: sanitizeScaleSettings(p.scaleSettings),
          palette: sanitizePalette(p.palette),
          playback: sanitizePlayback(p.playback),
          liveTuning: [...tuning.strings],
          savedTunings: sanitizeSaved(p.savedTunings),
          fretCount: Math.min(
            MAX_FRETS,
            Math.max(MIN_FRETS, Math.round(Number(p.fretCount) || current.fretCount)),
          ),
        };
      },
    },
  ),
);
