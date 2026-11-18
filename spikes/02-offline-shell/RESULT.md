# Spike 2: the offline shell

## Question

Can Serwist's core precache the output of `Bun.build` so that the app shell opens offline in Chromium, Firefox and Safari, answers API calls from the network only, and picks up a new shell after an update without interrupting an edit? If not, the service worker is hand-written. A second question: does a command palette built on Base UI's Autocomplete bring a second primitive library (Radix, React Aria and the like) beside Base UI?

Each check runs twice per engine: once with the Serwist worker (`sw/serwist-sw.ts`) and once with a hand-written worker (`sw/hand-sw.ts`) that serves as the control. Serwist is held at fault for a check only where the control passed the same check in the same engine.

## What was run

From `spikes/02-offline-shell`, on 2026-11-18. The offline runs are from commit `6c496af`; the palette and package checks are from the commit that adds this file.

```sh
for e in chromium firefox webkit; do for s in serwist hand; do bun test/offline.ts $e $s; done; done
bun test/offline.ts --summary
bun build.ts --sw serwist --build-id v1 --out dist/v1    # prints the worker's size
bun build.ts --sw hand --build-id v1 --out dist/v1
bun test/palette.ts
bun scripts/primitive-check.ts .
bun scripts/primitive-check.ts shadcn-probe/app
bun pm view cmdk dependencies
```

Each offline run builds `dist/v1` and `dist/v2`, serves them on a port the operating system picked, and drives a fresh persistent browser profile through checks O0 to O6:

- **O0** offline is real: with the browser set offline and the server stopped, the worker's own `fetch('/api/ping')` and the page's both fail.
- **O1** after the first online load, the page is controlled by the worker.
- **O2** the whole shell is stored: every precache URL is in Cache Storage with the built file's bytes (SHA-256), and at least four of the URLs are font files.
- **O3** offline reload: the shell shows its build ID and all four Courier Prime faces (regular, italic, bold, bold italic) load.
- **O4** offline cold start: after the browser is closed and reopened with the server still stopped, `/` and the deep link `/s/abc` both show the shell.
- **O5** the API is never cached: two online pings return different times and both reach the server, no `/api/` response is in Cache Storage, and offline the ping fails.
- **O6** an update does not interrupt an edit: with text typed and a new build waiting, the page is not reloaded, the text stays, the page and its worker are still the old build; after the browser is reopened the first navigation shows the new build, and Cache Storage holds only the new build's files.

`setOfflineBlocksWorker` records whether Playwright's `context.setOffline(true)` alone, with the server still up, stops the worker's own requests. It is recorded, not a check.

The shadcn probe, in `shadcn-probe/`, with its own release-age `bunfig.toml`:

```sh
bun add --dev --exact shadcn@4.23.0
bunx shadcn init -t vite -b base -n app -y --no-monorepo
#   stopped at the prompt "Which preset would you like to use?"; no flag in this command answers it
bunx shadcn init -t vite -b base -p nova -n app -y --no-monorepo
#   exit 1, "We could not detect a supported framework": with a package.json in the working
#   directory the CLI initialises that directory instead of creating a project
mkdir work && bunx shadcn init -t vite -b base -p nova -n app -y --no-monorepo -c work
mv work/app app && rmdir work && rm -rf app/.git      # the CLI had made a git repository in app
cp bunfig.toml app/ && rm -rf app/node_modules app/bun.lock
cd app && bun install
#   exit 1, No version matching "^1.75.0" found for specifier "lucide-react"
#   (blocked by minimum-release-age: 259200 seconds)
bun add --exact lucide-react@1.73.0                    # the newest release the rule accepts
bunx shadcn add dialog popover combobox autocomplete -y
#   exit 1, the registry has no autocomplete for the base-nova style
bunx shadcn add dialog popover combobox -y            # added six components, installed nothing new
```

Afterwards the Vite template files that do not bear on what is installed (readme, logos, entry files, lint, TypeScript and Vite configuration) were deleted; the lockfile, the manifest, `components.json` and the added components are kept.

## Machine and versions

| Item | Value |
|---|---|
| Machine | Apple M5 Max, 18 cores, 48 GB, macOS 27.0.1 |
| Bun | 1.4.4 |
| Chromium (`browser.version()`) | 159.0.8154.6 |
| Firefox | 159.0 |
| WebKit | 27.2 |
| `serwist` | 9.5.13 |
| `react`, `react-dom` | 19.3.1 |
| `@base-ui/react` | 1.9.0 |
| `@fontsource/courier-prime` | 5.3.0 |
| `playwright` | 1.65.1 |
| `shadcn` (probe only) | 4.23.0 |

Versions that differ from the spike's list: `serwist` is 9.5.13, the version the product's catalog holds (the list allowed 9.5.14 or 9.5.13). In the shadcn probe the release-age rule replaced `lucide-react` `^1.75.0` with 1.73.0, and on reinstall resolved these older releases than the CLI's own install had: `@tybys/wasm-util` 0.10.4, `@typescript-eslint/*` and `typescript-eslint` 8.72.2, `baseline-browser-mapping` 2.11.37, `browserslist` 4.29.5, `csstype` 3.2.3, `electron-to-chromium` 1.5.486, `eslint-plugin-react-refresh` 0.5.7, `ignore` 7.0.14, `node-releases` 2.0.64, `systeminformation` 5.33.22, `update-browserslist-db` 1.3.4 (`results/primitives.json`).

