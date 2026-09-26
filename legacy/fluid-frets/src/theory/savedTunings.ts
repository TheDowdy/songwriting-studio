import { isValidStrings, PRESET_TUNINGS, STANDARD_TUNING, type Tuning } from './tunings';
import { midiToName, type AccidentalPref } from './notes';

export const CUSTOM_ID = 'custom';
export const MAX_NAME_LENGTH = 60;
const MAX_IMPORT = 200;
/** Files exported before the rename say 'fretscape-tunings'; import ignores the tag, so they still load. */
const EXPORT_FORMAT = 'fluid-frets-tunings';

export function customTuning(strings: readonly number[]): Tuning {
  return { id: CUSTOM_ID, name: 'Custom', strings: [...strings], builtIn: false };
}

/**
 * What a hand-edited set of strings should be called: the built-in preset it equals, else a saved
 * tuning it equals, else "Custom".
 */
export function resolveTuning(strings: readonly number[], saved: readonly Tuning[]): Tuning {
  const same = (t: Tuning) => t.strings.every((m, i) => m === strings[i]);
  return PRESET_TUNINGS.find(same) ?? saved.find(same) ?? customTuning(strings);
}

export function newTuningId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `user-${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`;
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

function sameName(a: string, b: string): boolean {
  return cleanName(a).toLowerCase() === cleanName(b).toLowerCase();
}

export function findSavedByName(saved: readonly Tuning[], name: string): Tuning | undefined {
  return saved.find((t) => sameName(t.name, name));
}

/** Default save name: the note names low → high, e.g. "C G D G B D" (§6). */
export function suggestName(strings: readonly number[], pref: AccidentalPref): string {
  return strings.map((m) => midiToName(m, pref).replace(/-?\d+$/, '')).join(' ');
}

export interface SaveResult {
  saved: Tuning[];
  tuning: Tuning;
  overwritten: boolean;
}

/** Saves under `name`; a case-insensitive match replaces that tuning's strings (keeping its id). */
export function saveTuning(
  saved: readonly Tuning[],
  name: string,
  strings: readonly number[],
): SaveResult {
  const clean = cleanName(name);
  const existing = findSavedByName(saved, clean);
  if (existing) {
    const tuning: Tuning = { ...existing, name: clean, strings: [...strings] };
    return {
      saved: saved.map((t) => (t.id === existing.id ? tuning : t)),
      tuning,
      overwritten: true,
    };
  }
  const tuning: Tuning = { id: newTuningId(), name: clean, strings: [...strings], builtIn: false };
  return { saved: [...saved, tuning], tuning, overwritten: false };
}

export function deleteTuning(saved: readonly Tuning[], id: string): Tuning[] {
  return saved.filter((t) => t.id !== id);
}

/** Renames; returns an error message instead if the new name is empty or taken by another tuning. */
export function renameTuning(
  saved: readonly Tuning[],
  id: string,
  name: string,
): { saved: Tuning[]; error?: string } {
  const clean = cleanName(name);
  if (!clean) return { saved: [...saved], error: 'A tuning needs a name.' };
  const clash = findSavedByName(saved, clean);
  if (clash && clash.id !== id) {
    return { saved: [...saved], error: `A tuning named "${clean}" already exists.` };
  }
  return { saved: saved.map((t) => (t.id === id ? { ...t, name: clean } : t)) };
}

export function exportTunings(saved: readonly Tuning[]): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      tunings: saved.map((t) => ({ name: t.name, strings: t.strings })),
    },
    null,
    2,
  );
}

export interface ImportResult {
  saved: Tuning[];
  added: number;
  /** Identical to a tuning already saved. */
  skipped: number;
  errors: string[];
}

/**
 * Merges tunings from an exported file. Bad entries are reported and skipped, never fatal.
 * Same name + same strings → skipped; same name + different strings → renamed "Name (2)".
 */
export function importTunings(existing: readonly Tuning[], text: string): ImportResult {
  const result: ImportResult = { saved: [...existing], added: 0, skipped: 0, errors: [] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    result.errors.push('That file is not valid JSON.');
    return result;
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { tunings?: unknown }).tunings)
      ? (data as { tunings: unknown[] }).tunings
      : null;
  if (!list) {
    result.errors.push('No tunings found in that file.');
    return result;
  }

  list.slice(0, MAX_IMPORT).forEach((item, i) => {
    const entry = item as { name?: unknown; strings?: unknown } | null;
    const name = typeof entry?.name === 'string' ? cleanName(entry.name) : '';
    const strings = entry?.strings;
    if (!name) return void result.errors.push(`Entry ${i + 1}: missing name.`);
    if (!Array.isArray(strings) || !isValidStrings(strings as number[])) {
      return void result.errors.push(`Entry ${i + 1} ("${name}"): needs 6 whole MIDI notes.`);
    }
    const notes = strings as number[];
    const clash = findSavedByName(result.saved, name);
    if (clash && clash.strings.every((m, k) => m === notes[k])) {
      result.skipped++;
      return;
    }
    let finalName = name;
    for (let n = 2; findSavedByName(result.saved, finalName); n++) {
      finalName = cleanName(`${name.slice(0, MAX_NAME_LENGTH - 6)} (${n})`);
    }
    result.saved.push({ id: newTuningId(), name: finalName, strings: [...notes], builtIn: false });
    result.added++;
  });
  if (list.length > MAX_IMPORT)
    result.errors.push(`Only the first ${MAX_IMPORT} tunings were read.`);
  return result;
}

/** Validates tunings read back from localStorage; anything malformed is dropped. */
export function sanitizeSaved(value: unknown): Tuning[] {
  if (!Array.isArray(value)) return [];
  const out: Tuning[] = [];
  for (const item of value) {
    const t = item as Partial<Tuning> | null;
    if (
      t &&
      typeof t.id === 'string' &&
      typeof t.name === 'string' &&
      cleanName(t.name) &&
      Array.isArray(t.strings) &&
      isValidStrings(t.strings)
    ) {
      out.push({ id: t.id, name: cleanName(t.name), strings: [...t.strings], builtIn: false });
    }
  }
  return out;
}

/** A persisted current tuning, or standard if it is missing/corrupt. */
export function sanitizeTuning(value: unknown): Tuning {
  const t = value as Partial<Tuning> | null;
  if (t && typeof t.id === 'string' && Array.isArray(t.strings) && isValidStrings(t.strings)) {
    return {
      id: t.id,
      name: typeof t.name === 'string' && t.name ? t.name : 'Custom',
      strings: [...t.strings],
      builtIn: t.builtIn === true,
    };
  }
  return STANDARD_TUNING;
}
