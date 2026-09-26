/**
 * Settings: everything persists across a reload, themes (system / dark / light, no flash), the
 * large-neck option, reset, and reduced motion. Usage: URL=http://localhost:5199/?debug node scripts/settings-check.mjs
 */
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForSelector('.fretboard-svg');
  return { context, page, errors };
}
const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const DARK = 'rgb(22, 24, 29)';
const LIGHT = 'rgb(245, 242, 236)';

// ---------------------------------------------------------------- everything persists
{
  const { page, errors } = await open();
  const nonDefault = await page.evaluate(() => {
    const s = window.__fluidfrets.store.getState();
    s.jumpToTuning({ id: 'custom', name: 'Custom', strings: [38, 43, 50, 55, 59, 62] });
    s.setFretCount(20);
    s.setAccidentalPref('flat');
    s.setLeftHanded(true);
    s.setFretSpacing('even');
    s.setUnlimitedRange(true);
    s.setStrumOnTuningChange(false);
    s.setTheme('light');
    s.setLargeNeck(true);
    s.setSoundPreset('jazz');
    s.setGuitarModel('hollow-body');
    s.setCustomise({ wood: 'maple', inlay: 'blocks', finish: '#5a3a7a' });
    s.setMatchSound(false);
    s.setFretCountUserSet(true);
    s.setVolume(0.35);
    s.setMuted(true);
    s.setMode('chord');
    s.setScaleSettings({
      rootPc: 9,
      scaleId: 'dorian',
      hideOutOfScale: true,
      colourMode: true,
      overlay: { kind: 'triad', degree: 2 },
    });
    s.setPalette('colourblind');
    s.setPlayback({ tempo: 77, direction: 'updown', range: 'two-octaves', position: 4 });
    s.setChordSpec({
      rootPc: 2,
      quality: 'minor',
      seventh: '7',
      extension: 'none',
      alterations: [],
      added: [],
      omit3: false,
      omit5: false,
      bassPc: 9,
    });
    s.setVoicingRules({
      maxStretch: 3,
      maxFingers: 3,
      minStrings: 5,
      includeOpen: false,
      rootInBass: true,
      noInnerMutes: true,
    });
    s.setChordDisplay({ showIntervals: true, colourByFunction: false, hideOthers: true });
    s.setChordPlay({ direction: 'up', speedMs: 80 });
    s.setSavedTunings([{ id: 'my-1', name: 'Mine', strings: [38, 43, 50, 55, 59, 62] }]);
    const fresh = window.__fluidfrets.store.getState(); // state objects are immutable: re-read after the changes
    const keys = [
      'fretCount',
      'accidentalPref',
      'leftHanded',
      'fretSpacing',
      'unlimitedRange',
      'strumOnTuningChange',
      'theme',
      'largeNeck',
      'soundPreset',
      'guitarModel',
      'customise',
      'matchSound',
      'fretCountUserSet',
      'volume',
      'muted',
      'mode',
      'scaleSettings',
      'palette',
      'playback',
      'chordSpec',
      'voicingRules',
      'chordDisplay',
      'chordPlay',
    ];
    return {
      keys,
      values: Object.fromEntries(keys.map((k) => [k, fresh[k]])),
      tuning: fresh.tuning.strings,
      saved: fresh.savedTunings.length,
    };
  });
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.__fluidfrets);
  await page.waitForTimeout(300);
  const after = await page.evaluate((keys) => {
    const s = window.__fluidfrets.store.getState();
    return {
      values: Object.fromEntries(keys.map((k) => [k, s[k]])),
      tuning: s.tuning.strings,
      saved: s.savedTunings.length,
      live: s.liveTuning,
    };
  }, nonDefault.keys);
  const differing = nonDefault.keys.filter(
    (k) => JSON.stringify(after.values[k]) !== JSON.stringify(nonDefault.values[k]),
  );
  check(
    `all ${nonDefault.keys.length} settings persist across a reload`,
    differing.length === 0,
    differing
      .map(
        (k) => `${k}: ${JSON.stringify(nonDefault.values[k])} → ${JSON.stringify(after.values[k])}`,
      )
      .join('; '),
  );
  check(
    'the tuning and saved tunings persist, and the neck is drawn in that tuning',
    JSON.stringify(after.tuning) === JSON.stringify(nonDefault.tuning) &&
      JSON.stringify(after.live) === JSON.stringify(nonDefault.tuning) &&
      after.saved === 1,
  );
  check('no errors while restoring', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- themes
{
  const { context, page } = await open({ colorScheme: 'light' });
  check(
    'theme "system" follows a light operating system',
    (await bg(page)) === LIGHT,
    await bg(page),
  );
  await page.evaluate(() => window.__fluidfrets.store.getState().setTheme('dark'));
  await page.waitForTimeout(100);
  check(
    'forcing dark overrides a light system',
    (await bg(page)) === DARK &&
      (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
    await bg(page),
  );
  await page.close();
  await context.close();
}
{
  const { context, page } = await open({ colorScheme: 'dark' });
  check(
    'theme "system" follows a dark operating system',
    (await bg(page)) === DARK,
    await bg(page),
  );
  await page.evaluate(() => window.__fluidfrets.store.getState().setTheme('light'));
  await page.waitForTimeout(100);
  check(
    'forcing light overrides a dark system',
    (await bg(page)) === LIGHT &&
      (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light',
  );
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Theme').selectOption('dark');
  await page.waitForTimeout(100);
  check(
    'the Settings dialog changes the theme',
    (await bg(page)) === DARK &&
      (await page.evaluate(() => window.__fluidfrets.store.getState().theme)) === 'dark',
  );
  await page.getByLabel('Theme').selectOption('light');
  await page.keyboard.press('Escape');
  const themeMeta = await page.evaluate(
    () => document.querySelector('meta[name="theme-color"]').content,
  );
  check('the browser theme-colour follows the page', themeMeta === LIGHT, themeMeta);
  await page.close();
  await context.close();
}
{
  // The saved theme is applied by a script in <head>, before the app runs: no flash.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.addInitScript(() =>
    localStorage.setItem(
      'fluid-frets-settings',
      JSON.stringify({ state: { theme: 'light' }, version: 1 }),
    ),
  );
  await page.addInitScript(() => {
    window.__early = null;
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive' && window.__early === null)
        window.__early = document.documentElement.dataset.theme ?? 'none';
    });
  });
  await page.goto(url);
  await page.waitForSelector('.fretboard-svg');
  check(
    'a saved light theme is applied before the app loads (no flash)',
    (await page.evaluate(() => window.__early)) === 'light',
    await page.evaluate(() => window.__early),
  );
  await page.close();
  await context.close();
}

