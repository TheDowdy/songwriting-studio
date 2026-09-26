/**
 * Checks the production build (dist/) the way a host would serve it: from a sub-path (as behind a
 * reverse proxy), with the audio worklet loading, a valid manifest and icons, and offline support
 * through the service worker. Run `npm run build` first. Usage: node scripts/deploy-check.mjs
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const PREFIX = '/apps/fluid-frets/';
const PORT = 5197;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
  '.json': 'application/json',
};
// Serve with the same security headers as the Docker image (read from its config, so they can't drift).
const headerConf = readFileSync('docker/security-headers.conf', 'utf8');
const SECURITY = Object.fromEntries(
  [...headerConf.matchAll(/^add_header (\S+) "(.*)" always;$/gm)].map((m) => [
    m[1].toLowerCase(),
    m[2],
  ]),
);
const hits = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  hits.push(url.pathname);
  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404).end('not under the prefix');
    return;
  }
  let rel = normalize(url.pathname.slice(PREFIX.length)).replace(/^(\.\.[/\\])+/, '');
  if (rel === '.' || rel === '' || rel.endsWith('/'))
    rel = join(rel === '.' ? '' : rel, 'index.html');
  const file = join('dist', rel);
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      ...SECURITY,
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('missing');
  }
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const base = `http://localhost:${PORT}${PREFIX}`;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const failed404 = [];
page.on('response', (r) => r.status() >= 400 && failed404.push(`${r.status()} ${r.url()}`));

await page.addInitScript(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
  );
});
await page.goto(base + '?debug');
await page.waitForSelector('.fretboard-svg');
check(
  'the security headers under test include a strict Content-Security-Policy',
  (SECURITY['content-security-policy'] ?? '').includes("script-src 'self'") &&
    !/script-src[^;]*'unsafe-(inline|eval)'/.test(SECURITY['content-security-policy'] ?? ''),
  Object.keys(SECURITY).join(),
);
check('the app loads from a sub-path', (await page.locator('[data-string]').count()) > 100);
check(
  'no request outside the prefix and none failed',
  hits.every((h) => h.startsWith(PREFIX)) && failed404.length === 0,
  failed404.join(' | '),
);

const head = await page.evaluate(() => ({
  desc: document.querySelector('meta[name="description"]')?.content,
  manifest: document.querySelector('link[rel="manifest"]')?.href,
  lang: document.documentElement.lang,
  title: document.title,
}));
check(
  'page metadata: title, language, description',
  !!head.title && head.lang === 'en' && (head.desc ?? '').length > 50,
);

const manifest = await (await page.request.get(head.manifest)).json();
check(
  'the web manifest is valid',
  manifest.name &&
    manifest.start_url === './' &&
    manifest.display === 'standalone' &&
    manifest.icons.length >= 3,
);
const iconResponses = await Promise.all(
  manifest.icons.map((i) => page.request.get(new URL(i.src, head.manifest).href)),
);
check(
  'every manifest icon is served with the right type',
  iconResponses.every(
    (r, i) =>
      r.ok() && (r.headers()['content-type'] ?? '').includes(manifest.icons[i].type.split('/')[1]),
  ),
  iconResponses.map((r) => r.status()).join(),
);
check(
  'robots.txt is served as text, not the app',
  (await (await page.request.get(base + 'robots.txt')).text()).includes('User-agent'),
);

// Audio: the worklet must load from the sub-path.
await page.locator('[data-string="1"][data-fret="0"]').click();
await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running', null, {
  timeout: 8000,
});
check(
  'the audio worklet loads from the sub-path',
  (await page.evaluate(() => window.__fluidfrets.audioEngine.synthEngine)) === 'worklet',
);
await page.waitForTimeout(200);
check(
  'and it makes sound',
  (await page.evaluate(() => window.__fluidfrets.audioEngine.getOutputPeak())) > 0.02,
);

// Service worker and offline.
await page.waitForFunction(
  () => navigator.serviceWorker.getRegistration().then((r) => !!r?.active),
  null,
  { timeout: 8000 },
);
check('a service worker registers and activates', true);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
// Everything the app needs is now fetched through the worker, so it is cached: go offline.
await context.setOffline(true);
await page.reload();
await page.waitForSelector('.fretboard-svg', { timeout: 8000 });
check('offline: the app still loads', (await page.locator('[data-string]').count()) > 100);
await page.goto(base + '?debug');
await page.locator('[data-string="1"][data-fret="0"]').click();
await page.waitForFunction(() => window.__fluidfrets.audioEngine.getStatus() === 'running', null, {
  timeout: 8000,
});
await page.waitForTimeout(250);
check(
  'offline: sound still works (the worklet was cached)',
  (await page.evaluate(() => window.__fluidfrets.audioEngine.getOutputPeak())) > 0.02 &&
    (await page.evaluate(() => window.__fluidfrets.audioEngine.synthEngine)) === 'worklet',
);
await context.setOffline(false);

const cspErrors = errors.filter((e) => /Content Security Policy|Refused to/i.test(e));
check(
  'the Content-Security-Policy blocked nothing the app needs',
  (await page.evaluate(() => window.__csp)).length === 0 && cspErrors.length === 0,
  cspErrors.join(' | '),
);
check(
  'no console or page errors',
  errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e)).length ===
    0,
  errors.join(' | '),
);
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
