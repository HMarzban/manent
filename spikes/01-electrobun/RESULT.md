# Spike 1: Electrobun as the desktop shell

## Question

Does Electrobun 2.0.6 work as Manent's desktop shell on macOS, Windows and Linux?

Electrobun stays the shell unless it cannot work. One outcome alone switches to the fallback, Electron 45 with the Bun-compiled local node as a sidecar process: a hard failure on macOS, meaning the app does not build, does not start, or cannot load its page. Everything else here is a recorded measurement that decides nothing: cold start, idle memory and installer size against Electron's, typing latency and seven editing checks in both shells, the user agent, and the update path. A failure on Windows or Linux is recorded as "not supported in this release on that system, pending the owner".

This file is provisional: the Windows and Linux rows come from the CI workflow (`.github/workflows/spike-01-electrobun.yml`), which has not run yet, and are `not run (CI)` below.

## What was run

From `spikes/01-electrobun` on this Mac, on 2026-11-18. The app and its smoke test are from commit `84dafca`, the Electron shell and the measurements from `1a39a31`, the update check and the CI workflow from the commit that adds this file.

```sh
HUTCH_HOME="$PWD/.hutch-home" bunx electrobun build --env=stable                         # 0.0.1
SPIKE_DEBUG_PORT=9334 HUTCH_HOME="$PWD/.hutch-home" bunx electrobun build --env=stable   # 0.0.1 with a debugging port
SPIKE_VERSION=0.0.2 HUTCH_HOME="$PWD/.hutch-home" bunx electrobun build --env=stable     # the update
bun build --compile shared/sidecar.ts --outfile electron/bin/sidecar
CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --mac dmg --config electron/electron-builder.yml
caffeinate -dimsu bun scripts/smoke.ts electrobun --app artifacts/installed/electrobun/ManentSpike.app/Contents/MacOS/launcher --expect-version 0.0.1
caffeinate -dimsu bun scripts/smoke.ts electron --app artifacts/installed/electron/ManentSpike.app/Contents/MacOS/ManentSpike --expect-version 0.0.1
nohup caffeinate -dimsu scripts/timed.sh bun scripts/measure.ts \
  --electrobun artifacts/installed/electrobun/ManentSpike.app/Contents/MacOS/launcher \
  --electrobun-debug artifacts/installed/electrobun-debug/ManentSpike.app/Contents/MacOS/launcher \
  --electron artifacts/installed/electron/ManentSpike.app/Contents/MacOS/ManentSpike \
  --installers artifacts/installers/macos-arm64-ManentSpike.dmg,artifacts/installers/ManentSpike-0.0.1-arm64.dmg \
  --pairs 15 --out results/measure-darwin.json > artifacts/logs/measure.log 2>&1 &
bun scripts/compare.ts results/measure-darwin.json --out results/compare-darwin.json
caffeinate -dimsu bun scripts/update-check.ts --app artifacts/installed/electrobun/ManentSpike.app/Contents/MacOS/launcher --updates artifacts/updates
```

Each installer was installed the way a drag to Applications installs it, without touching `/Applications`: the DMG mounted with `hdiutil attach -nobrowse`, the `.app` copied to `artifacts/installed/<electrobun|electrobun-debug|electron>/`, the DMG detached. Each Electrobun install was then launched once, before any measured launch, because its first launch unpacks the app in place (8.7 to 10.0 s to the local node's `node.json`). Both builds are unsigned; the toolchains sign the binaries ad hoc (`codesign -dv`: `adhoc,linker-signed`) and macOS launched them without any further step.

`measure.ts`, the same for both shells:

- **Cold start:** milliseconds from just before the installed executable is spawned to the page's `first-frame` mark (sent after the first animation frame of a 120-page document). Fifteen pairs, one launch of each shell per pair, the order alternating from pair to pair. Before each launch every process whose executable is inside any of the installed `.app` folders is stopped, the data folder is new (it holds the local node's data and Electron's Chromium profile), and Electrobun's own Chromium profile (`~/Library/Application Support/dev.manent.spike01/stable/CEF`, which no setting moves) is deleted.
- **Idle memory:** resident memory summed over every process inside the `.app`, 30 s after the first frame, in pairs 1 to 5.
- **Typing latency:** 5 more launches per shell, alternating, attached over the Chrome DevTools Protocol (Electron with `--remote-debugging-port=9333`, Electrobun from the copy built with port 9334). Per launch: the cursor to the middle of the document, `warmup ` typed at 50 ms spacing, then `the quick brown fox jumps over the lazy dog ` five times at 70 ms spacing (220 keystrokes). Each sample is the time from the capture-phase `keydown` through the ProseMirror dispatch that changes the document to a message-channel task after the next animation frame. Intervals are 95 % percentile bootstrap intervals (10,000 resamples, seed 1) over the 5 launches.
- **Editing checks,** in each shell's first typing launch, after the typing: C1 the sentence typed (the cursor's block, block count, cursor position, document length); C2 Enter in the middle of a block, then Backspace; C3 ArrowDown × 50 then ArrowUp × 50; C4 Shift+ArrowRight × 10; C5 select all, type `x`, undo; C6 a composition through `Input.imeSetComposition` (`k`, `ka`, `kan`) and `Input.insertText('kan')`, with the `compositionstart` and `compositionend` counts and `view.composing` afterwards; C7 a composition cancelled with empty text. A check is compared between the shells only when both pages report the same `innerWidth`, `innerHeight` and `devicePixelRatio`.

