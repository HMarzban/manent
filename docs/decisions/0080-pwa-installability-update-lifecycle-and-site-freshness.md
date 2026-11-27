# 0080. Installable PWA delivery, safe service-worker updates and landing-site freshness

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Decision 0028 put offline web work in browser storage with a Serwist service worker, and decision 0059 kept heavy on-demand tools (PDF import, `@manent/formats` and the Ink worker) out of render-blocking first-frame precaching. Running the web app and the static site exposed four coupled reliability gaps:

1. Because the service worker waited for every open tab to close (`skipWaiting: false`) without an update notification, `SKIP_WAITING` handshake or active update polling, any long-lived tab stayed pinned to an old build across normal reloads.
2. Unconditional `index.html` fallback for missing static asset paths let a post-deploy fetch of an old chunk return `200 text/html` and poison the runtime asset cache; unhashed workers and landing-site assets also lacked explicit freshness guarantees.
3. Cold offline relaunch in a fresh tab or standalone window redirected to `/choose` because the active person lived only in `sessionStorage`, while team workspaces dropped offline and heavy tools (PDF fonts, `pdfjs-dist`, `@manent/formats`, Ink worker) were unavailable offline until first used online.
4. The web app had no web app manifest, app icons, browser-wide backup export, or HTTP security headers / CSP coordinated with the desktop local node's injected boot script.

## Options considered

- **Call `skipWaiting()` automatically on service-worker install.** Rejected: swapping precache and runtime caches underneath a live editor tab interrupts active writing, breaks lazy chunk loads and risks multi-tab IndexedDB schema skew.
- **Eagerly precache every heavy format and PDF library during install.** Rejected: regresses first-frame hydration and wastes bandwidth on metered connections (decision 0059).
- **Explicit safe update handshake, 404 anti-poisoning, Tier-2 idle warming, installable manifest and deterministic site stamping.** Chosen: keeps first paint fast and typing uninterrupted while guaranteeing prompt updates, true cold offline launches, offline tool readiness and zero-build site freshness.

## Decision

1. **Build identity and hashed Ink worker:** `apps/web/build.ts` content-hashes the Ink compiler worker (`/ink-compile-<hash>.worker.js`), computes `buildId` across all built runtime assets (precached and on-demand), writes `<outDir>/build-meta.json`, injects `<meta name="manent-build">` plus manifest and icon links after `<meta name="color-scheme">`, and compiles `self.__WARM_MANIFEST` into `sw.js`.
2. **Server static caching and security headers:** `packages/server-core/src/http/static.ts` returns `404` (`Cache-Control: no-store`) for missing static asset extensions instead of falling back to `index.html`, serves `sw.js` with `no-cache, max-age=0, must-revalidate` and fresh HTML/manifest files with `no-cache` plus strong `ETag` (`304`), marks hashed assets `public, max-age=31536000, immutable`, and sets `application/manifest+json; charset=utf-8` on `manifest.webmanifest`. `server.ts` attaches `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, strict HTML `Content-Security-Policy` (keyed to `bootScriptHash()`), `X-Manent-Build-Id` on `/api/*`, and optional `webBuildId` on WebSocket `WELCOME`. `packages/local-node/src/http/launch-guard.ts` returns `404` for `/sw.js`, appends the injected desktop boot script's SHA-256 hash to `script-src`, strips `ETag` and sets `no-store`.
3. **Safe service-worker lifecycle and Tier-2 idle warming:** `apps/web` never registers `/sw.js` inside the desktop WebView. On the web, it registers with `{ updateViaCache: "none" }`, polls on visibility, `pageshow`, `online`, interval and build-ID mismatch, refuses `text/html` in runtime caches, keeps `skipWaiting: false` by default, surfaces a calm `"An update is ready."` / `"Reload to update"` action coordinated across tabs over `BroadcastChannel`, and reloads on `controllerchange` only when an existing controller was explicitly replaced. After first paint and typing idle, the worker sequentially warms `self.__WARM_MANIFEST` while respecting `saveData` and `2g` connections and reporting verifiable Cache Storage readiness.
4. **Cold offline launch, storage durability and installable PWA:** `apps/web` seeds cold launches from the last active person in `localStorage` (preserving per-tab `sessionStorage` overrides), falls back to cached `DeviceMemory` workspaces offline for Library and archives, bounds boot probes against stalled networks, wires `navigator.storage.estimate()` into quota-aware asset LRU eviction and Preferences, coordinates multi-tab IndexedDB `versionchange`/`blocked` events, drains pending inline-graphic uploads on startup, and ships `manifest.webmanifest`, icons, lazy `launchQueue` handling for `.fdx`/`.fountain`/`.ink`, dynamic `theme-color`, shell-only standalone/safe-area CSS, and one-click browser `.zip` backup.
5. **Landing-site freshness:** `tools/stamp-site.ts` stamps deterministic `?v=<8-char-sha256>` hashes onto mutable local asset references across `site/*.html` and `site/assets/site.css`, enforced by `tools/test/site.test.ts` and deployed on `site/**` pushes to `main` via `.github/workflows/pages.yml`.

## Consequences and trade-offs

- Writers never lose unsaved typing to an unexpected reload, yet always see and apply new releases promptly in one click across tabs without hunting for open windows.
- Cold airplane-mode relaunches open directly into cached workspaces, scripts, PDF export, Ink compilation and browser-wide `.zip` backups; browser storage remains weaker than the desktop SQLite node (decision 0028), especially under Safari's seven-day eviction outside standalone installation.
- Missing asset URLs now return `404` rather than `index.html`, eliminating runtime cache poisoning at the cost of requiring stale open tabs to reload after a deploy drops old hashed chunks.
- Any edit to a stamped asset under `site/` requires running `bun tools/stamp-site.ts` before merging, enforced automatically by `tools/test/site.test.ts`.

## Revisit when

- Hosted multi-user deployment introduces a CDN or edge asset retention window for previous hashed chunks across rolling deploys.
- Native browser background-sync or File System Access APIs reach uniform support across Chromium, Firefox and WebKit.
