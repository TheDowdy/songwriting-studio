/** Screenshots of the running app into .shots/ (gitignored). Usage: node scripts/shot.mjs */
import { chromium } from 'playwright-core';
const url = process.env.URL ?? 'http://localhost:5199/?debug';
const browser = await chromium.launch({ channel: 'chrome' });

async function shot(name, { w, h, setup }) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await setup?.(page);
  await page.screenshot({ path: `.shots/${name}.png` });
  if (errors.length) console.log(name, 'ERRORS', errors);
  await page.close();
}

const peg = (page, i) => page.locator(`[data-peg="${i}"]`);
async function dragPeg(page, i, dySemis, { release = true } = {}) {
  const box = await peg(page, i).boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 12;
  for (let s = 1; s <= steps; s++) await page.mouse.move(x, y - (dySemis * 24 * s) / steps);
  await page.waitForTimeout(80);
  if (release) {
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  return { x, y };
}

await shot('pegs-rest', { w: 1440, h: 700 });
await shot('pegs-middrag', {
  w: 1440,
  h: 700,
  setup: async (p) => {
    await p.locator('[data-string="1"][data-fret="0"]').click();
    await dragPeg(p, 1, -2.5, { release: false });
  },
});
await shot('pegs-phone-landscape', {
  w: 844,
  h: 390,
  setup: (p) => p.locator('select').nth(1).selectOption('24'),
});
await shot('pegs-left-handed', {
  w: 1440,
  h: 700,
  setup: (p) => p.getByLabel('Left-handed').check(),
});
await shot('settings-dialog', {
  w: 900,
  h: 700,
  setup: async (p) => {
    await p.getByRole('button', { name: 'Settings' }).click();
    await p.waitForTimeout(200);
  },
});
await shot('save-dialog', {
  w: 900,
  h: 700,
  setup: async (p) => {
    await p.getByRole('button', { name: 'Save tuning' }).click();
    await p.waitForTimeout(200);
  },
});
await browser.close();
