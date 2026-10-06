/**
 * The song strip's shared pieces (@sw/timeline): the Song order row names every arrangement slot
 * (a variant carries its label), the section being played is highlighted in both modules, and in
 * the guitar strip a chord block's width follows its length in beats.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/order-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';
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
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('.map-node');
const songId = await page.evaluate(() => location.hash.match(/#\/song\/([^/?]+)/)[1]);

// Verse (4 beats, 8 beats), Chorus (4 beats); arranged Verse, Chorus, Verse.
const mk = (root, quality, numeral) => ({ root, quality, seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral });
await page.evaluate(({ a, b, c }) => {
  const st = window.__songwriting.store;
  const add = (chord, beats) => {
    st.getState().addChord(chord);
    st.getState().setEventBeats(st.getState().selectedEventId, beats);
  };
  st.getState().renameSection(st.getState().song.sections[0].id, 'Verse');
  add(a, 4);
  add(b, 8);
  st.getState().addSection('Chorus');
  add(c, 4);
  const [verse, chorus] = st.getState().song.sections;
  st.getState().setArrangement([verse.id, chorus.id, verse.id]);
}, { a: mk('G', 'maj', 'I'), b: mk('C', 'maj', 'IV'), c: mk('D', 'maj', 'V') });

// ---------------------------------------------------------------- progression module
const chipNames = () => page.evaluate(() => [...document.querySelectorAll('[aria-label="Arrangement"] li')].map((li) => li.textContent.replace('×', '').trim()));
check('the arrangement row lists every slot in order', JSON.stringify(await chipNames()) === JSON.stringify(['Verse', 'Chorus', 'Verse']), JSON.stringify(await chipNames()));
check('nothing is highlighted before playback', (await page.locator('[data-playing]').count()) === 0);
await page.getByRole('button', { name: 'Play', exact: true }).click();
await sleep(1200);
check('a chip is highlighted while playing', (await page.locator('[data-playing]').count()) === 1, await page.locator('[data-playing]').allTextContents().then((t) => t.join()));
check('…as the current step', (await page.locator('[aria-current="step"]').count()) === 1);
await page.keyboard.press('Space');
await sleep(300);
check('the highlight clears when playback stops', (await page.locator('[data-playing]').count()) === 0);

// ---------------------------------------------------------------- guitar module
await page.evaluate((id) => (location.hash = `#/song/${id}/guitar`), songId);
await page.waitForSelector('.strip-chord');
const chips = () => page.evaluate(() => [...document.querySelectorAll('.sw-order-chip')].map((c) => c.textContent.trim() + (c.classList.contains('playing') ? '*' : '')));
check('the Song order row shows the arrangement', JSON.stringify(await chips()) === JSON.stringify(['Verse', 'Chorus', 'Verse']), JSON.stringify(await chips()));
check('each section is drawn once in the strip', (await page.locator('.strip-group[id^="strip-section-"]').count()) === 2);
const widths = await page.evaluate(() =>
  [...document.querySelectorAll('.strip-chord')].map((b) => [b.getAttribute('aria-label').match(/(\d+) beats?/)[1], Math.round(b.getBoundingClientRect().width)]),
);
const w = Object.fromEntries(widths);
check('a longer chord is drawn wider', w['8'] > w['4'], JSON.stringify(widths));
await page.getByRole('button', { name: 'Play', exact: true }).click();
await sleep(1500);
check('the playing section is highlighted', (await chips()).filter((c) => c.endsWith('*')).length === 1, JSON.stringify(await chips()));
check('the sounding beat of the playing chord is marked', (await page.locator('.strip-slash.now').count()) === 1, String(await page.locator('.strip-slash.now').count()));
await page.getByRole('button', { name: 'Stop', exact: true }).click();
await sleep(300);
check('…and clears on stop', (await chips()).every((c) => !c.endsWith('*')));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
