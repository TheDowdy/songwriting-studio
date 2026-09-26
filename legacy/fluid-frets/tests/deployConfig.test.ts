import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const csp = (text: string) =>
  /Content-Security-Policy["']?[,:=\s]+"?([^"\n]+)"/.exec(text)?.[1] ?? '';

describe('deployment files', () => {
  const nginx = read('docker/nginx.conf');
  const headers = read('docker/security-headers.conf');

  it('the three hosts send the same Content-Security-Policy', () => {
    const fromHeaders = /add_header Content-Security-Policy "([^"]+)"/.exec(headers)?.[1];
    expect(fromHeaders).toBeTruthy();
    expect(read('netlify.toml')).toContain(fromHeaders as string);
    expect(read('vercel.json')).toContain(fromHeaders as string);
    expect(csp(read('netlify.toml'))).toBe(fromHeaders);
  });

  it('the policy is strict: same-origin only, no inline or eval scripts', () => {
    const policy = /add_header Content-Security-Policy "([^"]+)"/.exec(headers)?.[1] ?? '';
    expect(policy).toContain("default-src 'self'");
    expect(policy).toMatch(/script-src 'self'(;|$)/);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(policy).toContain("worker-src 'self'");
  });

  it('the page has no inline scripts (they would be blocked by that policy)', () => {
    const html = read('index.html');
    for (const tag of html.match(/<script\b[^>]*>/g) ?? []) expect(tag, tag).toMatch(/\bsrc=/);
    expect(existsSync('public/theme-init.js')).toBe(true);
  });

  it('nginx serves port 8080, falls back to the app, and has a health check', () => {
    expect(nginx).toMatch(/listen 8080;/);
    expect(nginx).toContain('try_files $uri $uri/ /index.html;');
    expect(nginx).toContain('location = /healthz');
    expect(nginx).toContain('gzip on;');
    expect(nginx).toContain('immutable');
    // The service worker and page are never cached hard.
    expect(nginx).toMatch(/location = \/sw\.js \{[^}]*no-cache/);
    expect(nginx).toMatch(/location = \/index\.html \{[^}]*no-cache/);
  });

  it('nginx.conf is well formed: braces balance and every statement ends properly', () => {
    const code = nginx.replace(/#.*$/gm, '');
    expect((code.match(/\{/g) ?? []).length).toBe((code.match(/\}/g) ?? []).length);
    for (const line of code
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)) {
      expect(/[;{}]$/.test(line) || /^[^;{}]+$/.test(line), line).toBe(true);
    }
  });

  it('every location that sets its own headers also includes the security headers', () => {
    const blocks = [...nginx.matchAll(/location [^{]+\{([^}]*)\}/g)].map((m) => m[1] as string);
    for (const b of blocks.filter((x) => x.includes('add_header'))) {
      expect(b).toContain('include /etc/nginx/fluid-frets/security-headers.conf;');
    }
  });

  it('the Dockerfile builds the app and copies files that exist', () => {
    const docker = read('Dockerfile');
    expect(docker).toContain('RUN npm ci');
    expect(docker).toContain('RUN npm run build');
    expect(docker).toContain('EXPOSE 8080');
    for (const m of docker.matchAll(/^COPY (?!--from)(\S+) /gm)) {
      const src = m[1] as string;
      expect(existsSync(src.replace(/\/$/, '')) || src === '.', src).toBe(true);
    }
    // The paths the Dockerfile installs are the ones nginx.conf reads.
    expect(docker).toContain('/etc/nginx/fluid-frets/security-headers.conf');
    expect(docker).toContain('/etc/nginx/conf.d/default.conf');
    expect(docker).toContain('/usr/share/nginx/html');
    expect(nginx).toContain('root /usr/share/nginx/html;');
  });

  it('compose publishes 8080 and .dockerignore keeps the build context small', () => {
    expect(read('docker-compose.yml')).toMatch(/"8080:8080"/);
    const ignore = read('.dockerignore');
    for (const entry of ['node_modules', 'dist', '.git']) expect(ignore).toContain(entry);
  });
});

describe('web app manifest and PWA files', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  it('is a complete installable manifest', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('lists icons that exist', () => {
    for (const icon of manifest.icons)
      expect(existsSync(`public/${icon.src}`), icon.src).toBe(true);
  });

  it('is linked from the page, with a description and theme colour', () => {
    const html = read('index.html');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="description"');
    expect(html).toContain('name="theme-color"');
  });

  it('the service worker leaves other origins alone and only handles GET', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain('self.location.origin');
  });
});