// ---------------------------------------------------------------- large neck
{
  const { context, page } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const spacing = () =>
    page.evaluate(() => {
      const t = (i) =>
        document.querySelector(`[data-peg="${i}"] .peg-body`).getBoundingClientRect();
      return {
        gap: t(4).top - t(5).top,
        width: document.querySelector('.fretboard-svg').getBoundingClientRect().width,
      };
    });
  const normal = await spacing();
  await page.evaluate(() => window.__fluidfrets.store.getState().setLargeNeck(true));
  await page.waitForTimeout(150);
  const large = await spacing();
  check(
    'phone landscape, default: the whole neck fits and strings are ~21 px apart',
    normal.width <= 844 && normal.gap < 30,
    JSON.stringify(normal),
  );
  check(
    'large neck: strings and pegs are at least 40 px apart',
    large.gap >= 40 && large.width >= 1620,
    JSON.stringify(large),
  );
  check(
    'large neck: the board scrolls sideways',
    await page.evaluate(() => {
      const el = document.querySelector('.fretboard-scroll');
      return el.scrollWidth > el.clientWidth;
    }),
  );
  const box = await page.locator('[data-peg="2"] .peg-body').boundingBox();
  check(
    'and a peg is a comfortable touch target (≥ 37 px tall, 40 px pitch)',
    box.height >= 36,
    `${box.height.toFixed(1)} px`,
  );
  await page.close();
  await context.close();
}

// ---------------------------------------------------------------- reduced motion
{
  const { context, page } = await open({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));
  const select = page.locator('label.field:has(span:text-is("Tuning")) select');
  await select.selectOption({ label: 'Drop D — D2 A2 D3 G3 B3 E4' });
  const live = await page.evaluate(() => window.__fluidfrets.store.getState().liveTuning[0]);
  check(
    'reduced motion: a tuning change lands at once instead of sliding',
    live === 38,
    String(live),
  );
  await page.locator('[data-string="2"][data-fret="5"]').click();
  await page.waitForTimeout(80);
  const animating = await page.evaluate(
    () =>
      document.querySelector('[data-string="2"][data-fret="5"] .marker-dot').getAnimations().length,
  );
  check('reduced motion: markers don’t pulse', animating === 0, String(animating));
  await page.close();
  await context.close();
}
{
  const { context, page } = await open();
  await page.evaluate(() => window.__fluidfrets.store.getState().setStrumOnTuningChange(false));
  await page
    .locator('label.field:has(span:text-is("Tuning")) select')
    .selectOption({ label: 'Drop D — D2 A2 D3 G3 B3 E4' });
  const early = await page.evaluate(() => window.__fluidfrets.store.getState().liveTuning[0]);
  check(
    'without reduced motion the same change slides (still mid-way right after)',
    early > 38,
    String(early),
  );
  await page.close();
  await context.close();
}