## Numbers

No step of this spike is timed, so no load baseline applies.

Offline checks, Serwist / hand-written control (`results/offline-<engine>-<worker>.json`):

| Check | Chromium | Firefox | WebKit |
|---|---|---|---|
| O0 offline is real | pass / pass | pass / pass | pass / pass |
| O1 controlled | pass / pass | pass / pass | pass / pass |
| O2 shell stored | fail / fail | fail / fail | fail / fail |
| O3 offline reload, fonts | pass / pass | pass / pass | pass / pass |
| O4 offline cold start, deep link | pass / pass | pass / pass | pass / pass |
| O5 API never cached | pass / pass | pass / pass | pass / pass |
| O6 update without interrupting an edit | pass / pass | pass / pass | pass / pass |
| `setOfflineBlocksWorker` | true / true | false / false | true / true |

Why O2 fails for both workers: `Bun.build` 1.4.4 inlines every asset a stylesheet references that is smaller than about 128 KB as a `data:` URL, and no option turns this off (a `file` loader for `.woff2` changes nothing). All 16 Courier Prime font sources (four faces, Latin and Latin Extended, woff2 and woff) are inside the CSS chunk, so the precache list has three URLs (`index.html`, one script, one stylesheet) and no font file. The first half of O2 held in every run: each of the three URLs was in Cache Storage with the built bytes. The fonts are stored, inside the stylesheet, and O3's font check passed offline in every run.

Summary after the control rule (`results/offline-summary.json`): O0, O1, O3, O4, O5 and O6 `pass` in all three engines; O2 `not run` in all three, because the control failed it too.

