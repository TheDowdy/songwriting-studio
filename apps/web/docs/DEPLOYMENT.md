# Deploying Songwriting Studio

Songwriting Studio builds to plain static files (`npm run build` → `dist/`); there is no
server-side code. Asset paths are relative, so it works at the root of a site or under a sub-path
(for example behind a reverse proxy at `https://example.com/songwriting-studio/`).

## Run it locally

```bash
npm install                          # from the repo root
npm run dev                          # development server (apps/web, Vite)
npm run build && npm run preview     # the production build
```

Every command above also works run directly inside `apps/web/` — the root scripts are thin
wrappers (`npm run dev --workspace=apps/web`, etc.) so both are equivalent.

## Vercel or Netlify (free tiers are enough)

Connect the Git repository. Build command `npm run build`, output directory `apps/web/dist`.
`apps/web/vercel.json` and `apps/web/netlify.toml` already set the security headers and caching,
so no dashboard settings are needed.

## Docker (any machine, including a Synology NAS)

The `apps/web/Dockerfile` builds the app with Node 20 and serves it with nginx on **port 8080**
(running as a non-root user).

```bash
cd apps/web
docker compose up -d --build         # then open http://localhost:8080
```

or, without compose:

```bash
cd apps/web
docker build -t songwriting-studio .
docker run -d -p 8080:8080 --restart unless-stopped songwriting-studio
```

`/healthz` returns `ok` (used by the container's health check).

### Synology (Container Manager)

1. Copy `apps/web` to the NAS (for example `/volume1/docker/songwriting-studio`).
2. **Container Manager → Project → Create**, choose that folder, and let it use the existing
   `docker-compose.yml`. Start the project.
3. Open `http://<nas-ip>:8080`.

Synology models differ (Intel/AMD vs ARM). If you build elsewhere and copy the image, build for
both:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/songwriting-studio:latest --push .
```

### Sound over plain http

Browsers only allow the AudioWorklet in a **secure context** (`https://` or `localhost`). Opening
`http://<nas-ip>:8080` from another device is not secure, so there are two ways to get full sound:

- **Recommended: serve it over https.** In DSM, **Control Panel → Login Portal → Advanced →
  Reverse Proxy**, create a rule from `https://songs.your-domain` to `http://localhost:8080`, and
  attach a Let's Encrypt certificate (**Security → Certificate**). https also enables installing
  the app to a phone's home screen and working offline.
- **Or do nothing.** Without a secure context the guitar module automatically switches to a
  compatibility engine (the same string model in a `ScriptProcessorNode`). It sounds the same but
  has slightly more latency and can glitch if the page is busy. The guitar module's Settings
  dialog says which engine is running.

### Serving from a sub-path

Nothing to configure: assets are relative (`base: './'` in `apps/web/vite.config.ts`). Proxy
`/songwriting-studio/` to the container and strip the prefix (or serve `dist/` from a matching
folder). `scripts/deploy-check.mjs` verifies the whole app — the library, and both modules inside
a song — from a sub-path, not just the built files.

## Installing and offline use

Over https (or on `localhost`) `public/sw.js` caches the app shell **eagerly** on first install
(the library page and every JS/CSS file it needs) and everything else — the guitar samples
included — in a **runtime cache**, filled the first time each is actually requested. Together
that means the app works offline after the very first visit, and browsers offer to install it
(manifest + icons in `public/`). To force everyone onto a new release immediately, bump `CACHE` in
`public/sw.js`.

## Security headers

`docker/security-headers.conf` (mirrored in `netlify.toml` and `vercel.json`, and checked by
`scripts/deploy-check.mjs`) sends a strict Content-Security-Policy: everything same-origin, no
inline scripts. If you add external resources (fonts, analytics), loosen it deliberately.

The shell's Geist fonts (`@fontsource-variable/geist`/`-mono`) are bundled as `data:` URIs, so the
policy allows `font-src 'self' data:`.

## Verifying a build

```bash
npm run build
node scripts/deploy-check.mjs       # sub-path hosting (library + both modules), manifest, icons, CSP, offline
```
