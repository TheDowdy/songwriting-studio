/**
 * In-app help: the hover tooltip, help mode (shade, tap-to-describe, nothing activated), the
 * Settings → user guide route — and *coverage*: every button, control and tab reachable in the
 * library, both modules and their dialogs resolves to a help description, so a control added
 * later without help text fails here rather than shipping undocumented.
 *
 * Usage: URL=http://localhost:5173/?debug node scripts/help-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => page.waitForTimeout(ms);

/** Every visible interactive element that resolves to no help text. */
const uncovered = () =>
  page.evaluate(() => {
    const SEL = 'button, a[href], select, input:not([type=hidden]):not([type=file]), textarea, summary, [role=tab], [role=radio], [role=switch], [role=button]';
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (r.width > 0 || el.tagName === 'INPUT') && cs.visibility !== 'hidden' && !el.closest('[hidden]') && !el.closest('[data-help-ui]');
    };
    const name = (el) =>
      (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.outerHTML).replace(/\s+/g, ' ').trim().slice(0, 140);
    return [...document.querySelectorAll(SEL)]
      .filter(visible)
      .filter((el) => !window.__shell.helpFor(el))
      .map((el) => `<${el.tagName.toLowerCase()}> ${name(el)}`);
  });
const audit = async (label) => {
  const missing = [...new Set(await uncovered())];
  check(`every control has help: ${label}`, missing.length === 0, missing.join(' | '));
};

// ---------------------------------------------------------------- library
await page.goto(url);
await page.getByRole('button', { name: 'New song' }).waitFor();
await audit('library');

// hover tooltip
await page.getByRole('button', { name: 'Help' }).hover();
await sleep(150);
check('no tooltip before the pause', (await page.locator('.help-tip').count()) === 0);
await sleep(600);
check('a hover tooltip appears after a pause', (await page.locator('[role=tooltip]').count()) === 1);
check('…and describes the control', ((await page.locator('[role=tooltip]').textContent()) ?? '').includes('help mode'));
await page.mouse.move(5, 500);
await sleep(200);
check('…and goes away when the pointer leaves', (await page.locator('[role=tooltip]').count()) === 0);

// help mode: nothing is activated, taps describe
const songsBefore = await page.locator('main ul li').count();
await page.getByRole('button', { name: 'Help' }).click();
check('help mode shades the screen', (await page.locator('.help-overlay-shaded').count()) === 1);
check('…and prompts', ((await page.locator('.help-card').textContent()) ?? '').includes('Select any button'));
await page.getByRole('button', { name: 'New song', exact: true }).click({ force: true });
await sleep(150);
check('selecting "New song" in help mode does not create a song', (await page.locator('main ul li').count()) === songsBefore && !page.url().includes('/song/'));
check('…and describes it instead', ((await page.locator('.help-card').textContent()) ?? '').includes('Start a new, empty song'));
check('…and spotlights it', (await page.locator('.help-spot').count()) === 1);
await page.keyboard.press('Escape');
check('Escape leaves help mode', (await page.locator('.help-overlay').count()) === 0);
await page.getByRole('button', { name: 'Help' }).click();
await page.getByRole('button', { name: 'Done' }).click();
check('Done leaves help mode', (await page.locator('.help-overlay').count()) === 0);

// touch-style tap on the overlay (coordinates, no element target)
await page.getByRole('button', { name: 'Help' }).click();
const box = await page.getByRole('button', { name: 'Import JSON…' }).boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
check('a tap describes what is under it', ((await page.locator('.help-card').textContent()) ?? '').includes('exported earlier'));
await page.getByRole('button', { name: 'Done' }).click();

// settings → user guide
await page.getByRole('button', { name: 'Preferences' }).click();
await audit('shell settings dialog');
await page.getByRole('button', { name: 'Open the user guide' }).click();
await page.getByRole('heading', { name: 'User guide' }).waitFor();
check('the user guide opens from Settings', true);
check('…with a section for every part of the app', (await page.locator('#guide-progression, #guide-guitar, #guide-help').count()) === 3);
await audit('user guide');
await page.getByRole('button', { name: 'Close' }).click();