Worker size, as `build.ts` bundles it (not minified; the Serwist bundle includes Serwist's development logging):

| Worker | Bytes | Gzip bytes |
|---|---|---|
| Serwist | 92713 | 21461 |
| Hand-written | 1476 | 676 |

Palette, Chromium, on the Serwist build (`results/palette-chromium.json`): `Mod+K` opened a listbox, typing `ver` left the one option `Version history`, and Enter set `data-ran` to `Version history`; `pass` online and `pass` again after going offline and reloading.

Primitive libraries (`results/primitives.json`): this project installs 18 packages, offenders none; the shadcn probe installs 357 packages, offenders none. Base UI brings `@base-ui/utils` and the `@floating-ui/*` packages, which are positioning code, not a component library.

`cmdk` 1.1.1 depends on `@radix-ui/react-id` `^1.1.0`, `@radix-ui/react-dialog` `^1.1.6`, `@radix-ui/react-primitive` `^2.0.2` and `@radix-ui/react-compose-refs` `^1.1.1`: the claim that it depends on Radix holds.

## Criteria

| Criterion | Measured | Status |
|---|---|---|
| 1. The shell opens offline in Chromium, Firefox and Safari (O3 and O4; WebKit stands in for Safari) | O3 and O4 pass in Chromium, Firefox and WebKit | pass (Safari itself not run) |
| 2. Offline is real when the checks run (O0) | pass in all three engines; `setOfflineBlocksWorker` Chromium true, Firefox false, WebKit true | pass |
| 3. The worker controls the page after the first load (O1) | pass in all three engines | pass |
| 4. The whole shell, fonts included, is stored (O2) | both workers fail in all three engines: no font file in the precache list, because `Bun.build` inlines the fonts into the stylesheet | not run |
| 5. The API is never answered from cache (O5) | pass in all three engines | pass |
| 6. An update never replaces a page being edited, and no old file remains (O6) | pass in all three engines | pass |
| 7. The worker's size, Serwist against hand-written | 21461 against 676 bytes gzip | recorded; no threshold |
| 8. The palette's component set brings no second primitive library | offenders: none in this project, none in the shadcn probe | pass |

## Not covered

| Not covered | Stand-in | Limit of the stand-in |
|---|---|---|
| Real Safari | Playwright's WebKit build on macOS | Not Safari |
| Release Firefox | Playwright's Firefox build | Not the release build |
| Windows | Nothing | — |
| A face missing from the font set | The font check asks for each face and needs a loaded Courier Prime face back | With one face removed (bold italic), Chromium and WebKit hand back a neighbouring face and the check still passes; it catches the family missing, not a single face |
| An autocomplete component from shadcn | Dialog, popover and combobox from its registry | The registry has no autocomplete for the base-nova style |

## Decision

**Provisional: Serwist 9.5.13** (`SERVICE_WORKER = "serwist"`). No check records a Serwist `fail`; O2 is `not run` in all three engines because both workers failed it for a reason outside the worker (the build inlines the fonts). The by-hand check that closes it, in Chrome, Firefox and Safari: from `spikes/02-offline-shell`, run `bun build.ts --sw serwist --build-id v1 --out dist/v1`, then `bun -e 'import { startServer } from "./serve.ts"; startServer({ dir: "dist/v1", port: 8080 })'`; open `http://127.0.0.1:8080/` once; stop the server; quit and reopen the browser; open the same address and `http://127.0.0.1:8080/s/abc`; the shell shows.

The palette has no offender in either check: the product builds its palette on Base UI's Autocomplete and copies one stylesheet from shadcn without installing it.

`goOffline` per engine: Chromium and WebKit stop the worker's own requests with `context.setOffline(true)` alone; Firefox does not.

## Decision table

| Question | Measured | Threshold | Outcome | Consequence |
|---|---|---|---|---|
| O0 Chromium (Serwist, control) | pass, pass | pass | pass | none |
| O0 Firefox (Serwist, control) | pass, pass | pass | pass | none |
| O0 WebKit (Serwist, control) | pass, pass | pass | pass | none |
| O1 Chromium (Serwist, control) | pass, pass | pass | pass | none |
| O1 Firefox (Serwist, control) | pass, pass | pass | pass | none |
| O1 WebKit (Serwist, control) | pass, pass | pass | pass | none |
| O2 Chromium (Serwist, control) | fail, fail | pass | not run | Provisional: Serwist; the by-hand check under Decision |
| O2 Firefox (Serwist, control) | fail, fail | pass | not run | Provisional: Serwist; the by-hand check under Decision |
| O2 WebKit (Serwist, control) | fail, fail | pass | not run | Provisional: Serwist; the by-hand check under Decision |
| O3 Chromium (Serwist, control) | pass, pass | pass | pass | none |
| O3 Firefox (Serwist, control) | pass, pass | pass | pass | none |
| O3 WebKit (Serwist, control) | pass, pass | pass | pass | none |
| O4 Chromium (Serwist, control) | pass, pass | pass | pass | none |
| O4 Firefox (Serwist, control) | pass, pass | pass | pass | none |
| O4 WebKit (Serwist, control) | pass, pass | pass | pass | none |
| O5 Chromium (Serwist, control) | pass, pass | pass | pass | none |
| O5 Firefox (Serwist, control) | pass, pass | pass | pass | none |
| O5 WebKit (Serwist, control) | pass, pass | pass | pass | none |
| O6 Chromium (Serwist, control) | pass, pass | pass | pass | none |
| O6 Firefox (Serwist, control) | pass, pass | pass | pass | none |
| O6 WebKit (Serwist, control) | pass, pass | pass | pass | none |
| Service worker | no Serwist `fail`; O2 `not run` in every engine | Serwist `fail` on any of O1–O6 → hand-written; all `pass` → Serwist | Provisional: Serwist | `SERVICE_WORKER = "serwist"` → plan 06 is built as written, with `serwist` at `SERWIST_VERSION`. Had it been `"hand"`: plan 06, "Depends on spike 2" row 1, the body of `apps/web/src/sw/precache.ts` becomes the hand-written worker that row describes, and the coordinator removes `serwist` from `apps/web/package.json` and the root catalog before plan 06 starts |
| `setOfflineBlocksWorker` Chromium | true (both workers) | — | recorded | `OFFLINE_BLOCKS_WORKER.chromium = true` → plan 06, "Depends on spike 2" row 5 (`goOffline` in `e2e/offline/support.ts`): goes offline with `context.setOffline(true)` alone |
| `setOfflineBlocksWorker` Firefox | false (both workers) | — | recorded | `OFFLINE_BLOCKS_WORKER.firefox = false` → plan 06, "Depends on spike 2" row 5 (`goOffline` in `e2e/offline/support.ts`): handled as that row states for WebKit |
| `setOfflineBlocksWorker` WebKit | true (both workers) | — | recorded | `OFFLINE_BLOCKS_WORKER.webkit = true` → plan 06, "Depends on spike 2" row 5 (`goOffline` in `e2e/offline/support.ts`): goes offline with `context.setOffline(true)` alone |
| Worker size, Serwist | 92713 bytes, 21461 gzip | none | recorded | changes nothing |
| Worker size, hand-written | 1476 bytes, 676 gzip | none | recorded | changes nothing |
| Palette check, this project | offenders: none (18 packages) | no offender | pass | changes no later plan: the palette is built on Base UI's Autocomplete |
| Palette check, shadcn probe (dialog, popover, combobox) | offenders: none (357 packages) | no offender | pass | changes no later plan: one stylesheet is copied from shadcn without installing it |
| `cmdk` dependencies | `@radix-ui/react-id` `^1.1.0`, `@radix-ui/react-dialog` `^1.1.6`, `@radix-ui/react-primitive` `^2.0.2`, `@radix-ui/react-compose-refs` `^1.1.1` (`cmdk` 1.1.1) | — | recorded | changes nothing |

```ts
SERVICE_WORKER = "serwist"
SERWIST_VERSION = "9.5.13"
OFFLINE_BLOCKS_WORKER = { "chromium": true, "firefox": false, "webkit": true }
```
