/**
 * Songs save and load (the bug fixed before Phase 4): inside a song, the progression's File panel
 * could open a saved song or import a JSON file, but the shell snapped the store straight back to
 * the song in the URL, so the other song's chords never appeared. Checks every way of switching
 * songs, plus a Phase-0-era (v1, no `schemaVersion`) JSON export imported from both the File
 * panel and the Library, and that the result survives a reload.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/song-files-check.mjs
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';

// A v1 song exactly as the original Progression Builder exported it: no schemaVersion, no guitar.
const chord = (root, quality, numeral) => ({ root, quality, seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral });
const v1Song = {
  id: 'v1-export-id',
  title: 'Old export',
  key: { tonic: 'C', mode: 'major' },
  timeSig: { beats: 4, unit: 4 },
  bpm: 100,
  instrument: 'piano',
  pattern: 'block',
  sections: [
    {
      id: 'v1-section',
      name: 'Verse',
      repeat: 1,
      events: [
        { id: 'e1', chord: chord('C', 'maj', 'I'), beats: 4 },
        { id: 'e2', chord: chord('A', 'min', 'vi'), beats: 4 },
        { id: 'e3', chord: chord('F', 'maj', 'IV'), beats: 4 },
        { id: 'e4', chord: chord('G', 'maj', 'V'), beats: 4 },
        { id: 'e5', chord: chord('E', 'min', 'iii'), beats: 4 },
      ],
    },
  ],
  arrangement: ['v1-section'],
  updatedAt: 1758000000000,
};
const fixture = join(tmpdir(), 'songwriting-v1-export.json');
writeFileSync(fixture, JSON.stringify(v1Song, null, 2));

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const chordCount = () => page.locator('.sw-strip li button[aria-label^="Chord:"]').count();
const urlSongId = () => page.evaluate(() => location.hash.split('/')[2]);
const title = () => page.evaluate(() => window.__songwriting.store.getState().song.title);
const openFilePanel = async () => {
  const toggle = page.getByRole('button', { name: 'Save, load and export' });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
};
/** Waits for the progression module to settle on a song with `n` chords (or times out). */
const settle = (n) =>
  page
    .waitForFunction((n) => document.querySelectorAll('.sw-strip li button[aria-label^="Chord:"]').length === n, n, { timeout: 4000 })
    .catch(() => {});

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();

// Song A: three chords.
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
// The title lives in the shell's header: select it to rename.
await page.getByTitle('Rename song').click();
await page.getByLabel('Song title').fill('Song A');
await page.keyboard.press('Enter');
for (let i = 0; i < 3; i++) {
  await page.locator('.map-node').nth(1 + i).click();
  await page.getByRole('button', { name: '+ Add' }).click();
}
const songAId = await urlSongId();
check('song A has 3 chords', (await chordCount()) === 3);
await page.waitForTimeout(1000); // autosave

// File panel → New song: a different, empty song, and the URL follows it.
await openFilePanel();
await page.getByRole('button', { name: 'New song' }).click();
await settle(0);
const songBId = await urlSongId();
check('File › New song opens a new, empty song', songBId !== songAId && (await chordCount()) === 0, `url ${songBId}`);

// File panel → Open song A: its chords load and stay loaded.
await openFilePanel();
await page.locator('li', { hasText: 'Song A' }).getByRole('button', { name: 'Open' }).click();
await settle(3);
await page.waitForTimeout(500); // long enough for any snap-back to the previous song
check('File › Open loads the saved song\'s chords', (await chordCount()) === 3, `${await chordCount()} chords`);
check('…and its title', (await title()) === 'Song A', await title());
check('…and the URL follows it', (await urlSongId()) === songAId);

// File panel → Import JSON (a v1 export from before the merge).
await openFilePanel();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import JSON' }).click()]);
await chooser.setFiles(fixture);
await settle(5);
await page.waitForTimeout(500);
const importedId = await urlSongId();
check('File › Import JSON loads an old export\'s chords', (await chordCount()) === 5, `${await chordCount()} chords`);
check('…and its title', (await title()) === 'Old export', await title());
check('…as a new song (fresh id, URL follows)', importedId !== songAId && importedId !== 'v1-export-id');

// Reload: the imported song is saved and still open.
await page.waitForTimeout(1000); // autosave
await page.reload();
await settle(5);
check('the imported song survives a reload', (await chordCount()) === 5 && (await title()) === 'Old export');

// Library → Open song A.
await page.evaluate(() => (location.hash = '#/'));
await page.getByRole('button', { name: /Song A/ }).click();
await settle(3);
await page.waitForTimeout(500);
check('Library › open a song loads its chords', (await chordCount()) === 3 && (await title()) === 'Song A');

// Library → Import JSON, twice: each import is its own song, never overwriting another.
for (let i = 1; i <= 2; i++) {
  await page.evaluate(() => (location.hash = '#/'));
  await page.getByLabel('Import a song file').setInputFiles(fixture);
  await page.waitForFunction(() => location.hash.startsWith('#/song/'));
  await settle(5);
  check(`Library › Import JSON (#${i}) loads an old export's chords`, (await chordCount()) === 5 && (await title()) === 'Old export');
}
await page.evaluate(() => (location.hash = '#/'));
const oldExports = await page.getByRole('button', { name: /Old export/ }).count();
check('each import is kept as its own song', oldExports === 3, `${oldExports} "Old export" songs in the library`);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
