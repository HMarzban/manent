# 0028. On the web, offline work lives in browser storage

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

The web app must work offline with nothing installed. Browsers offer storage for that but treat it as their own: a browser may clear a site's data under storage pressure, and one deletes storage written by scripts after seven days of browsing without a visit to the site.

## Options considered

- Online only on the web, offline only in the desktop app. Rejected: offline work is a requirement in both.
- Browser storage, with its limits said plainly. Chosen.
- For the offline app shell: Serwist's core, Workbox, or a hand-written service worker. The project owner chose Serwist's core, with a hand-written worker as the fallback.

## Decision

On the web, documents and unsynced changes live in browser storage, and persistent storage is requested. A script that exists only in this browser says so. The desktop app is the durable offline client. The offline shell is a service worker built on Serwist's core over the list of files our own build writes, so no build plugin is needed. A throwaway prototype is to check that the shell opens offline in three browser engines; if it cannot, the hand-written worker is used.

## Consequences and trade-offs

- A browser can clear its storage, and the device's identity goes with it, so what existed only there cannot even be named afterwards.
- The web is a weaker offline client than the desktop app, and the product says so.
- Serwist has one maintainer. If it stops being released, the hand-written worker replaces the one file that uses it.
- Bundling Serwist with Bun's bundler has been checked. Running it in a real browser has not.

## Revisit when

Browsers give durable storage without conditions, or the prototype shows that Serwist's core does not open offline in an engine we support.