// ---------------------------------------------------------------- progression
await page.getByRole('button', { name: 'New song' }).click();
await page.waitForSelector('[aria-label="Chord map"]');
await page.evaluate(() => {
  const chords = [
    { root: 'C', quality: 'maj', seventh: 'maj7', flavor: 'triad', origin: 'diatonic', numeral: 'I' },
    { root: 'G', quality: 'maj', seventh: 'dom7', flavor: 'triad', origin: 'diatonic', numeral: 'V' },
  ];
  for (const c of chords) window.__songwriting.store.getState().addChord(c);
});
await sleep(300);
await audit('progression module');
await page.getByRole('button', { name: 'More playback settings' }).click();
await audit('progression: playback settings');
await page.getByRole('button', { name: 'More playback settings' }).click();
await page.getByRole('button', { name: 'Save, load and export' }).click();
await audit('progression: save panel');
await page.getByRole('button', { name: 'Save, load and export' }).click();
await page.getByRole('button', { name: /^Chord: C,/ }).first().click();
await page.getByRole('button', { name: 'Flavor', exact: true }).click();
await audit('progression: flavor picker');
await page.getByRole('button', { name: 'More…' }).click();
await audit('progression: flavor picker, more');
await page.getByRole('button', { name: 'Close flavor picker' }).click();
await page.getByRole('button', { name: 'Piano / guitar' }).click();
await audit('progression: chord detail');
await page.getByRole('button', { name: 'Close chord detail' }).click();
// The circle of fifths, with a chord picked (so its card and "Use as key" show), and a section key.
await page.getByRole('button', { name: 'Circle of fifths' }).click();
await page.locator('[aria-label="Circle of fifths"] .map-node').nth(8).click();
await audit('progression: circle of fifths');
await page.getByRole('button', { name: 'Suggestions' }).click();
await page.getByRole('button', { name: '+ Chorus' }).click();
await page.getByRole('group', { name: 'Key applies to' }).getByRole('button', { name: /^Only/ }).click();
await page.locator('[aria-label="Key"] [aria-pressed]').filter({ hasText: /^G$/ }).first().click();
await sleep(200);
await audit('progression: a section with its own key');
// The strum pattern lane: a default block selected, then a block with its editor open.
await page.getByRole('button', { name: /^Pattern for / }).first().click();
await sleep(200);
await audit('progression: song default block');
await page.getByLabel('Block pattern').selectOption('new:Folk (D, DU, UDU)');
await page.getByRole('button', { name: /^Step 2 of 8/ }).click();
await sleep(200);
await audit('progression: pattern block and editor');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /^Make variant/ }).first().click().catch(() => {});
await sleep(200);
await audit('progression: variant dialog');
await page.keyboard.press('Escape');

// ---------------------------------------------------------------- guitar in a song
await page.getByRole('tab', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await audit('guitar module (chords tab)');
await page.locator('.strip-chord').first().click();
await page.getByRole('button', { name: 'Use this voicing', exact: true }).click();
await page.locator('.strip-chord').first().click();
await audit('guitar: a chord with a committed voicing selected');
for (const b of ['Flavour', 'Inversion', 'Replace', '+ Add after']) {
  await page.getByRole('button', { name: b, exact: true }).click();
  await audit(`guitar: ${b} panel`);
  await page.getByRole('button', { name: b, exact: true }).click();
}
await page.getByRole('button', { name: 'Replace', exact: true }).click();
await page.getByRole('button', { name: 'Build any chord…' }).click();
await audit('guitar: build any chord');
await page.getByRole('button', { name: 'Replace', exact: true }).click();
await page.getByRole('button', { name: /^Make a variant of/ }).first().click();
await audit('guitar: variant dialog');
await page.getByRole('button', { name: 'Close', exact: true }).click();
await page.getByText('Voicing rules & filters').click();
await audit('guitar: voicing rules');
await page.getByRole('button', { name: 'Customise' }).click();
await audit('guitar: customise popover');
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.getByRole('tab', { name: 'Scales' }).click();
await audit('guitar: scales tab');
await page.getByRole('tab', { name: 'Identify' }).click();
await audit('guitar: identify tab');
await page.getByRole('tab', { name: 'Chords' }).click();
await page.getByRole('button', { name: 'Settings', exact: true }).click();
await audit('guitar: settings dialog');
await page.getByRole('button', { name: 'Done', exact: true }).last().click();
await page.getByRole('button', { name: 'Save tuning' }).click();
await audit('guitar: save tuning dialog');
await page.keyboard.press('Escape');
// tuning change → confirm dialog → re-voice panel
await page.locator('.toolbar .field', { hasText: 'Tuning' }).locator('select').selectOption('dadgad');
await audit('guitar: confirm tuning change');
await page.getByRole('button', { name: 'Change tuning' }).click();
await sleep(300);
await audit('guitar: re-voice panel');

// ---------------------------------------------------------------- tool mode
await page.goto(url.replace('?debug', '') + '#/');
await page.getByRole('button', { name: 'Guitar' }).click();
await page.waitForSelector('.fretboard-svg');
await audit('guitar as a stand-alone tool');

check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? `\nAll ${results.length} checks passed` : `\n${failed} of ${results.length} checks FAILED`);
process.exit(failed === 0 ? 0 : 1);
