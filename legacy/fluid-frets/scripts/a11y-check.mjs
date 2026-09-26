/**
 * Accessibility: runs axe-core (WCAG 2 A/AA + best practice) over every tab, both themes, and the
 * dialogs / popover, then drives the keyboard: Tab order, the fretboard cursor, pegs, panels.
 * Usage: URL=http://localhost:5199/?debug node scripts/a11y-check.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);
await page.evaluate(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));
await page.addScriptTag({ content: axeSource });

async function axe(label) {
  const r = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    }),
  );
  const bad = r.violations.map(
    (v) =>
      `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes
        .slice(0, 2)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  check(`axe: ${label}`, bad.length === 0, bad.join(' ;; '));
}

const tabs = ['Explore', 'Scales', 'Chords', 'Identify'];
for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => window.__fluidfrets.store.getState().setTheme(t), theme);
  await sleep(150);
  for (const tab of tabs) {
    await page.getByRole('tab', { name: tab }).click();
    await sleep(200);
    if (tab === 'Scales')
      await page.evaluate(() =>
        window.__fluidfrets.store
          .getState()
          .setScaleSettings({ colourMode: true, overlay: { kind: 'triad', degree: 4 } }),
      );
    if (tab === 'Identify') {
      await page.locator('[data-string="1"][data-fret="3"]').click();
      await page.locator('[data-string="2"][data-fret="2"]').click();
    }
    await sleep(150);
    await axe(`${theme} theme, ${tab} tab`);
  }
}
await page.evaluate(() => {
  const s = window.__fluidfrets.store.getState();
  s.setTheme('light');
  s.setMode('chord');
});
await sleep(150);
await page.getByRole('button', { name: 'Settings' }).click();
await sleep(200);
await axe('light theme, Settings dialog');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Save tuning' }).click();
await sleep(200);
await axe('light theme, Save tuning dialog');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Customise' }).click();
await axe('light theme, Customise popover');
await page.keyboard.press('Escape');
for (const model of ['classical', 'double-cut', 'hollow-body']) {
  await page.evaluate((m) => window.__fluidfrets.store.getState().setGuitarModel(m), model);
  await sleep(100);
}
await axe('light theme, hollow-body guitar');
await page.evaluate(() => {
  const s = window.__fluidfrets.store.getState();
  s.setTheme('dark');
  s.setMode('explore');
  s.setGuitarModel('steel-acoustic');
});

// ---------------------------------------------------------------- keyboard
const focusedInfo = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a
      ? `${a.tagName.toLowerCase()}${a.getAttribute('role') ? '[' + a.getAttribute('role') + ']' : ''}${a.getAttribute('aria-label') ? ' ' + a.getAttribute('aria-label').slice(0, 30) : ''}`
      : 'none';
  });
const status = () => page.locator('.fretboard [role="status"]').textContent();
await page.evaluate(() => {
  document.activeElement?.blur();
  window.scrollTo(0, 0);
});
// Tab through the toolbar to the fretboard.
let onBoard = false;
for (let i = 0; i < 40 && !onBoard; i++) {
  await page.keyboard.press('Tab');
  onBoard = await page.evaluate(() => document.activeElement?.classList.contains('fretboard-svg'));
}
check('the fretboard is reachable with Tab', onBoard);
check(
  'focusing it shows a cursor and announces the note',
  (await page.locator('.fret-cursor').count()) === 1 && /String 6, open: E/.test(await status()),
  await status(),
);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
check(
  '→ moves along the string (3 frets: G)',
  /String 6, fret 3: G/.test(await status()),
  await status(),
);
await page.keyboard.press('ArrowUp');
check(
  '↑ moves to the next higher string (A string, fret 3: C)',
  /String 5, fret 3: C/.test(await status()),
  await status(),
);
await page.keyboard.press('ArrowLeft');
check('← moves back', /String 5, fret 2: B/.test(await status()), await status());
await page.keyboard.press('End');
check('End jumps to the last fret', /fret 22/.test(await status()), await status());
await page.keyboard.press('Home');
check('Home jumps to the open string', /open/.test(await status()));
for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowDown');
check('the cursor stops at the lowest string', /String 6/.test(await status()));
for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowUp');
check('and at the highest', /String 1/.test(await status()));

await page.evaluate(() => {
  const engine = window.__fluidfrets.audioEngine;
  window.__plucks = [];
  const real = engine.pluck.bind(engine);
  engine.pluck = (string, midi, opts) => {
    window.__plucks.push({ string, midi });
    return real(string, midi, opts);
  };
});
await page.keyboard.press('Home');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await sleep(300);
const p = await page.evaluate(() => window.__plucks);
check(
  'Enter plays the note under the cursor (B string, fret 2 = C♯4, MIDI 61)',
  p.length === 1 && p[0].string === 4 && p[0].midi === 61,
  JSON.stringify(p),
);
await page.evaluate(() => (window.__plucks = []));
await page.keyboard.press('Shift+Enter');
await sleep(600);
check(
  'Shift + Enter strums the open strings',
  (await page.evaluate(() => window.__plucks.length)) === 6,
);

// Left-handed: arrow directions follow what is on screen.
await page.evaluate(() => window.__fluidfrets.store.getState().setLeftHanded(true));
await page.keyboard.press('Home');
await page.keyboard.press('ArrowLeft');
check(
  'left-handed: ← goes up the neck (towards the body, which is on the left)',
  /fret 1/.test(await status()),
  await status(),
);
await page.evaluate(() => window.__fluidfrets.store.getState().setLeftHanded(false));

// Chord mode: Enter edits the shape like a tap.
await page.getByRole('tab', { name: 'Chords' }).click();
await page.evaluate(() => document.querySelector('.fretboard-svg').focus());
await page.keyboard.press('Tab'); // out of the board and back for focus-visible
await page.keyboard.press('Shift+Tab');
await sleep(100);
const before = await page.getByTestId('shape-text').textContent();
await page.keyboard.press('Home');
await page.keyboard.press('Enter'); // the open string toggle: mutes/opens string 6's slot
await sleep(150);
check(
  'in chord mode Enter edits the shape like a tap',
  (await page.getByTestId('shape-text').textContent()) !== before,
  `${before} → ${await page.getByTestId('shape-text').textContent()}`,
);

// Pegs are still keyboard controls inside the board.
await page.getByRole('tab', { name: 'Explore' }).click();
const peg = page.locator('[data-peg="0"]');
await peg.focus();
const t0 = await page.evaluate(() => window.__fluidfrets.store.getState().tuning.strings[0]);
await page.keyboard.press('ArrowDown');
await sleep(300);
const t1 = await page.evaluate(() => window.__fluidfrets.store.getState().tuning.strings[0]);
check('a tuning peg still responds to ↑/↓ from the keyboard', t1 === t0 - 1, `${t0} → ${t1}`);
check(
  'and the fretboard cursor stays off while a peg has focus',
  (await page.locator('.fret-cursor').count()) === 0,
);

// Mouse click doesn't leave a keyboard cursor behind.
await page.locator('[data-string="2"][data-fret="5"]').click();
check(
  'clicking the neck with a mouse shows no keyboard cursor',
  (await page.locator('.fret-cursor').count()) === 0,
);

// Tabs.
await page.getByRole('tab', { name: 'Explore' }).focus();
await page.keyboard.press('ArrowRight');
check(
  'the tab list: → selects the next tab',
  (await page.getByRole('tab', { name: 'Scales' }).getAttribute('aria-selected')) === 'true',
);
// Visible focus.
await page.getByRole('button', { name: 'Mute' }).focus();
const outline = await page
  .getByRole('button', { name: 'Mute' })
  .evaluate((el) => getComputedStyle(el).outlineStyle);
check('focused controls show a visible focus outline', outline !== 'none', outline);

// Touch targets: every button, chip and select is at least 40 px tall.
await page.getByRole('tab', { name: 'Chords' }).click();
await sleep(150);
const small = await page.evaluate(() =>
  [...document.querySelectorAll('button, select, [role="tab"], label.check, summary')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({
      t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24),
      h: Math.round(el.getBoundingClientRect().height),
    }))
    .filter((x) => x.h < 40),
);
check(
  'all buttons, tabs and selects are at least 40 px tall',
  small.length === 0,
  small.map((s) => `${s.t}:${s.h}`).join(', '),
);

check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
