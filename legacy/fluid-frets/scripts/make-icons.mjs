/**
 * Renders public/icon.svg to the PNG icons the web manifest lists (192, 512, and a maskable 512 with
 * a safe-zone margin). Uses Chrome via playwright-core. Usage: node scripts/make-icons.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

async function render(file, size, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // A maskable icon must keep its content inside the central 80 %: shrink it and fill the rest.
  const inner = maskable ? Math.round(size * 0.72) : size;
  const offset = Math.round((size - inner) / 2);
  await page.setContent(
    `<style>html,body{margin:0;background:${maskable ? '#16181d' : 'transparent'}}
     svg{position:absolute;left:${offset}px;top:${offset}px;width:${inner}px;height:${inner}px}</style>${svg}`,
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: !maskable });
  console.log('wrote public/' + file);
}
await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
await browser.close();