The update check serves `artifacts/updates/` (0.0.2's `stable-macos-arm64-update-v2.json`, `stable-macos-arm64-update.json` and `stable-macos-arm64-ManentSpike.app.tar.zst`) on `127.0.0.1:47471`, the address built into the app, and launches the installed 0.0.1 with `SPIKE_CHECK_UPDATE=1`: the main process runs `Updater.checkForUpdate()`, `downloadUpdate()` and `applyUpdate()`, logging each status. It passes when the relaunched process's `/health` reports 0.0.2 within 120 s.

The first update check failed, for a reason in this spike's own code: the main process vetoes the first quit so that the local node can close its database, and `Updater.applyUpdate()` asks the `before-quit` handlers for approval before it hands over; the veto cancelled the hand-off (the updater emits `idle`, "Update restart was cancelled by a before-quit handler") and the app then quit as 0.0.1. The main process now stops the node itself before `applyUpdate()`. Both versions were built again from that code, 0.0.1 installed again with its first launch, and the check run again: that run is `results/update-darwin.json`.

## Machine and versions

| Item | Value |
|---|---|
| Machine | Apple M5 Max, 18 cores, 48 GB, macOS 27.0.1 |
| Bun | 1.4.4 |
| Electrobun | 2.0.6 (Hutch 0.29.0, Cottontail 0.7.3, CEF with Chromium 156.0.8078.17) |
| Electron | 45.3.2 (Chromium 156.0.8078.100) |
| `electron-builder` | 26.18.0 |
| `playwright` | 1.65.1 (only to attach over CDP; no browser of its own was used) |
| ProseMirror | `prosemirror-model` 1.25.13, `-state` 1.4.4, `-view` 1.42.9, `-transform` 1.12.5, `-keymap` 1.2.3, `-commands` 1.7.2, `-history` 1.5.1 |

Versions that differ from the spike's list: **Electron is 45.3.2**, because the release-age rule (three days) refused 45.3.3: `error: No version matching "45.3.3" found for specifier "electron" (blocked by minimum-release-age: 259200 seconds)`.

## Numbers

All timed rows are from one run under `scripts/timed.sh`, whose 1-minute load baseline was **3.53** (limit 4.0). The load sampled around each pair (`loadStart`, `loadEnd`) went from 2.37 to 5.23; it includes the harness's own load and is not acted on. A test run of another part of the repository (one process, about one core) ran beside the measurement from its start to the ninth typing launch.

Cold start, `results/measure-darwin.json` (baseline 3.53):

| Pair | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Launched first | Eb | El | Eb | El | Eb | El | Eb | El | Eb | El | Eb | El | Eb | El | Eb | |
| Electrobun (ms) | 290 | 1051 | 309 | 772 | 332 | 759 | 325 | 1264 | 324 | 766 | 756 | 313 | 772 | 349 | 767 | 756 |
| Electron (ms) | 307 | 281 | 320 | 253 | 245 | 249 | 245 | 253 | 252 | 249 | 252 | 254 | 257 | 632 | 295 | 253 |

Ratio of the medians, Electrobun ÷ Electron: **2.99**, 95 % interval **1.18–3.04** (paired bootstrap over whole pairs), against the reference figure 1.5: `inconclusive` (`results/compare-darwin.json`). Electrobun's cold starts fall in two groups, about 300 ms and about 770 ms, alternating from pair to pair; Electron's are about 250 ms. The interval is wide because of the two groups.

Idle memory, 30 s after the first frame (`results/measure-darwin.json`, pairs 1–5, baseline 3.53):

| Shell | Pair 1 | Pair 2 | Pair 3 | Pair 4 | Pair 5 |
|---|---|---|---|---|---|
| Electrobun | 576.0 MB | 576.0 MB | 581.1 MB | 577.1 MB | 579.1 MB |
| Electron | 482.0 MB | 479.8 MB | 480.1 MB | 478.9 MB | 479.2 MB |

Installer size (`results/measure-darwin.json`), against the project's budget for a desktop installer (at most 250 MB; more than 400 MB is a hard failure):

| Installer | Bytes |
|---|---|
| Electrobun, `macos-arm64-ManentSpike.dmg` | 152,601,920 |
| Electron, `ManentSpike-0.0.1-arm64.dmg` | 161,669,039 |

Typing latency, keystroke to next frame (`results/measure-darwin.json`, 5 launches × 220 keystrokes per shell, baseline 3.53):

| Shell | n | p50 | p95 | p99 | Each launch's p50 |
|---|---|---|---|---|---|
| Electrobun | 1100 | 2.5 ms (2.5–2.6) | 6.1 ms (3.7–9.2) | 15.6 ms (13.6–16.4) | 2.5, 2.5, 2.6, 2.6, 2.5 |
| Electron | 1100 | 3.3 ms (3.2–3.4) | 9.7 ms (7.5–11.7) | 17.2 ms (16.0–18.1) | 3.3, 3.1, 3.4, 3.2, 3.5 |

Editing checks (`results/measure-darwin.json`): the page measured **1280 × 832** in Electrobun and **1280 × 800** in Electron, both at `devicePixelRatio` 2. Electrobun 2.0.6 makes the window's `frame` height the page's own height: its log reads `view size: 1280x832`, and the system's window list shows a window of 1280 × 832 points, title bar included, so the page also fills the title bar's height (inferred from those two figures). The windows differ, so no check is comparable and `editing` is `not run`. All seven checks recorded the same values in both shells: C1 the typed sentence in the block, C2 one more block after Enter and the same block again after Backspace, C3 back at the same position, C4 10 characters selected, C5 the full document length again after undo, C6 `kan` inserted with one `compositionstart` and one `compositionend` and `composing` false, C7 the document unchanged.

User agent (the page's `ua-` mark): Electrobun `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36` (the bundled Chromium, not the system's WebKit); Electron `… manent-spike-01-electrobun/0.0.1 Chrome/156.0.8078.100 Electron/45.3.2 Safari/537.36`.

Update path on macOS (`results/update-darwin.json`): **applied**. 0.0.1 found 0.0.2, downloaded it (148,267,769 bytes served: the 148,267,147-byte archive and the 311-byte manifest, read once by each process), staged it, quit, and the relaunched process reported 0.0.2 on `/health` **10,031 ms** after 0.0.1 was launched. Statuses: `checking`, `update-available`, `download-starting`, `downloading`, `download-complete`, then from the relaunched 0.0.2 `checking`, `complete`, `no-update`. The statuses of the hand-off itself are not recorded, because the node stops before it. The relaunched process kept the environment it was started with. The build has no patch generation (`release.generatePatch: false`), so the whole archive was fetched.

Smoke tests: `results/smoke-electrobun-darwin.json` (`/health` 698 ms after spawn, WebSocket round trip, 3 SQLite rows) and `results/smoke-electron-darwin.json` (1,417 ms, the same checks).

Install details, the Hutch archive and the checksums: `results/install-notes.md`.

## Criteria

| Criterion | Measured | Status |
|---|---|---|
| 1. The app builds, starts and loads its page on macOS | built, installed from its DMG, `smoke.ts` exit 0: `/health` answered, the page reached its first frame, the WebSocket round trip wrote a row (`results/smoke-electrobun-darwin.json`) | pass |
| 2. The app builds, installs, starts and loads its page on Windows | not run (CI) | not run (CI) |
| 3. The app builds, installs, starts and loads its page on Linux | not run (CI) | not run (CI) |

Recorded, not criteria: cold start against Electron's (2.99, interval 1.18–3.04, `inconclusive` against 1.5), idle memory (about 578 MB against about 480 MB), installer sizes (152.6 MB and 161.7 MB, both inside the 250 MB budget), typing latency (above), the editing checks (`not run`: the windows differ), the user agent (Chromium 156 in both), the macOS update path (`applied`).

## Not covered

| Not covered | Stand-in | Limit of the stand-in |
|---|---|---|
| Windows | The `windows-2025` runner, in the CI workflow | "Works or does not"; hosted runners are too noisy for timing |
| Linux on x64 | The `ubuntu-24.04` runner, in the CI workflow | The same |
| Input methods | Chromium's composition simulation over CDP (`Input.imeSetComposition`), in both shells | Not a real input method |
| Signed builds and their first-open flows | Unsigned builds, signed ad hoc by the toolchains | — |
| Editing checks compared in equal windows | None: Electrobun's page is 32 points taller | The values agree, but the rule compares only equal windows |
| The `execCommand` stand-in for a shell without a debugging port | Not needed on this Mac: both ports answered | Where a port does not answer, the typing and editing rows of that run are `not run` |

## Decision

**Provisional: Electrobun 2.0.6** (`SHELL = "electrobun"`). The macOS criterion passes; Windows and Linux are `not run (CI)` until the CI workflow has run. The by-hand check that closes each of them: install on that system, then run `smoke.ts` against the installed app. On Windows: from `spikes/01-electrobun`, `bun install --frozen-lockfile`, `bun scripts/build-page.ts`, `bunx electrobun build --env=stable`, unzip `artifacts/win-x64-ManentSpike-Setup.zip`, run its setup, then `bun scripts/smoke.ts electrobun --app <the installed launcher>`. On Linux: the same with `artifacts/linux-x64-ManentSpike-Setup.tar.gz` and its `installer`, under a display (`xvfb-run -a` on a machine without one).

Nothing recorded changes the shell. Two findings for the desktop build: Electrobun's `frame` sets the page's height, title bar included, so a window meant to show 1280 × 800 of page needs a frame that is 32 points taller on macOS; and `Updater.applyUpdate()` asks `before-quit` for approval, so a handler that delays the quit to close a database must finish that work before the update is applied, or the update is silently cancelled.

The devkit checksums below are the v2.0.6 release indexes' values. On macOS arm64 this spike's own downloads confirmed all three (the Hutch archive hashed with `shasum -a 256`; the core and CEF archives as Hutch recorded them in `.hutch/dependencies.lock`). Windows x64 and Linux x64 are checked by the CI workflow; the other three keys are not checked by this spike.

## Decision table

| Question | Measured | Threshold | Outcome | Consequence |
|---|---|---|---|---|
| The app builds, starts and loads its page on macOS | `smoke.ts` exit 0 (`results/smoke-electrobun-darwin.json`) | must pass; a fail is the one trigger for the fallback | pass | `SHELL = "electrobun"`: plan 07 builds the desktop shell on Electrobun 2.0.6 with the devkit constants below. Had it failed: `SHELL = "electron"`, plan 07 runs its tasks that do not depend on the shell and defers its shell-dependent lanes |
| The app builds, installs, starts and loads its page on Windows | not run (CI) | pass | not run (CI) | none; by-hand check: install on that system, then run `smoke.ts` against the installed app. A fail would read "not supported in this release on that system, pending the owner" |
| The app builds, installs, starts and loads its page on Linux | not run (CI) | pass | not run (CI) | none; by-hand check: install on that system, then run `smoke.ts` against the installed app. A fail would read "not supported in this release on that system, pending the owner" |
| Cold start against Electron's (macOS) | ratio 2.99, interval 1.18–3.04; medians 756 ms and 253 ms | 1.5 (reference figure) | inconclusive | recorded; changes nothing |
| Idle memory (macOS) | Electrobun 576.0–581.1 MB, Electron 478.9–482.0 MB | none | recorded | recorded; changes nothing |
| Installer sizes (macOS) | Electrobun 152,601,920 bytes, Electron 161,669,039 bytes | ≤ 250 MB; hard fail > 400 MB | within budget | recorded; changes nothing |
| Typing latency (macOS) | Electrobun p50 2.5, p95 6.1, p99 15.6 ms; Electron p50 3.3, p95 9.7, p99 17.2 ms | none | recorded | recorded; changes nothing |
| Editing checks C1–C7 (macOS) | `not run`: windows 1280 × 832 and 1280 × 800; the seven values agree | the same in both shells | not run | recorded; changes nothing |
| User agent (macOS) | Electrobun `Chrome/156.0.0.0`, Electron `Chrome/156.0.8078.100 Electron/45.3.2` | — | recorded | recorded; changes nothing |
| Update path, macOS | applied, 10,031 ms, 148,267,769 bytes | — | recorded | recorded; changes nothing |
| Update path, Windows | not run (CI) | — | not run (CI) | recorded; changes nothing |
| Update path, Linux | not run (CI) | — | not run (CI) | recorded; changes nothing |
| Linux libraries `ldd` found missing | not run (CI) | — | not run (CI) | reported; plan 07 confirms its own list |
| Devkit `macos-arm64` | Hutch, core and CEF checksums: confirmed | the release index's values | confirmed | the values in the block below |
| Devkit `macos-x64` | not checked by this spike | the release index's values | not checked | the values in the block below |
| Devkit `linux-x64` | not run (CI) | the release index's values | not run (CI) | the values in the block below |
| Devkit `linux-arm64` | not checked by this spike | the release index's values | not checked | the values in the block below |
| Devkit `windows-x64` | not run (CI) | the release index's values | not run (CI) | the values in the block below |
| Devkit `windows-arm64` | not checked by this spike | the release index's values | not checked | the values in the block below |

```ts
SHELL = "electrobun"
ELECTROBUN_VERSION = "2.0.6"
HUTCH_VERSION = "0.29.0"
HUTCH_SHA256 = { "macos-arm64": "f081abca6d08d9d862577e77365f3cb5437e65858ca45a27173505e4e2345994", "macos-x64": "a8d0b5c9a330f02b9fe11222dadd1a4590f7d6f77e3f8f301fc9b5c360528b65", "linux-x64": "4aa3c5c7fa24898d8227b087dd393eb2a1463658f0d87e23a72cfe611af83b75", "linux-arm64": "9897e36548ef25c40cd8038ab1c5e35b561c603a6d8864b6563ad78d507e42db", "windows-x64": "5689e643748c6569f0d40e702300555ca08c93790fe69f4327797279b2a75213", "windows-arm64": "4d988c6f9d8268335b2d1743d78f62a34ff6a7f5ea40825bfa8e901f03fc9c97" }
ELECTROBUN_CORE_SHA256 = { "macos-arm64": "99813cdc64be5aa743b2d620dcf99e77f240dce53e01dc95aa3f9c7e00705d49", "macos-x64": "3344a37ad19fabfa0894187d16375ce619400ac38e7320b296c61bc94b06bdb1", "linux-x64": "06afade9cf1cf620a705b5fbbf7c09cd89719f04424453f7f302bcf52d1be1f0", "linux-arm64": "4f3e636565bfe97afc77cc0e0ae1ad37a26a25f410cd43c91b9a7b2cca63697d", "windows-x64": "2cea374ddea0c1ae52da5cc6e6f5c8b97844a49aad702330fffb0cdd705a772f", "windows-arm64": "1998239f19c0d447cbecd3c6e4b96ceb54fae685d0d08c7b2d13a9c82d1e9103" }
ELECTROBUN_CEF_SHA256 = { "macos-arm64": "aa04393159f57b598d44bc164da1662b530a91b382f60d5fd19691a2747b39ff", "macos-x64": "4439e2ce2a082071d0177c532f3fa76ec6381e823d4acae47738bda6367cc82a", "linux-x64": "b573038f55f6014c5faabdb1aaa6cb2243b20d63fc464033585a417ae59039c1", "linux-arm64": "ae2f74879aea9c274d8ea445b68ee75750b00a45121838efa6a2846d64d17b72", "windows-x64": "7f7db93262b9601521f47b702b776946e6e71895c3f8ec4d57bb4ab2d7686c32", "windows-arm64": "1d8286504afaf25216d8b7cb1e95a521162ee2e7820443156b5db2d606e0a991" }
```