// ---------------------------------------------------------------- the rename (Fretscape → Fluid Frets)
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Someone who used the app before it was renamed: settings under the old key only.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem(
        'fretscape-settings',
        JSON.stringify({
          state: {
            tuning: { id: 'custom', name: 'Custom', strings: [38, 43, 50, 55, 59, 62] },
            savedTunings: [{ id: 'old-1', name: 'From before', strings: [38, 43, 50, 55, 59, 62] }],
            fretCount: 19,
            theme: 'light',
            guitarModel: 'classical',
          },
          version: 1,
        }),
      );
    }
  });
  await page.goto(url);
  await page.waitForSelector('.fretboard-svg');
  const restored = await page.evaluate(() => {
    const st = window.__fluidfrets.store.getState();
    return {
      frets: st.fretCount,
      theme: st.theme,
      model: st.guitarModel,
      tuning: st.tuning.strings,
      saved: st.savedTunings.map((t) => t.name),
    };
  });
  check(
    'settings saved before the rename are carried over (tuning, saved tunings, frets, theme, guitar)',
    restored.frets === 19 &&
      restored.theme === 'light' &&
      restored.model === 'classical' &&
      restored.tuning[0] === 38 &&
      restored.saved.join() === 'From before',
    JSON.stringify(restored),
  );
  check(
    'and the page uses the migrated theme straight away',
    (await bg(page)) === LIGHT,
    await bg(page),
  );
  await page.evaluate(() => window.__fluidfrets.store.getState().setFretCount(21));
  await page.waitForTimeout(200);
  const keys = await page.evaluate(() => ({
    fresh: !!localStorage.getItem('fluid-frets-settings'),
    old: !!localStorage.getItem('fretscape-settings'),
  }));
  check(
    'the next change saves under the new key and retires the old one',
    keys.fresh && !keys.old,
    JSON.stringify(keys),
  );
  await page.reload();
  await page.waitForFunction(() => window.__fluidfrets);
  check(
    'and it all survives another reload',
    (await page.evaluate(() => window.__fluidfrets.store.getState().fretCount)) === 21 &&
      (await page.evaluate(() => window.__fluidfrets.store.getState().savedTunings.length)) === 1,
  );
  check('no errors during the migration', errors.length === 0, errors.join(' | '));
  await context.close();
}

// The name itself, everywhere a person sees it.
{
  const { page } = await open();
  check(
    'the page title, heading and manifest say Fluid Frets',
    (await page.title()).startsWith('Fluid Frets') &&
      (await page.locator('h1').textContent()) === 'Fluid Frets' &&
      (await (await page.request.get(new URL('manifest.webmanifest', page.url()).href)).json())
        .short_name === 'Fluid Frets',
  );
  check(
    'and nothing on the page still says Fretscape',
    !/fretscape/i.test(await page.evaluate(() => document.documentElement.outerHTML)),
  );
  await page.close();
}

// ---------------------------------------------------------------- reset
{
  const { page } = await open();
  await page.evaluate(() => {
    const s = window.__fluidfrets.store.getState();
    s.setTheme('light');
    s.setFretCount(19);
    s.setGuitarModel('classical');
    s.setSavedTunings([{ id: 'x', name: 'X', strings: [40, 45, 50, 55, 59, 64] }]);
  });
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset all settings…' }).click();
  check(
    'reset asks for confirmation first',
    await page.getByRole('button', { name: 'Yes, reset everything' }).isVisible(),
  );
  await page.getByRole('button', { name: 'Cancel' }).click();
  check(
    'and can be cancelled without changing anything',
    (await page.evaluate(() => window.__fluidfrets.store.getState().fretCount)) === 19,
  );
  await page.getByRole('button', { name: 'Reset all settings…' }).click();
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole('button', { name: 'Yes, reset everything' }).click(),
  ]);
  await page.waitForFunction(() => window.__fluidfrets);
  const s = await page.evaluate(() => {
    const st = window.__fluidfrets.store.getState();
    return {
      theme: st.theme,
      frets: st.fretCount,
      model: st.guitarModel,
      saved: st.savedTunings.length,
    };
  });
  check(
    'confirming resets every setting and saved tuning to the defaults',
    s.theme === 'system' && s.frets === 22 && s.model === 'steel-acoustic' && s.saved === 0,
    JSON.stringify(s),
  );
  await page.close();
}

// ---------------------------------------------------------------- About
{
  const { page } = await open();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.keyboard.press('Escape');
  await page.locator('[data-string="1"][data-fret="0"]').click();
  await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running');
  await page.getByRole('button', { name: 'Settings' }).click();
  check(
    'and reports AudioWorklet once running',
    /AudioWorklet/.test(await page.getByTestId('audio-engine').textContent()),
    await page.getByTestId('audio-engine').textContent(),
  );
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
