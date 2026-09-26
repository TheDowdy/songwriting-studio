# Deploying Fluid Frets

Fluid Frets builds to plain static files (`npm run build` → `dist/`); there is no server-side code.
Asset paths are relative, so it works at the root of a site or under a sub-path (for example behind
a reverse proxy at `https://example.com/fluid-frets/`).

## Run it locally

```bash
npm install
npm run dev                          # development server
npm run build && npm run preview     # the production build
```

## Vercel or Netlify (free tiers are enough)

Connect the Git repository. Build command `npm run build`, output directory `dist`. `vercel.json`
and `netlify.toml` already set the security headers and caching, so no dashboard settings are needed.

## Docker (any machine, including a Synology NAS)

The `Dockerfile` builds the app with Node 20 and serves it with nginx on **port 8080** (running as a
non-root user).

```bash
docker compose up -d --build         # then open http://localhost:8080
```

or, without compose:

```bash
docker build -t fluid-frets .
docker run -d -p 8080:8080 --restart unless-stopped fluid-frets
```

`/healthz` returns `ok` (used by the container's health check).

### Synology (Container Manager)

1. Copy this folder to the NAS (for example `/volume1/docker/fluid-frets`).
2. **Container Manager → Project → Create**, choose that folder, and let it use the existing
   `docker-compose.yml`. Start the project.
3. Open `http://<nas-ip>:8080`.

Synology models differ (Intel/AMD vs ARM). If you build elsewhere and copy the image, build for
both:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/fluid-frets:latest --push .
```

### Sound over plain http

Browsers only allow the AudioWorklet in a **secure context** (`https://` or `localhost`). Opening
`http://<nas-ip>:8080` from another device is not secure, so there are two ways to get full sound:

- **Recommended: serve it over https.** In DSM, **Control Panel → Login Portal → Advanced → Reverse
  Proxy**, create a rule from `https://fluid-frets.your-domain` to `http://localhost:8080`, and attach a
  Let's Encrypt certificate (**Security → Certificate**). https also enables installing the app
  to a phone's home screen and working offline.
- **Or do nothing.** Without a secure context the app automatically switches to a compatibility
  engine (the same string model in a `ScriptProcessorNode`). It sounds the same but has slightly
  more latency and can glitch if the page is busy. **Settings → About** says which engine is
  running.

### Serving from a sub-path

Nothing to configure: assets are relative. Proxy `/fluid-frets/` to the container and strip the
prefix (or serve `dist/` from a matching folder).

## Installing and offline use

Over https (or on `localhost`) a small service worker caches the app after the first visit, so it
works offline, and browsers offer to install it (manifest + icons in `public/`). To force everyone
onto a new release immediately, bump `CACHE` in `public/sw.js`.

## Security headers

`docker/security-headers.conf` (mirrored in `netlify.toml` and `vercel.json`, and checked by a
test) sends a strict Content-Security-Policy: everything same-origin, no inline scripts. If you add
external resources (fonts, analytics), loosen it deliberately.

## Verifying a build

```bash
npm run build
node scripts/deploy-check.mjs       # sub-path hosting, manifest, icons, CSP, offline
```
