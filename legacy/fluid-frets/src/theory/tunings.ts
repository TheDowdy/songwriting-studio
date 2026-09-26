import { midiToName, parseNote, pitchClass, type AccidentalPref, type MidiNote } from './notes';

export interface Tuning {
  id: string;
  name: string;
  /** index 0 = 6th (lowest) string … index 5 = 1st string */
  strings: MidiNote[];
  builtIn: boolean;
}

export const STRING_COUNT = 6;

/** Standard tuning E2 A2 D3 G3 B3 E4. */
export const STANDARD_STRINGS: readonly MidiNote[] = [40, 45, 50, 55, 59, 64];

/** Default per-string range: 7 semitones down, 5 up (§0). */
export const RANGE_DOWN = 7;
export const RANGE_UP = 5;
/** Range with the "Unlimited range" setting on. */
export const UNLIMITED_RANGE = 24;

/** Sane bounds for any string in any tuning (C0 … C8). */
const MIN_MIDI = 12;
const MAX_MIDI = 108;

export interface PresetGroup {
  group: string;
  tunings: Tuning[];
}

function preset(id: string, name: string, notes: string): Tuning {
  return { id, name, strings: notes.split(' ').map(parseNote), builtIn: true };
}

export const PRESET_GROUPS: readonly PresetGroup[] = [
  {
    group: 'Standard & lowered',
    tunings: [
      preset('standard', 'Standard', 'E2 A2 D3 G3 B3 E4'),
      preset('half-step-down', 'Half-step down', 'E♭2 A♭2 D♭3 G♭3 B♭3 E♭4'),
      preset('d-standard', 'Whole-step down (D standard)', 'D2 G2 C3 F3 A3 D4'),
      preset('c-standard', 'C standard', 'C2 F2 B♭2 E♭3 G3 C4'),
      preset('b-standard', 'B standard', 'B1 E2 A2 D3 F♯3 B3'),
    ],
  },
  {
    group: 'Drop',
    tunings: [
      preset('drop-d', 'Drop D', 'D2 A2 D3 G3 B3 E4'),
      preset('double-drop-d', 'Double drop D', 'D2 A2 D3 G3 B3 D4'),
      preset('drop-c-sharp', 'Drop C♯', 'C♯2 G♯2 C♯3 F♯3 A♯3 D♯4'),
      preset('drop-c', 'Drop C', 'C2 G2 C3 F3 A3 D4'),
      preset('drop-b', 'Drop B', 'B1 F♯2 B2 E3 G♯3 C♯4'),
    ],
  },
  {
    group: 'Open',
    tunings: [
      preset('open-d', 'Open D', 'D2 A2 D3 F♯3 A3 D4'),
      preset('open-d-minor', 'Open D minor', 'D2 A2 D3 F3 A3 D4'),
      preset('open-g', 'Open G', 'D2 G2 D3 G3 B3 D4'),
      preset('open-g-minor', 'Open G minor', 'D2 G2 D3 G3 B♭3 D4'),
      preset('open-e', 'Open E', 'E2 B2 E3 G♯3 B3 E4'),
      preset('open-a', 'Open A', 'E2 A2 E3 A3 C♯4 E4'),
      preset('open-c', 'Open C', 'C2 G2 C3 G3 C4 E4'),
      preset('open-c6', 'Open C6', 'C2 A2 C3 G3 C4 E4'),
    ],
  },
  {
    group: 'Modal & other',
    tunings: [
      preset('dadgad', 'DADGAD', 'D2 A2 D3 G3 A3 D4'),
      preset('all-fourths', 'All fourths', 'E2 A2 D3 G3 C4 F4'),
      preset('new-standard', 'New Standard Tuning', 'C2 G2 D3 A3 E4 G4'),
      preset('nashville', 'Nashville / high-strung', 'E3 A3 D4 G4 B3 E4'),
    ],
  },
];

export const PRESET_TUNINGS: readonly Tuning[] = PRESET_GROUPS.flatMap((g) => g.tunings);

export const STANDARD_TUNING: Tuning = PRESET_TUNINGS[0] as Tuning;

export function getPreset(id: string): Tuning | undefined {
  return PRESET_TUNINGS.find((t) => t.id === id);
}

/** True if every entry is a MIDI integer in a playable range and there are exactly 6 strings. */
export function isValidStrings(strings: readonly number[]): boolean {
  return (
    strings.length === STRING_COUNT &&
    strings.every((m) => Number.isInteger(m) && m >= MIN_MIDI && m <= MAX_MIDI)
  );
}

export function validateTuning(tuning: Tuning): string[] {
  const errors: string[] = [];
  if (!tuning.id) errors.push('Tuning needs an id');
  if (!tuning.name.trim()) errors.push('Tuning needs a name');
  if (tuning.strings.length !== STRING_COUNT) {
    errors.push(`Tuning needs ${STRING_COUNT} strings, got ${tuning.strings.length}`);
  } else if (!isValidStrings(tuning.strings)) {
    errors.push('Every string must be a whole MIDI note between 12 and 108');
  }
  return errors;
}

/** Allowed MIDI range for a string (index 0 = lowest) relative to standard tuning. */
export function stringRange(stringIndex: number, unlimited = false): [min: number, max: number] {
  const std = STANDARD_STRINGS[stringIndex];
  if (std === undefined) throw new RangeError(`No string ${stringIndex}`);
  return unlimited
    ? [std - UNLIMITED_RANGE, std + UNLIMITED_RANGE]
    : [std - RANGE_DOWN, std + RANGE_UP];
}

export function clampToRange(midi: number, stringIndex: number, unlimited = false): number {
  const [min, max] = stringRange(stringIndex, unlimited);
  return Math.min(max, Math.max(min, midi));
}

export function isWithinRange(strings: readonly number[], unlimited = false): boolean {
  return strings.every((m, i) => {
    const [min, max] = stringRange(i, unlimited);
    return m >= min && m <= max;
  });
}

/** The preset whose strings match exactly, if any (used to label a peg-edited tuning). */
export function findMatchingPreset(strings: readonly number[]): Tuning | undefined {
  return PRESET_TUNINGS.find((t) => t.strings.every((m, i) => m === strings[i]));
}

/** Default name for a saved tuning, e.g. "C G D G B D" (low → high, no octaves). */
export function defaultTuningName(
  strings: readonly MidiNote[],
  pref: AccidentalPref = 'sharp',
): string {
  return strings.map((m) => midiToName(m, pref).replace(/-?\d+$/, '')).join(' ');
}

/** Pitch classes of the open strings, low → high. */
export function openPitchClasses(strings: readonly MidiNote[]) {
  return strings.map((m) => pitchClass(m));
}
