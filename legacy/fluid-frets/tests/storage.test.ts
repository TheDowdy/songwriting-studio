import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSettings,
  LEGACY_SETTINGS_KEY,
  migratingStorage,
  SETTINGS_KEY,
} from '../src/state/storage';

/** A minimal in-memory localStorage. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

describe('settings storage after the rename (Fretscape → Fluid Frets)', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('uses the new key', () => {
    expect(SETTINGS_KEY).toBe('fluid-frets-settings');
    expect(LEGACY_SETTINGS_KEY).toBe('fretscape-settings');
  });

  it('reads settings saved under the old name when there are none under the new one', () => {
    localStorage.setItem(LEGACY_SETTINGS_KEY, '{"state":{"theme":"light"},"version":1}');
    expect(migratingStorage.getItem(SETTINGS_KEY)).toBe('{"state":{"theme":"light"},"version":1}');
  });

  it('prefers the new key once it exists', () => {
    localStorage.setItem(LEGACY_SETTINGS_KEY, 'old');
    localStorage.setItem(SETTINGS_KEY, 'new');
    expect(migratingStorage.getItem(SETTINGS_KEY)).toBe('new');
  });

  it('writing saves under the new key and retires the old one', () => {
    localStorage.setItem(LEGACY_SETTINGS_KEY, 'old');
    migratingStorage.setItem(SETTINGS_KEY, 'fresh');
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('fresh');
    expect(localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });

  it('is empty when nothing was ever saved', () => {
    expect(migratingStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('clearing forgets both keys', () => {
    localStorage.setItem(LEGACY_SETTINGS_KEY, 'old');
    localStorage.setItem(SETTINGS_KEY, 'new');
    clearSettings();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });
});
