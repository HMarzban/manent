# Lessons

Mistakes and near-misses, newest first, each with the rule that now prevents it. Read the ones that touch your change before you start. Add one when a review finding or an incident shows a class of mistake, not a single slip.

Each lesson has a title, a date and four parts: what happened, how it was caught, the rule, and what enforces the rule. "Enforced by" names the check or test file in backticks, or begins "Nothing yet" and says what will. A lesson is not rewritten after it merges, except to fix a typo or to update "Enforced by" when a check arrives.

## Run headless Linux CEF smoke inside `dbus-run-session` with portals and keyring disabled to avoid 25 s D-Bus stalls

- Date: 2026-11-28

### What happened

Even after switching Linux `desktop:smoke` to a 24-bit Xvfb display and disabling GPU/Vulkan, `firstFrameMs` consistently stayed at `25.3–27.5 s` (`25,000 ms` plus normal startup), while `windows-2025` passed in `966 ms` and `macos-26` in `1,351 ms`. Under headless Xvfb on Ubuntu 24.04 without a live desktop session bus, GTK and Chromium synchronously wait for the hardcoded 25-second D-Bus timeout querying `org.freedesktop.portal.Desktop`, AT-SPI and GNOME Keyring/KWallet.

### How it was caught

By comparing `firstFrameMs` across three consecutive `desktop (ubuntu-24.04)` smoke runs (`25,368 ms`, `27,570 ms`, `26,462 ms`) against the GTK/D-Bus warnings printed at launch.

### Rule

Wrap headless Linux `desktop:smoke` in `dbus-run-session` with `GTK_USE_PORTAL=0` and `NO_AT_BRIDGE=1`, install `dbus`, and pass `"password-store": "basic"` in `apps/desktop/electrobun.config.ts` when `MANENT_CEF_DISABLE_GPU=1` is set.

### Enforced by

`.github/workflows/desktop.yml`, `apps/desktop/electrobun.config.ts`, and `tools/test/ci-workflow.test.ts`.

## Wait for Windows Task Scheduler binary swaps before reopening `MANENT_DATA_DIR`, and disable Linux Vulkan SwiftShader under CEF

- Date: 2026-11-28

### What happened

The third cross-platform `desktop` workflow run confirmed Windows built, installed, launched, synced and downloaded `0.0.2` cleanly, and Linux PSS dropped `idleRssBytes` from `1.17 GB` to `536.8 MB`, leaving two runtime quirks: (1) on Windows, Electrobun's `Updater.applyUpdate()` hands off to a Windows Task Scheduler job (`schtasks.exe /run`) whose clean session does not inherit `smoke.ts`'s temporary `MANENT_DATA_DIR`, so `smoke.ts` timed out waiting for `node.json` in the temp directory while `0.0.2` had already relaunched under `%APPDATA%\Manent`; and (2) on Linux (`ubuntu-24.04`), Electrobun preloads `libvk_swiftshader.so`, causing CEF GPU/SwiftShader helper processes to abort with `*** stack smashing detected ***` and stall `firstFrameMs` to `27.5 s` under Xvfb.

### How it was caught

By reading `windowsTaskPlan` in Electrobun's `updater_handoff.zig` alongside the `desktop (windows-2025)` and `desktop (ubuntu-24.04)` smoke logs.

### Rule

In Windows update smoke checks, wait for `Resources/version.json` inside the install root to reach the offered version, stop the Task-Scheduler-relaunched default-profile process, and relaunch the updated binary with `MANENT_DATA_DIR` so pending outbox sync is verified on the exact data folder. In `apps/desktop/electrobun.config.ts`, disable Vulkan on Linux CEF builds (`disable-vulkan` + `Vulkan` in `disable-features`) and allow `MANENT_CEF_DISABLE_GPU=1` for headless Linux Xvfb CI runs.

### Enforced by

`tools/desktop/smoke.ts`, `tools/test/desktop-installed-app.test.ts`, `apps/desktop/electrobun.config.ts`, and `.github/workflows/desktop.yml`.

## Drive Electrobun's Windows installer with `ELECTROBUN_INSTALLER_UI_AUTOCLOSE=1`, use 24-bit Xvfb + PSS on Linux smoke, and construct OS-native `file://` URLs in tests

- Date: 2026-11-28

### What happened

The second cross-platform GitHub Actions `desktop` and `ci` run uncovered three Windows/Linux harness defects after both platforms built cleanly: (1) `.github/workflows/desktop.yml`'s `Install (Windows)` passed `/S` and `--silent` to Electrobun's self-extractor (`Manent-Setup-canary.exe`), which expects no CLI flags and `ELECTROBUN_INSTALLER_UI_AUTOCLOSE=1` (leaving `MANENT_SMOKE_APP` empty); (2) Linux `desktop:smoke` passed every functional and live-update check (`saved`, `synced`, `secondInstanceDeferred`, `offlineSaved`, `updatedWithOutbox`, `noticesBeside`) but ran under `xvfb-run -a`'s default `640×480×8` paletted screen (triggering SwiftShader crashes and a 25 s first frame) while `ps -axo rss=` double-counted shared `libcef.so` mappings across all CEF helper processes (`1.17 GB`); and (3) `apps/desktop/test/url-scheme.test.ts` passed POSIX-only `file:///` paths without a drive letter to Node's `fileURLToPath`, which throws on Windows where absolute file URLs require a drive letter.

### How it was caught

By inspecting the `desktop (windows-2025)`, `desktop (ubuntu-24.04)` and `verify (windows-2025)` GitHub Actions logs alongside Electrobun's official `normal-installer.integration.test.mjs`.

### Rule

Run Electrobun's Windows setup executable with `ELECTROBUN_INSTALLER_UI_AUTOCLOSE=1` and no `/S`/`--silent` switches, fail loudly if `launcher.exe` is missing, and terminate any auto-launched instance before smoke begins. Run Linux `desktop:smoke` under a 24-bit `1440x940x24` Xvfb display and read Linux `/proc/<pid>/smaps_rollup` PSS in `tools/desktop/installed-app.ts` so shared `libcef.so` pages count once. Build `file://` URL test fixtures with `pathToFileURL` from OS-native absolute paths.

### Enforced by

`apps/desktop/test/url-scheme.test.ts`, `tools/test/desktop-installed-app.test.ts`, and `tools/test/ci-workflow.test.ts`.

## Keep Windows desktop PNG icons within `256 × 256` and install `libwebkit2gtk-4.1-0` on Linux Electrobun runners

- Date: 2026-11-28

### What happened

The first cross-platform GitHub Actions `desktop` run after unifying the Bound "M" icon set passed on `macos-26` (including full live `0.0.1 → 0.0.2` auto-update smoke) but failed on the other two platforms for two platform-specific Electrobun constraints: (1) `tools/desktop/generate-icons.ts` emitted `apps/desktop/assets/icon.png` at `512 × 512`, which Electrobun's `hutch` Windows `.ico` packager rejected with `invalid Windows PNG icon: PngTooLarge` (Windows ICO headers encode dimensions up to `256 × 256`); and (2) `ubuntu-24.04` built and installed both `0.0.1` and `0.0.2` cleanly but failed `desktop:smoke` at launch because `libNativeWrapper.so` dynamically links `libwebkit2gtk-4.1.so.0`, `libsoup-3.0.so.0` and `libjavascriptcoregtk-4.1.so.0` even when `defaultRenderer: "cef"` is configured.

### How it was caught

By running `.github/workflows/desktop.yml` across `macos-26`, `windows-2025` and `ubuntu-24.04` and inspecting the `windows-2025` build log and `ubuntu-24.04` smoke log.

### Rule

Keep `apps/desktop/assets/icon.png` at `256 × 256` (`ASSET_ICON_SIZE = 256`) so Windows `.ico` embedding always succeeds, and install `libwebkit2gtk-4.1-0` alongside `libgtk-3-0` and `libayatana-appindicator3-1` in Linux CI workflows and release notes whenever Electrobun's native launcher runs.

### Enforced by

`apps/desktop/test/icons.test.ts` and `tools/test/ci-workflow.test.ts`.

## Keep custom `.mn-table` rows on the shared `px-3` rail, budget fixed columns below each `@container` breakpoint, and never style status cells via `span:last-child`

- Date: 2026-11-28

### What happened

Reviewing the Library's Series, Projects, Continue and Rundowns tables with side panels open surfaced four compounding CSS layout defects: (1) refactoring `EpisodeRow` onto a custom `.mn-row` div omitted `flex` and `px-3`, leaving episode numbers and status labels flush against the card border and shifted relative to `.mn-table-head`; (2) fixed `shrink-0` episode columns revealed at `@2xl` (`672 px`) summed to `828 px`, crushing `flex-1` `Title` to `0 px` so `TITLE` painted over `WRITER` and the locked-pages icon collided with the writer avatar; (3) `PagesCell` switched `.mn-num` (`justify-content: flex-end`) to `flex-col` without `items-end`, left-aligning numeric page counts while `PAGES` and `—` rows stayed right-aligned; and (4) `PLACE_COLUMN` targeted `.mn-row > span:last-child`, which hit `Row`'s trailing `[data-menu-spacer]` whenever a row carried a menu (widening the menu spacer to `168 px` and shifting `PlainTable` columns out of alignment with its header, which also lacked a trailing `w-6` spacer).

### How it was caught

Reported by the project owner with a dark-mode screenshot of the Library's Series tables with the Tour panel open, then audited across every `.mn-table` view and confirmed with real-browser bounding-box measurements in Chromium, Firefox and WebKit.

### Rule

Every custom `.mn-row` inside `.mn-table` must carry `flex` and `px-3` matching `.mn-table-head`, and the sum of fixed column widths, padding and gaps enabled at any `@container` breakpoint must leave comfortable width for the `flex-1` primary column (at least `120 px` on desktop and `90 px` on narrow mobile), with `truncate` on flex-1 header labels. Whenever a `.mn-num` cell stacks content vertically with `flex-col`, pair it with `items-end` so numbers and bars stay on the same right rail as the header and `—` placeholders. Target status cells on `Row` explicitly via `[data-trailing]` and `[data-unavailable]` (never `span:last-child`), and reserve a matching trailing `w-6` spacer in `.mn-table-head` (and `PLACE_MENU_OFFSET` on unavailable rows) whenever sibling rows render a row menu.

### Enforced by

`packages/ui/src/components/row/row.tsx`, `apps/web/src/screens/library/row-place.tsx`, `apps/web/src/screens/library/project-list.tsx`, `apps/web/src/screens/library/project-row.tsx`, `apps/web/src/screens/library/series/episode-cells.tsx`, `apps/web/src/screens/library/series/episode-row.tsx`, `apps/web/src/screens/library/series/season-section.tsx`, `packages/ui/test/row.dom.test.tsx`, `apps/web/test/series-overview.dom.test.tsx`, `apps/web/test/library.dom.test.tsx`, and `e2e/series/episode-table.e2e.ts`.

## Persist desktop-wide preferences in `local-node` rather than `localStorage` alone, and shield local workspaces from demo resets

- Date: 2026-11-28

### What happened

During the architectural audit for Clean workspace mode (ADR 0090), two non-obvious failure modes surfaced across Web and Desktop: (1) Desktop binds `local-node` to `127.0.0.1:0` (an ephemeral loopback port per launch), so any WebView `localStorage`-only preference is lost on every Desktop restart; and (2) both Web (`followDemoSeed` in `device-trust.ts`) and Desktop (`createReseed` in `packages/local-node/src/node/reseed.ts`) wiped local storage whenever a remote demo server's `seedId` changed — which would have destroyed local-only scripts written by `You` after leaving Demo mode.

### How it was caught

Caught during the pre-implementation Head of Engineering and Senior Staff Engineer architecture review of `apps/desktop/src/shell/main.ts`, `packages/local-node/src/node/reseed.ts`, and `apps/web/src/services/sync/device-trust.ts`.

### Rule

Any preference that must survive Desktop restarts belongs in `local-node`'s `records.sqlite` (with a local route behind `createLaunchGuard` and frame-0 injection in `bootScript`) alongside `localStorage` for Web/PWA. Whenever a writer dismisses Demo mode to work locally, gate both Web `followSeed` and Desktop `createReseed` / `resumeCloudPeople` so a remote demo seed change can never wipe local user scripts.

### Enforced by

`packages/local-node/src/records/open.ts`, `packages/local-node/src/http/boot-script.ts`, `packages/local-node/src/http/local-routes.ts`, `packages/local-node/src/node/reseed.ts`, `apps/web/src/services/sync/device-trust.ts`, `packages/local-node/test/clean-workspace.test.ts`, and `apps/web/test/clean-workspace.dom.test.tsx`.

## Mount required UI providers inside standalone routes, avoid negative margins under `overflow-auto`, and close SSE streams on node shutdown

- Date: 2026-11-28

### What happened

Building the bespoke `/about` desktop window and running the packaged macOS `desktop:smoke` gate uncovered three subtle cross-layer pitfalls: (1) `/about` bypassed `<AppShell>` in `RootLayout`, so `<AboutScreen />`'s `<BusyButton />` threw at runtime for a missing `<TimingProvider>` while `about-screen.dom.test.tsx` had masked the error by wrapping `<TimingProvider>` around the screen in the test harness; (2) applying `-mt-2` inside `<main className="... overflow-auto">` clipped the top 8 px of the About icon tile's rounded border; and (3) `/api/local/shell/events` `EventStream` instances had no `close()` method wired into `NodeCore.close()`, leaving open SSE streams and heartbeat timers alive during shutdown until Electrobun's shutdown timeout fired.

### How it was caught

Items (1) and (2) were caught immediately by live visual review of **Manent → About Manent** in `Manent-dev.app`, and item (3) was caught by running `bun run desktop:smoke` and inspecting surviving `Manent-canary.app` processes after `SIGINT`.

### Rule

Any standalone route rendered outside `<AppShell>` must mount the UI providers it depends on (such as `<TimingProvider>`) directly inside the screen, and its DOM tests must render the screen standalone without extra test-only provider wrappers. Never pull top content with negative margins inside an `overflow-auto` container; adjust container padding and window frame height instead. Always expose `close()` on server-side `EventStream` / `ShellChannel` instances and close every open stream and heartbeat timer inside `NodeCore.close()`.

### Enforced by

`apps/web/src/screens/about/about-screen.tsx`, `apps/web/test/about-screen.dom.test.tsx`, `apps/desktop/src/shell/about-window.ts`, `apps/desktop/test/about-window.test.ts`, `packages/local-node/src/http/sse.ts`, `packages/local-node/src/http/shell-channel.ts`, and `packages/local-node/test/shell-channel.test.ts`.

## Never scan all documents, reload CRDTs or write per-keystroke durability transactions inside sync commit hooks, and guard background search catch-up against damaged files

- Date: 2026-11-28

### What happened

Diagnosing the `D-small` benchmark failures in `rundown.w4`, `server.persistence` and `server.power-loss` uncovered five compounding server hot-path and recovery bugs: (1) `StoryLinks.ensureHome()` called `directory.documentsIn(home)` across all 4,021 project documents on startup and on every commit hook (two instances × 8,042 SQLite queries); (2) `prompter/auto-send.ts` reloaded both rundown and story CRDTs from SQLite and queued `syncRowStates` on every keystroke even when no row had ever been sent to the prompter; (3) `sharing/service.ts:committed` ran a `FULL`-durability `control.sqlite` `markActive` transaction on every keystroke, while `rundown/durations.ts` fired one separate `authorityWrite(rundownId)` per dirty story instead of coalescing per rundown; (4) `measureDoc` materialised the entire ProseMirror JSON tree and called `encodeState()` a second time on the checkpoint worker (`103.4 ms` on a 12,000-block script); and (5) an uncaught `SQLiteError: database disk image is malformed` inside `search/service.ts:stepCatchUp` crashed the server during `server.power-loss` recovery. Additionally, `bench/tiers/orchestrate.ts` caches Docker tier images by `sha256(bun.lock + commit)`, so benchmarking uncommitted edits requires removing the cached `manent-bench:<hash>` image first.

### How it was caught

By profiling `rundown.w4` and `server.persistence` directly inside a 1-core `D-small` Docker container (`--cpus=1 --memory=1g`), inspecting the `server.power-loss` failure in `docs/benchmark/runs/2026-11-27T11-06-09Z-D-small-1x.json`, and isolating SQLite `PRAGMA synchronous = FULL` tail latency on Docker-for-Mac virtual disks.

### Rule

Keep `SyncHooks.committed` O(1) on the hot path: filter directory scans by kind via `directory.documentsIn(home, kind)` (backed by `doc_directory_by_home_kind`), cache rundown link/snapshot views by `(generation, headSeq)` and check cheap database flags (`file.prompter.latest`) before loading any CRDT from storage, coalesce multi-story duration writes into one `authorityWrite` per rundown, and throttle best-effort metadata writes (`markActive`) to bounded intervals. On the checkpoint worker, reuse a tiny warm CRDT LRU, pass pre-encoded `liveBytes` into a direct Yjs XML tree walk in `measureDoc`, compress checkpoints with level-1 `deflateRawSync`, and wrap every derived background indexer step (`stepCatchUp`, `triggerCatchUp`, `refreshRoom`) in `try/catch` so a damaged cache or project file never terminates the server.

### Enforced by

`packages/storage/test/schema-golden.test.ts`, `packages/storage/test/queries.test.ts`, `packages/storage/test/checkpoints.test.ts`, `packages/crdt/test/measure.test.ts`, `packages/server-core/test/checkpointer.test.ts`, `packages/server-core/test/rundown-guards.test.ts`, `packages/server-core/test/search-caching.test.ts`, and `packages/server-core/test/sharing.test.ts`.

## Gate HTTP CloudApi calls in offline mode, flush SSE headers on stream open, and wake offline-created scripts on reconnect

- Date: 2026-11-28

### What happened

Auditing `packages/local-node` for zero-server and no-internet desktop reliability surfaced three silent offline gaps: (1) `POST /api/local/connection { mode: "offline" }` muted upstream WebSockets (`setOnline(false)`) but left HTTP `CloudApi` calls (`signIn`, `adopt`, `describe`, `demo`, `forward`) hitting the live network without a timeout; (2) `/api/local/shell/events` wrote zero bytes on connect, causing `Bun.serve` to buffer SSE response headers until `idleTimeout` closed the connection with `ECONNRESET` before the first 30 s heartbeat; and (3) a registered user who chose their person or created a script while offline (`cloudToken === null`) stayed stuck without retrying cloud sign-in or adoption once reachability returned.

### How it was caught

Caught by auditing every HTTP/WS code path in `packages/local-node/src/` and exercising a live `serveWithBun` local-node against both a dead loopback port and a toggled cloud server in `packages/local-node/test/offline-resilience.test.ts`.

### Rule

Wrap every `CloudApi` consumer in `createCloudStatus` so `"offline"` mode immediately refuses HTTP cloud calls with `ConnectError("unreachable")` and every remote HTTP fetch uses a bounded `AbortController` timeout (`fetchWithTimeout`). Flush an initial `cloud_state` SSE event immediately in `createShellChannel`'s `onOpen` hook so Bun commits response headers right away, and run `recover()` whenever cloud reachability returns so offline-chosen users re-authenticate, upstream sync wakes up, and offline-created documents hand off automatically.

### Enforced by

`packages/local-node/src/node/cloud-status.ts`, `packages/local-node/src/http/shell-channel.ts`, `packages/local-node/src/upstream/cloud-requests.ts`, `packages/local-node/src/node/core.ts`, and `packages/local-node/test/offline-resilience.test.ts`.

## Keep Book front matter additive on `titlePage`, gate blank-page keys and theme CSS, and settle DOM selections in Firefox/WebKit E2E

- Date: 2026-11-28

### What happened

During Book Phase 3 (cover/front/back matter, Engine 3 recto chapters, Markdown, Book checks and multi-part compile), four subtle cross-layer issues surfaced: (1) appending `:${side}` unconditionally to every `BreakSpec` key broke `pagination-decorations.test.ts` on standard non-blank breaks, whereas only blank verso breaks (`side === -2`) need a `:blank` key suffix; (2) adding `rgb(...)` shadow/border values inside `packages/editor/src/front-pages/front-css.ts` violated `tools/test/colours.test.ts` (`colour-outside-theme`); (3) adding `"On chapter opening pages too"` unconditionally to `HeaderFooterRow` leaked a manuscript-only control into Screenplay `Script settings` (`document-panels.dom.test.tsx`); and (4) running `e2e/interface/book-format-bar.e2e.ts` sequentially across `chromium`, `firefox`, `webkit` and `tour` against one shared live demo server revealed that Firefox/WebKit need two animation frames after programmatic `Selection` updates for ProseMirror's DOM observer to publish updated toolbar facts, and shared-document E2E tests must guard toggle state rather than assuming untouched initial defaults.

### How it was caught

Items (1)–(3) were caught by `bun run verify` (`pagination-decorations.test.ts`, `colours.test.ts`, `document-panels.dom.test.tsx`), and item (4) was caught by running `book-format-bar.e2e.ts` and `write-book-publishing.e2e.ts` sequentially across `--project=chromium --project=firefox --project=webkit --project=tour`.

### Rule

Keep new book-specific document metadata additive on existing CRDT maps (`TITLE_PAGE_MAP` via `bookMatter(doc)`) whenever a schema bump is unnecessary, suffix `BreakSpec` keys only for new special cases (`side === -2` → `:blank`), use strictly theme CSS custom properties (`var(--elev-page)`, `var(--page-edge)`) in editor stylesheets, gate manuscript-only setting rows on `store.get("script.format") === "manuscript"`, and in multi-browser Playwright specs wait two animation frames after programmatic DOM selection changes while making toggle/annotation assertions idempotent across shared demo runs.

### Enforced by

`packages/crdt/test/book-matter.test.ts`, `packages/editor/test/pagination-decorations.test.ts`, `tools/test/colours.test.ts`, `apps/web/test/document-panels.dom.test.tsx`, `e2e/interface/book-format-bar.e2e.ts`, and `e2e/tour/write-book-publishing.e2e.ts`.

## Lock the app viewport to `100%` and make every scroll container `relative` with `overscroll-contain` so `.sr-only` labels never scroll the shell

- Date: 2026-11-28

### What happened

On tall settings screens such as Project settings (`Format and style`) and Preferences, fast trackpad or wheel scrolling scrolled the entire app shell upward off the top of the viewport, lifting the bottom status bar (`Commands ⌘K`) into the middle of the screen over an empty dark area. Two factors combined: (1) `SettingRow` and `TitlePageRow` render `position: absolute` `.sr-only` elements inside scrollable containers (`SettingsShell`'s `<main>`, `ScreenArea`) whose ancestors all had `position: static`, so those elements took the initial containing block (`<html>`) as their containing block and inflated `document.documentElement.scrollHeight` past `2,000 px` even though `AppShell` was `h-dvh`; and (2) `AppShell` only clipped horizontally (`overflow-x-clip`), `html` and `body` had `overflow: visible` and `overscroll-behavior: auto`, and inner scroll regions lacked `overscroll-contain`, so fast scroll momentum chained out of `<main>` straight into `window.scrollY` and macOS elastic overscroll.

### How it was caught

By live user report with a screenshot of Project settings (`section=format_style`), reproduced directly in Chromium where `document.documentElement.scrollHeight` measured `2,052 px` against an `800 px` viewport and a fast wheel gesture moved `window.scrollY` to `1,252 px` and pushed `[data-region="status_bar"]` to `top: -480 px`.

### Rule

Keep `html`, `body` and `#root` locked to the viewport (`height: 100%; width: 100%; overflow: hidden; overscroll-behavior: none`) in `packages/ui/src/theme.css`, restoring `height: auto; width: auto; overflow: visible` inside `@media print`. Keep `AppShell` and `RootLayout`'s non-shell frame at `relative h-dvh w-full overflow-hidden overscroll-none`, and give every scrollable pane (`ScreenArea`, `ShellPage`, `SettingsShell`, `PanelTabs`, `VirtualRows`, `EditableGrid`, `SendLayout`, `History`, `ReaderPage`) and every component hosting `.sr-only` controls (`SettingRow`) explicit `relative` positioning and `overscroll-contain` so absolutely positioned screen-reader labels stay inside their scroll container and wheel momentum never scrolls the outer shell.

### Enforced by

`packages/ui/src/theme.css`, `apps/web/src/shell/app-shell.tsx`, `apps/web/src/root-layout.tsx`, `apps/web/src/settings-shell/settings-shell.tsx`, `packages/ui/src/settings-react/setting-row.tsx`, `docs/development/design-system.md`, `apps/web/test/shell-narrow.test.ts`, `apps/web/test/settings-unify.dom.test.tsx`, and `e2e/interface/preferences.e2e.ts`.

## Keep editor-only helpers off the command-context entry path, send canonical user homes on desktop adopt, and guard Windows tar/hotkeys in CI

- Date: 2026-11-28

### What happened

Three subtle cross-layer regressions surfaced during integration and cross-platform CI auditing: (1) adding `driverCommandContext` to `apps/web/src/services/command-context.ts` imported `room/pitch.ts`, which statically imported `remoteCursorsOf` from `editor-host/margin-people.ts` (`@manent/editor`), pulling ProseMirror and the entire editor bundle into the entry, document and palette chunks; (2) `packages/local-node/src/node/core.ts` wrote `home: "user:<id>"` instead of canonical `"user"` when snapshotting private indexes and listed scripts ahead of index documents during handoff, deadlocking `POST /api/docs/adopt` during first-run desktop sign-in (`desktop-first-script`); and (3) on Windows and Linux CI, MSYS GNU `tar` parsed `D:\...` absolute archive paths as remote hosts (`D:`), `bash -eo pipefail` exited on non-ELF `ldd` checks, and E2E tests called `pressKeyOf(..., "view.leftPanel" | "view.sidePanel")` for commands that intentionally carry no default shortcut on Linux or Windows.

### How it was caught

Item (1) was caught immediately by `apps/web/test/build.test.ts` on the combined merge; item (2) was caught by running `e2e/tour/desktop-first-script.e2e.ts` against `--project=tour-desktop`; and item (3) was caught by inspecting GitHub Actions logs across `windows-2025` and `ubuntu-24.04` runners.

### Rule

Never import a module that value-imports `@manent/editor` (such as `editor-host/margin-people.ts`) from `services/` or `room/` modules reached by the entry chunk: expose lazy runtime readers on the zero-editor-import `LiveEditor` interface (`editor-host/live-editor.ts`) and populate them inside `connect-editor.ts`. In `packages/local-node`, always send canonical `home: "user"` for private snapshots and order index documents ahead of regular documents during first-sync handoff. For cross-platform CI, run `tar` from the archive's parent directory with relative filenames on Windows, guard optional `ldd` probes with `|| true`, and drive panels in cross-platform E2E tests via palette/UI controls rather than macOS-only default shortcuts.

### Enforced by

`apps/web/src/editor-host/live-editor.ts`, `apps/web/src/editor-host/connect-editor.ts`, `apps/web/test/build.test.ts`, `packages/local-node/test/core.test.ts`, `e2e/tour/desktop-first-script.e2e.ts`, `tools/test/desktop-devkit.test.ts`, `.github/workflows/desktop.yml`, and `e2e/support/interface.ts`.

## Keep proportional book fonts, non-inclusive inline marks and format-scoped engines isolated from v1/v2 invariants

- Date: 2026-11-28

### What happened

During Book Phase 2 (Schema v5 craft elements, pure-TS EPUB 3, DOCX round-trip and opt-in Layout Engine 3), four cross-layer subtleties surfaced: (1) `fontkit@2.0.4` threw a `RangeError` inside `_getCBox` on empty-contour whitespace codepoints (`U+2002`, `U+2009`, `U+200B`) when generating build-time FUnit advance tables from `@fontsource/source-serif-4`; (2) because the inline `footnote` mark is `inclusive: false` (so typing after a footnoted word does not extend the note), reading only `$from.marks()` missed a footnote when the caret sat immediately at its right edge; (3) upgrading `LayoutEngineRow` to offer `ENGINE_VERSIONS.at(-1)` (`3`) globally would have changed the screenplay `write-layout-engine` Tour scenario (which expects Engine 2 on screenplays); and (4) `section-height.ts`, `drift.ts`, `graphic-height.ts` and `sheet-sync.ts` assumed fixed `LINE_PX = 16` / `UNIT_PX = 8`, which would mis-measure Engine 3's `20 px` (`15 pt`) book leading.

### How it was caught

Item (1) surfaced when running `bun tools/unicode/generate-tables.ts`; item (2) was caught by unit tests in `packages/editor/test/book-authoring.test.ts`; item (3) was caught by auditing `packages/demo/src/tour/scenarios/write/write-layout-engine.ts` before changing `LayoutEngineRow`; and item (4) was caught during the Engine 3 editor-geometry audit across `packages/editor/src/pagination/`.

### Rule

When generating font metric tables with `fontkit`, guard each glyph lookup (`glyphForCodePoint(cp).advanceWidth`) in a `try/catch` so empty-contour glyphs are skipped cleanly and never break runtime PDFKit embedding. For any `inclusive: false` inline mark whose popover edits the mark at a collapsed caret, check `$from.nodeBefore.marks` when `$from.marks()` lacks the mark (and never set `inclusive: true`). Scope format-specific layout engines through `latestEngineForFormat(format)` rather than `ENGINE_VERSIONS.at(-1)`, and read dynamic line/unit screen metrics through `linePxOf(profile)` / `unitPxOf(profile)` across `section-height.ts`, `drift.ts`, `graphic-height.ts` and `sheet-sync.ts`.

### Enforced by

`tools/unicode/generate-tables.ts`, `packages/pagination/src/engines/registry.ts`, `packages/pagination/test/v3-book-publishing.test.ts`, `packages/editor/test/book-authoring.test.ts`, `packages/formats/test/pdf.test.ts`, and `e2e/interface/book-format-bar.e2e.ts`.

## Never clobber `dom.className` in a ProseMirror NodeView, guard Base UI floating controls against stealing focus, and keep writing-mode pills at full AA contrast

- Date: 2026-11-28

### What happened

During the floating Book Format Bar rollout on _The Salt Almanac_, four distinct defects surfaced in live browser verification: (1) `blockNodeView`'s `syncPlainBlockAttrs` assigned `dom.className = "el el-..."` on every block update, permanently wiping ProseMirror's outer `Decoration.node` classes (`.pg-first`, `.dual-l`, `.dual-r`, `.lb-forced`, `.el-hidden`) because `patchAttributes` skips re-applying classes whose decoration value did not change — collapsing Chapter `dropLines: 18` top padding by `272 px` and sending following prose across `.mn-sheet` gaps; (2) Base UI `PopoverContent` renders `role="dialog"` (causing `focusKind() === "dialog"` and silently short-circuiting `commands.run(...)` to `"passed"`), while `DropdownMenu` and `Popover` popups stole focus from `.ProseMirror` on pointer clicks so the caret and highlighted selection disappeared; (3) an uncaptioned inline `graphic` block still rendered ProseMirror's `<br class="ProseMirror-trailingBreak">` inside `.mn-graphic-caption`, adding `+1 line` (`16 px`) of DOM height relative to `measure.ts`; and (4) `.mn-book-pill[data-writing="true"]` dimmed the floating pill to `opacity: 0.38`, failing WCAG 2.2 AA `color-contrast` (`3.16:1`) in Chromium axe scans.

### How it was caught

Items (1) and (2) were caught by live visual testing of the Book Format Bar on _The Salt Almanac_ (highlighting a phrase in Chapter 2 and clicking toolbar styles) and an audit of `node-view.ts`, `prosemirror-view`, Base UI `MenuPopup`/`PopoverPopup`, and `menu-focus.ts`; item (3) was caught by comparing DOM heights of uncaptioned graphics against `measure.ts`; item (4) was caught directly by `@axe-core/playwright` in `e2e/interface/book-format-bar.e2e.ts`.

### Rule

In any ProseMirror `NodeView`, mutate only the element's own classes with `classList.add`/`classList.remove` (never assign `dom.className = ...`) so outer decoration classes survive updates, collapse trailing-break-only empty captions (`.mn-graphic-caption:has(> br.ProseMirror-trailingBreak:only-child)`) to zero line-height, and keep every schema-rendered block attribute (`data-first-line`) synced in the NodeView whenever it overrides `toDOM`. On editor-adjacent floating toolbars, popovers and dropdown menus, prevent focus loss on pointer `mousedown` (except on text inputs) via `keepEditorFocus`, pass `initialFocus={false}` (on popovers) and `finalFocus={false}`, restore focus to `.ProseMirror` (`dom.focusPage()`) on non-outside close, and dispatch editor actions directly from popover controls instead of routing through keyboard-guarded `commands.run(...)`. For `[data-writing="true"]` floating chrome, settle onto `--bg-chrome` with `box-shadow: none` (never fractional `opacity`, and never transitioning `box-shadow`) so WCAG 2.2 AA text contrast and Manent's motion rule hold in every state.

### Enforced by

`packages/editor/src/graphics/node-view.ts`, `packages/ui/src/theme.css`, `apps/web/src/screens/document/book-toolbar/keep-editor-focus.ts`, `packages/editor/test/graphics-editor.dom.test.ts`, `apps/web/test/book-toolbar.dom.test.tsx`, `tools/test/ui-rules.test.ts`, and `e2e/interface/book-format-bar.e2e.ts`.

## Seed aged multi-session benchmarks directly into storage, cache aged corpora and exclude Base UI focus guards in WebKit axe scans

- Date: 2026-11-27

### What happened

Two cross-tier and cross-browser harness bugs surfaced while triaging failing benchmark runs and running three-browser Playwright verification: (1) `bench/client/locked/locked-120.bench.ts` created a script with `bot.client.create` and pushed an aged 400-session state (`401` distinct Yjs client IDs) over a single WebSocket `SUBSCRIBE`, which exceeded `DEFAULT_LIMITS.clientIdsPerSubscribe` (`256`) in `packages/server-core/src/sync/subscribe.ts` and hung until the 180 s sync timeout across `D-modest`, `D-typical` and `host`, while `bench/server/rebuild-stall.bench.ts` rebuilt an uncached 2,000-page / 60,000-edit aged corpus on every process; and (2) `e2e/interface/demo-stage.e2e.ts` ran `@axe-core/playwright` over an open Base UI `<Popover>` without excluding `[data-base-ui-focus-guard]`, which passed in Chromium and Firefox but failed in WebKit on Base UI's invisible Safari focus-guard `<span role="button">` sentinel.

### How it was caught

Item (1) was caught by inspecting the `could not finish` entries in `docs/benchmark/report.md`, reproducing the hang in `--tier host --quick --filter locked-120`, and matching the aged document's 401 client IDs against `clientIdsPerSubscribe`; item (2) was caught immediately by running `e2e/interface/demo-stage.e2e.ts` against `--project=firefox --project=webkit`.

### Rule

Never push an aged CRDT document with more than `DEFAULT_LIMITS.clientIdsPerSubscribe` (`256`) client IDs through a single client WebSocket `SUBSCRIBE` in a benchmark or test harness: create the document via `POST /api/docs` and append the aged state into SQLite storage during `whileStopped` (mirroring `shareScript` in `bench/server/support.ts`), and wrap expensive `ageScript(...)` builds in `cached(...)` from `bench/corpus/cache.ts`. In every Playwright `@axe-core/playwright` audit that opens a Base UI `<Popover>` or `<Dialog>`, chain `.exclude("[data-base-ui-focus-guard]")` and verify on WebKit as well as Chromium and Firefox.

### Enforced by

`bench/client/locked/locked-120.bench.ts`, `bench/server/rebuild-stall.bench.ts`, `bench/test/aged-cache.test.ts`, `e2e/interface/demo-stage.e2e.ts`, and `packages/server-core/src/sync/subscribe.ts`.

## Keep `<dl>` groups single-depth, avoid dimming chrome below AA contrast, emit `aria-pressed` on button rows and keep raw benchmark runs unformatted

- Date: 2026-11-27

### What happened

Four distinct accessibility and release-hygiene defects surfaced during the authoring/production polish, cross-browser WCAG 2.2 AA audit and benchmark publication pass: (1) `NumbersCast` wrapped `<dt>` and `<dd>` inside two nested `<div>` elements under `<dl>`, triggering serious `dlitem` (WCAG 1.3.1) violations; (2) `.mn-bar[data-writing="true"]` dimmed the Demo Stage bar to `opacity: 0.54` while writing, dropping `var(--fg-muted)` labels and controls to `2.4:1`–`3.37:1` contrast (WCAG 1.4.3); (3) `<Row selected onActivate={...}>` emitted `aria-selected="true"` on `role="button"` (disallowed by ARIA 1.2) and `PagesTab` mounted `<RenumberField>` inside `<Row onActivate>` (nesting an `<input>` inside `role="button"`); and (4) publishing raw unedited benchmark JSON files under `docs/benchmark/runs/` would fail `bun run format:check` unless excluded in `.prettierignore`, while relative `runs/*.json` links inside `/benchmark-report.html` 404ed until `apps/web/build.ts` copied them beside the HTML report.

### How it was caught

Items (1) and (2) were caught directly by running `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) in `e2e/interface/surfaces-a11y.e2e.ts` across Light and Dark schemes; item (3) was caught during the Production Revisions Staff Adviser audit; and item (4) was caught during the Benchmark & Report pipeline audit before running `bun run bench publish`.

### Rule

Keep `<dl>` children strictly `<dt>`/`<dd>` or a single `<div>` grouping `<dt>`/`<dd>` (use CSS grid on the single wrapper `<div>` rather than nested flex wrappers). Never dim entire toolbars with fractional `opacity` while visible text sits inside them — quiet the chrome with a subtle border token instead so WCAG 1.4.3 contrast holds in every state. On `<Row>`, emit `aria-pressed="true"` + `data-selected="true"` (not `aria-selected="true"`) whenever `effectiveRole === "button"`, and pass `onActivate={undefined}` whenever an inline editing `<Input>` renders inside a row. Keep `docs/benchmark/runs/` in `.prettierignore` so published raw JSON remains unedited, and copy `docs/benchmark/runs/*.json` into `outDir/runs/` during `buildWeb()`.

### Enforced by

`apps/web/src/screens/document/numbers-cast.tsx`, `packages/ui/src/theme.css`, `packages/ui/src/components/row/row.tsx`, `apps/web/src/production/pages-tab.tsx`, `apps/web/test/production-sync-maturity.dom.test.tsx`, `e2e/interface/surfaces-a11y.e2e.ts`, `.prettierignore`, and `apps/web/build.ts`.

## Accept null docKind on local scripts, avoid opacity over fg-muted, exclude page totals from place search and isolate E2E builds

- Date: 2026-11-27

### What happened

During Smart Command Palette Phases 2 and 3, four subtle classes of defect surfaced in live cross-browser Playwright and `@axe-core/playwright` runs: (1) `doc.linesPerPage` checked `ctx.docKind === "script"`, hiding the command on local or unindexed scripts (such as a fresh `You` script) where `ctx.docKind` is `null`; (2) `.mn-palette-kbd` applied `opacity: 0.78` on top of `var(--fg-muted)`, which pulled light-mode contrast down to `4.11:1` (below WCAG 1.4.3's `4.5:1` floor); (3) `createPlaceSource` matched queries against each page's full display string (`"Page N of M"`), so typing `"page 12"` in a 12-page script matched every page from Page 1 to Page 12 via `"of 12"`, while `"scene 4"` missed `"Sc. 4 · …"`; and (4) running Playwright against the shared `apps/web/dist` directory allowed concurrent non-test builds to overwrite the test-flavour sync hooks, while calling `emulateMedia({ colorScheme: "light" })` without reloading caused `transition-colors` to report mid-blend grey text during immediate axe contrast scans.

### How it was caught

Item (1) was caught by Chromium/Firefox live E2E (`e2e/interface/smart-palette.e2e.ts`); item (2) and the mid-transition contrast reading were caught by light-mode `@axe-core/playwright` WCAG 2.2 AA scans across Chromium, Firefox and WebKit; item (3) was caught during Phase 3 query auditing and locked in `apps/web/test/palette-phase3.test.ts`; and item (4) surfaced when a parallel session built `apps/web/dist` during a three-browser Playwright run.

### Rule

For script-only commands that should work on local/unindexed scripts too, guard visibility with `ctx.docKind === null || ctx.docKind === "script"` (or `ctx.docKind !== "rundown"`), never `ctx.docKind === "script"` alone. Never stack fractional `opacity` on top of `var(--fg-muted)` text — keep full opacity and shift from `color: var(--fg-muted)` to `color: var(--fg)` on hover/highlight so WCAG 1.4.3 contrast holds in every Light and Dark theme. Match page place rows against `["page <label>", "p <label>", "<label>"]` (excluding `"of <total>"`) and scene rows against `[label, "scene <n>", "sc <n>"]` with word-boundary prefix priority in `rankRows`. When running targeted Playwright tests alongside other builds, isolate `MANENT_WEB_DIR` and `MANENT_E2E_PORT`, and set `emulateMedia` before `page.reload()` prior to full-page axe contrast audits.

### Enforced by

`packages/commands/src/definitions/document.ts`, `packages/ui/src/theme.css`, `packages/ui/src/palette/palette-rank.ts`, `apps/web/src/shell/palette-places.ts`, `apps/web/test/palette-phase3.test.ts`, `packages/ui/test/palette.dom.test.tsx`, `e2e/interface/smart-palette.e2e.ts` and `docs/development/testing.md`.

## Place pure format walkers in `@manent/schema` and keep contextual Play chrome aligned across playable formats

- Date: 2026-11-27

### What happened

Game Script (`script.format = "game"`) is the default format for a new Game project and colours `*`/`**` choices, `-` gathers, `#set` flags and `{condition}` gates on the page, yet `ink.play` and `InkPlayButton` were gated strictly to `format === "ink"`, leaving Game Script writers with no Play button beside **History**. While unifying playback across `game` and `ink`, two build and design-system constraints mattered immediately: (1) `apps/web/test/build.test.ts` marks `packages/formats/` as an on-demand heavy boundary (because it bundles `pdfkit`, `inkjs` and `pdfjs-dist`), so statically importing a Game Script walker from `@manent/formats` in the document screen's Beside registry would bloat eager chunks; and (2) combining the Game Script parser, evaluator and walker (or the Beside player and its toolbar/rows) into single files exceeded `tools/test/size.test.ts`'s 400-line ceiling.

### How it was caught

The missing Play button was caught by live user review on _Twelve on Foot — Chapter 1: Fog Bell_; the `packages/formats/` chunk boundary was caught by inspecting `apps/web/test/build.test.ts` before wiring; and the 400-line ceiling was caught immediately by `tools/test/size.test.ts`.

### Rule

When two formats share syntax that signals the same writer action (such as branching choices on `game` and `ink`), unify the contextual title-bar button, command IDs and Command Palette recommendations across both formats rather than stranding one behind a format check—while dispatching to each format's own appropriate engine. Keep pure, zero-dependency document walkers in `@manent/schema` (alongside `classifyLine` and `prompterBlocks`) so `apps/web` never statically imports `@manent/formats` or `@manent/editor` into eager screen chunks, and split parser, evaluator, toolbar and row modules cleanly below 400 lines.

### Enforced by

`packages/schema/test/game-playthrough.test.ts`, `packages/commands/test/recommend.test.ts`, `apps/web/test/game-player.dom.test.tsx`, `apps/web/test/title-bar-contextual.dom.test.tsx`, `apps/web/test/build.test.ts`, `tools/test/size.test.ts`, and `tools/check-boundaries.ts`.

## Append new foreground seed steps at the tail, initialise project indexes before asset uploads, and keep Tour targets isolated

- Date: 2026-11-27

### What happened

While expanding Writers' room and Lanternfield Studios to cover all eight project kinds, all eight formats, inline graphics, reusable Show/News templates and recoverable Trash, four seed-architecture constraints surfaced: (1) `buildSeed` shares one `DEMO_SEED` RNG stream across every foreground step, so inserting a new step before existing steps shifts generated block IDs and page fits downstream; (2) `PUT /api/projects/:projectId/assets/:assetId` checks roles on `indexDocId("project", projectId)` and returns `403 forbidden` if the project index document has not been created yet, while `@manent/demo` runs in the browser boundary and cannot import `node:crypto` or `node:zlib` to create PNG binaries; (3) pre-seeding inline graphics on `medium/lannick-one-news/stories/01`, a rundown default skeleton on `medium/the-late-desk`, extra documents inside `medium/the-lamp-room`, or filing `The Lamp Room` into a folder would collide with `write-inline-graphics`, `rundown-show-template`, `duplicate-and-archive` and `write-library-organise` E2E assertions; and (4) combining five showcase builders and content banks into single files tripped `tools/test/size.test.ts`'s 400-line ceiling.

### How it was caught

The shared RNG stream, project-index asset precondition and Tour target collisions were caught by design review against `packages/demo/src/seed/seed.ts`, `packages/server-core/src/assets/service.ts` and the Tour E2E specs before wiring; the 400-line limit was caught immediately by `tools/test/size.test.ts`, and every end-to-end invariant was verified by `apps/server/test/writers-room-showcase-seed.test.ts` plus live Chromium Playwright Tour runs.

### Rule

Place any new foreground seed steps at the tail of `SEED_STEPS` (immediately before `WORKSPACE_ORGANISATION`) so existing steps keep their exact `DEMO_SEED` RNG stream. Keep seeded binary image generators pure JavaScript inside `@manent/demo` (`packages/demo/src/seed/png.ts`), route uploads through `SeedDriver.uploadAsset` (`apps/server/src/seed/assets.ts`), and ensure `indexDocId("project", projectId)` exists before issuing `PUT /api/projects/:projectId/assets/:assetId`. Never mutate Tour fixture targets (`stories/01` graphics, `the-late-desk` `project.rundownSkeleton`, `the-lamp-room` single-doc root placement), and split seed content/step modules cleanly below 400 lines.

### Enforced by

`packages/demo/test/writers-room-showcase.test.ts`, `apps/server/test/writers-room-showcase-seed.test.ts`, `tools/test/size.test.ts`, `tools/test/check-boundaries.test.ts`, `e2e/interface/library.e2e.ts`, `e2e/tour/write-library-organise.e2e.ts`, `e2e/tour/write-inline-graphics.e2e.ts`, and `e2e/tour/rundown-show-template.e2e.ts`.

## Keep To review quote attribution outside `<p>` and preserve DOM test contracts during inspector polish

- Date: 2026-11-27

### What happened

During the three-track Rundown, Comments/Share and Editor Inspector maturity wave, two subtle test and accessibility contracts surfaced: (1) adding an attribution label `<span>` inside `To review`'s quoted `<p>` elements and turning the row header into a clickable `<Row onActivate>` broke `apps/web/test/to-review.dom.test.tsx`, which asserts exact `p.textContent` values and expects focus on the first action button (`Keep as merged`) inside `[data-review-block]`; and (2) `PrompterControlBar`'s `Play`/`Pause` button is asserted to carry `aria-pressed` in `apps/web/test/prompter-remote-scroll.dom.test.tsx`, while `Library` rundowns had a `<button>` nested inside a clickable `<Row>`, tripping WCAG 4.1.2 `nested-interactive`.

### How it was caught

By running the targeted `apps/web/test/` DOM regression suites immediately after each track (`to-review.dom.test.tsx`, `prompter-remote-scroll.dom.test.tsx`, `share-dialog.dom.test.tsx`) and auditing row disclosures against `Row`'s `leadingControl` slot.

### Rule

Place attribution labels on `To review` and suggestion wordings as sibling `<span>` elements above each quoted `<p>` (keeping `<p>` text pure) and keep the row header non-focusable so `focusPending()` lands on the primary decision button. Always place disclosure chevrons on clickable `<Row>` items in `Row`'s `leadingControl` sibling slot (never inside `children`), and grep existing DOM test assertions before altering ARIA attributes on transport buttons or dialog labels.

### Enforced by

`apps/web/test/to-review.dom.test.tsx`, `apps/web/test/prompter-remote-scroll.dom.test.tsx`, `apps/web/test/rundown-a11y.dom.test.tsx`, `apps/web/test/comments-tab.dom.test.tsx`, and `apps/web/test/inspector-writing-tools.dom.test.tsx`.

## Narrow shellState subscriptions off the caret path and guard opaque URL origins in companion launchers

- Date: 2026-11-27

### What happened

Three subtle runtime and test defects surfaced while building Concept A's Smart Demo Stage: (1) subscribing `DemoBarControls` directly to raw `shellState` (whose `spaceBeforeSet` flips as the caret moves across blocks) and `WritersControl` directly to `useEditorFact("blockId")` re-rendered demo toolbar components on caret movement; (2) `companionUrlFor` passed `window.location.origin || "http://manent.invalid"` to `new URL(...)`, which threw on opaque `about:blank` origins where `location.origin` is the truthy string `"null"`; and (3) picking the first non-current person from `DEMO_PEOPLE` paired Dana with Sam on Lanternfield Studios (`heavy`), where only Dana and Priya are members, and `TourFloatingBar` broke standalone unit mounts when it called `useServices()` unconditionally.

### How it was caught

By the Principal Architecture audit before implementation and by DOM unit tests in `apps/web/test/demo-stage.dom.test.tsx` and `apps/web/test/tour-redesign.dom.test.tsx`.

### Rule

Never subscribe persistent shell chrome to full `shellState` or `useEditorFact("blockId")` when it only needs route, document or panel identity—use `useNarrowedShellState()` and read caret facts lazily from `FactsContext` inside click handlers. When constructing relative URLs from `window.location.origin`, reject `"null"` as well as empty strings (`origin && origin !== "null"`). Resolve demo companions against the active workspace's `memberUserIds`, and keep `TourFloatingBar` free of `ServicesProvider` hooks so standalone mounts remain pure.

### Enforced by

`apps/web/src/demo/demo-context.ts`, `apps/web/src/demo/demo-stage-hooks.ts`, `apps/web/src/demo/writers-control.tsx`, `apps/web/test/demo-stage.dom.test.tsx`, and `apps/web/test/tour-redesign.dom.test.tsx`.

## Gate initial selectionEmpty facts on blockId and rank runnable palette rows ahead of unavailable sections

- Date: 2026-11-27

### What happened

Two subtle context and ranking bugs surfaced when exercising the Smart Command Palette against a live browser session: (1) `INITIAL_FACTS` in `apps/web/src/state/facts.store.ts` initialises `selectionEmpty` to `false` before the editor publishes its first selection fact, so reading `!facts.get("selectionEmpty")` on a newly opened script treated the empty page as having a text selection and recommended `Comment`, `Note` and `Dual dialogue` instead of script-body actions; and (2) `rankRows` in `packages/ui/src/palette/palette-rank.ts` sorted strictly by section kind (`command` before `setting`) ahead of `row.enabled`, allowing an unavailable command (`Numbers — works on a script`, matching `"scene numbers"` only via keywords) to sit at index 0 ahead of enabled exact-prefix setting rows (`Scene numbers: None`).

### How it was caught

Both defects were caught immediately by live Chromium Playwright execution and screenshot inspection of `e2e/interface/smart-palette.e2e.ts` on a fresh script.

### Rule

Never treat `facts.get("selectionEmpty") === false` alone as an active text selection before `facts.get("blockId") !== null` (pair it with `blockId !== null`, `selectedText.length > 0`, or `material?.selection === true`). In `rankRows`, order runnable rows before unavailable rows (`disabled` before `section`) so a disabled command never outranks an actionable setting, place or script match.

### Enforced by

`apps/web/src/shell/palette-context.ts`, `packages/ui/src/palette/palette-rank.ts`, `packages/ui/test/palette.test.ts` and `e2e/interface/smart-palette.e2e.ts`.

## Avoid nested interactive controls inside table rows and keep status announcements outside aria-busy

- Date: 2026-11-27

### What happened

Auditing the Series Overview, Prompter and External Reader surfaces uncovered three recurring accessibility and lifecycle defects: (1) Series episode rows rendered `<button>`, `<Select>` and `<Input>` editors inside a clickable `<button>` row container, tripping WCAG 4.1.2 `nested-interactive` and swallowing inline cell edits; (2) loading states in Prompter and External Reader placed their `"Opening…"` `<p>` inside an `aria-busy="true"` container, which suppresses screen-reader announcements while busy; and (3) `ReaderScreen` started browser Read aloud via `startReaderReadAloud` without subscribing its `StateBar` to `readAloud` state or stopping speech on unmount, leaving no visible `"Reading aloud · Stop"` control and leaking speech across navigation.

### How it was caught

By the four-track Staff Adviser audit across Series Overview, Send, Present/Prompter/Reader and Board prior to implementing the maturity wave.

### Rule

Never nest interactive buttons, menus or inputs inside a clickable row button: make the row container a non-interactive layout element (`.mn-row`) whose title link/button and sibling cell controls sit side by side with a sibling `RowMenu`. Keep `<p role="status">` loading announcements as siblings outside `aria-busy="true"` skeleton wrappers so assistive technology announces loading immediately. Whenever a standalone screen invokes global browser speech (`readAloud`), bind its status bar to a dedicated reactive hook (`useReaderReadAloudFacts`) that stops speech on unmount.

### Enforced by

`apps/web/test/series-overview.dom.test.tsx`, `apps/web/test/present-maturity.dom.test.tsx`, `apps/web/src/read-aloud/state-facts.ts`, and `e2e/interface/ux-maturity.e2e.ts`.

## Sync page-sheet underlays to rendered page breaks whenever inline diff widgets add height

- Date: 2026-11-27

### What happened

In Version history (`On the page` and both panes of `Side by side`), `changesPlugin` injects inline `<del class="mn-removed">` widgets and block-level `del[data-changes="removed"]` widgets into `.mn-page-view` without changing `@manent/pagination`'s page table. Because `.mn-sheet` underlays and `.mn-zoom` height stayed on fixed `index × (pageHeight + PAGE_GAP_PX)` geometry, cumulative extra height from earlier removed scenes and wrapped deletions shifted every subsequent page break downward by up to `1,152 px` on _203 Undertow_, pushing text across sheet gaps and onto page-number headers (`11.`) while overflowing the final page past `.mn-zoom`. At the same time, removed block widgets lacked block screenplay classes (collapsing consecutive removed elements onto one inline run), trailing removed blocks used `side >= 1` (sorting after `pb-last`), and `mountHistoryWorkingView` omitted `changeMarksPlugin()`, leaving `Asterisks only` without margin asterisks.

### How it was caught

By visual inspection of _203 Undertow_ on `/s/$docId/history` comparing `Working` against `Network draft`, followed by live Chromium DOM geometry measurements across all five History view modes.

### Rule

Whenever `changesPlugin` renders inline changes (`display: "page"`), keep `.mn-sheet` underlays and `.mn-zoom` height synchronised with rendered `.pb-head` / `.pb-foot` boundaries via `sheetBoxSyncPlugin` and `PageScaffold.setPageBoxes`, absorbing excess height into each page's `.pb-fill` via `--fill-trim` before expanding that sheet and anchoring footers from the sheet's bottom edge. Style removed block widgets with their screenplay element classes (`mn-removed el el-<type>`), place trailing removed blocks strictly before `pb-last` (`side < 1`), and pair `changesPlugin()` with `changeMarksPlugin()` on read-only History views so `Asterisks only` draws right-margin asterisks.

### Enforced by

`packages/editor/test/sheet-sync.dom.test.ts`, `packages/editor/test/page-scaffold.test.ts`, `packages/editor/test/changes-plugin.test.ts`, `packages/editor/test/page-styles.test.ts`, and `apps/web/test/history-version-view.dom.test.ts`.

## Guard Bun CSS logical-edge merges and hover-revealed action overlays on compact cards

- Date: 2026-11-27

### What happened

During the Series Board redesign and `Fit`-default horizontal scroll pass, two subtle CSS interaction defects surfaced: (1) Bun's CSS bundler merged `[dir="rtl"] .mn-board-fade-start` and `.mn-board-fade-end` because both shared an identical `linear-gradient(to right, …)` declaration, dropping `inset-inline-end: 0` from `.mn-board-fade-end` so the right-edge fade veil rendered on top of the left `STORYLINES` corner; and (2) adding a 3-button hover overlay (`~86 px` wide) in the top-end corner of a `~166 px` card overlapped the card's center click target, while setting `pointer-events: none` at rest blocked direct clicks on the `RowMenu` trigger once focus moved elsewhere (as in the `write-board` Tour scenario).

### How it was caught

The dropped `inset-inline-end: 0` veil was caught by visual inspection of live Playwright screenshots and confirmed via `grep` on `apps/web/dist/*.css`; the hover overlay center interception and `pointer-events: none` block were caught immediately by `e2e/tour/write-board.e2e.ts`.

### Rule

Keep absolutely positioned start/end edge veils and pan buttons on explicit `left`/`right` declarations paired with `[dir="rtl"]` overrides so CSS minifiers never drop an edge position when merging identical gradients. Keep sibling `[data-row-menu]` hover clusters compact (`<= 2` icon buttons, clear of the card's center click target) and never set `pointer-events: none` on resting `RowMenu` triggers so keyboard, screen-reader, and automated clicks work without requiring a prior hover.

### Enforced by

`packages/ui/src/theme.css`, `apps/web/src/screens/board/board-card.tsx`, `apps/web/test/board-redesign.dom.test.tsx`, and `e2e/tour/write-board.e2e.ts`.

## Guard Demo Stage popovers against exit ghosting, duplicate status slots, listener races and premature destructive wipes

- Date: 2026-11-27

### What happened

During the Demo Stage toolbar redesign and live Chromium E2E sweep, four subtle UI and async reliability bugs surfaced: (1) Base UI popovers that triggered a route navigation (`All demo people…` → `/choose`) stayed mounted briefly during their exit animation, leaving duplicate person buttons in the DOM; (2) stopping the server inside **Demo controls** left the popover open while a pinned **Start the server** pill mounted on the bar, creating both a duplicate `[data-slot="bar-status"]` and two **Start the server** buttons; (3) `ReorganiseControl` previously fired `api.rebuild(docId)` synchronously before its `useEffect` attached the handle's `rebuilt` listener, risking a stuck busy state on fast compactions; and (4) `ResetControl` closed `ConsequenceDialog` and wiped Tour progress before `client.reset()` resolved, losing progress silently if the supervisor was unreachable.

### How it was caught

The listener race and premature reset wipe were caught during the reliability architecture audit of `apps/web/src/demo/`; the exiting-popover ghosting, duplicate status slot and open-popover server-button collision were caught immediately by live Chromium Playwright execution of `e2e/smoke/demo-skeleton.e2e.ts`.

### Rule

Add `data-closed:hidden` to demo `PopoverContent` surfaces that navigate or switch global state so closed popovers never ghost over destination screens, close **Demo controls** immediately when triggering a global server action, and mount `[data-slot="bar-status"]` in exactly one branch at a time. Attach async completion listeners (`openHandle(docId)` → `handle.on`) strictly _before_ issuing server mutation requests (`api.rebuild`), with a bounded timeout and explicit refusal announcements. Keep destructive confirmation dialogs (`ConsequenceDialog`) open with `busyLabel` until the remote request resolves, clearing local state only after acceptance and surfacing `refusal` otherwise.

### Enforced by

`apps/web/test/demo-stage.dom.test.tsx`, `apps/web/src/demo/demo-bar-controls.tsx`, `apps/web/src/demo/demo-lab.tsx`, `apps/web/src/demo/reset-control.tsx` and `e2e/smoke/demo-skeleton.e2e.ts`.

## Forward benchmark environment overrides explicitly into Docker tier containers

- Date: 2026-11-27

### What happened

Host benchmark runs inherit `process.env` into scenario child processes via `scenarioEnv` in `bench/env.ts`, so a scenario reading `MANENT_SOAK_MINUTES` works on `host` without extra wiring. Inside Docker tier containers (`D-modest`, `D-typical`, `D-small`), however, `dockerRunArgs` in `bench/tiers/tiers.ts` only passed `MANENT_BENCH_TIER` and `MANENT_BENCH_THROTTLE`, so setting `MANENT_SOAK_MINUTES` on the host was silently dropped and containers fell back to the mode default.

### How it was caught

During a Docker-tier soak run and follow-up review of `bench/tiers/orchestrate.ts` and `bench/tiers/tiers.ts`, which also spotted that an empty `soakMinutes: ""` passed directly to `dockerRunArgs` would emit `--env MANENT_SOAK_MINUTES=`.

### Rule

Whenever a benchmark scenario reads a host `MANENT_*` environment variable, forward it explicitly from `runContainer` (`bench/tiers/orchestrate.ts`) through `dockerRunArgs` (`bench/tiers/tiers.ts`), guard against both `undefined` and empty strings at both boundaries, cover both container-argument construction and `runTiers` orchestration in `bench/test/tiers.test.ts`, and keep `docs/development/benchmarks.md` aligned.

### Enforced by

`bench/test/tiers.test.ts` — "a tier's container is started with its caps and its throttle" and "a Docker tier forwards MANENT_SOAK_MINUTES only when non-empty".

## Resolve light-dark() tokens through a CSS probe for Canvas 2D and swallow WAAPI cancel rejections

- Date: 2026-11-27

### What happened

When building `GemStage` (`packages/ui/src/components/brand/gem-stage.tsx`) with Canvas 2D and the Web Animations API, two subtle runtime issues appeared: (1) reading semantic tokens via `getComputedStyle(el).getPropertyValue("--fg-accent")` returns an unresolved `light-dark(...)` string that Canvas 2D ignores, and (2) calling `heroAnim.cancel()` on replay or unmount rejected `heroAnim.finished` with `AbortError` per the Web Animations specification, surfacing as unhandled rejections under `happy-dom` in Bun tests.

### How it was caught

The unresolved `light-dark(...)` behaviour was caught during design architecture review before writing the renderer, and the `AbortError` rejection was caught immediately by `packages/ui/test/brand-and-palettes.dom.test.tsx`.

### Rule

Never hard-code colour literals in TypeScript for Canvas 2D or read raw CSS custom properties that may hold `light-dark(...)`. Map semantic tokens onto standard CSS colour properties on a zero-layout probe element (`.mn-gem-stage-probe`) in `packages/ui/src/theme.css` and read `getComputedStyle(probe)` once on mount or theme change (never inside `requestAnimationFrame`). Whenever code starts a Web Animations API `Animation` that may be cancelled on replay or unmount, attach `anim.finished?.catch(() => {})` immediately.

### Enforced by

`packages/ui/test/gem-scenes.test.ts`, `packages/ui/test/brand-and-palettes.dom.test.tsx` and `tools/test/colours.test.ts`.

## Resolve private_folder scripts directly in shelves and render Private projects as plain rows

- Date: 2026-11-27

### What happened

Private scripts live in each person's `private_folder` map (`workspaceId: null`) rather than any workspace's `documents` map, and Private projects hold a single personal script with no series or rundown sub-index. Two subtle bugs surfaced as soon as realistic Private drafts were seeded: (1) `findIn` in `apps/web/src/services/sync/index-shelves.ts` searched only workspace `shelves`, so opening any Private script showed `"Untitled script"` and dropped renames and `editedAt` updates; and (2) `PrivateView` passed Private projects into `ProjectList` without disabling workspace-only custom project views (`SeriesView`, `RundownsView`), so a Private `series` project rendered `"No episodes yet"` with a disabled `+ New season` button and requested a non-existent series sub-index (`403` on `/api/docs/describe`).

### How it was caught

The title-lookup gap was caught during design-review tracing of `apps/web/src/services/sync/`, and the Private `series` rendering bug was caught immediately by opening Dana's Private view in the live demo browser.

### Rule

Whenever `index-shelves.ts` resolves document metadata, fall back to `liveMap(privateIndex.handle, "private_folder")` when no workspace shelf holds the document, route renames and `editedAt` writes to `found.mapName`, and skip `continueMap.set` whenever `found.workspaceId === null` so Private drafts stay out of workspace `Continue`. Render `PrivateView`'s list with `ProjectList plainOnly` so every Private project opens its personal script directly without mounting workspace sub-index views.

### Enforced by

`apps/web/test/library-index.test.ts` (asserting Private script title, kind, project lookup, rename and `Continue` exclusion) and `apps/web/src/screens/library/private-view.tsx` (`plainOnly`).

## Gate localStorage session fallback on offline or standalone PWA launch, and keep leading Row disclosures in a sibling slot

- Date: 2026-11-27

### What happened

Two subtle boundary slips appeared after combining multi-tab demo isolation with PWA cold-launch persistence and activatable list rows: (1) reading `localStorage`'s `LAST_PERSON_KEY` unconditionally whenever `sessionStorage` was empty broke online multi-tab demo isolation — opening a second browser tab while online silently inherited the first tab's person instead of showing `"Choose who you are"`; and (2) `FolderBranch` still passed its expand/collapse `<Button>` through `Row`'s `leading` slot after activatable rows gained `role="button"`, nesting a `<button>` inside `role="button"`.

### How it was caught

Multi-tab session bleed was caught by `e2e/smoke/demo-skeleton.e2e.ts` (`"two tabs are two people"`), and the nested folder disclosure control was caught by auditing every `<Row onActivate>` caller alongside `packages/ui/src/components/row/row.tsx`.

### Rule

Only fall back from empty browser `sessionStorage` to `localStorage`'s `LAST_PERSON_KEY` when `shouldRestoreLastPerson()` holds (`isStandalone()` or `navigator.onLine === false`) so online browser tabs remain isolated while installed PWA windows and cold airplane-mode relaunches resume automatically. Never place interactive buttons inside `Row`'s `leading` or `trailing` slots on an activatable row: use `Row`'s sibling `leadingControl` or `menu` slots so interactive controls sit beside `role="button"`, never inside it.

### Enforced by

`apps/web/src/session.ts`, `apps/web/test/session.test.ts`, `e2e/smoke/demo-skeleton.e2e.ts`, `e2e/offline/pwa.e2e.ts`, `packages/ui/src/components/row/row.tsx`, `packages/ui/test/row.dom.test.tsx`, and `apps/web/src/screens/library/folder-tree.tsx`.

## Keep row menus in Row's sibling menu slot, scope title-menu commands by document kind, and filter infinite animations in E2E settles

- Date: 2026-11-27

### What happened

Three subtle regressions surfaced during the discoverability and cross-browser accessibility pass: (1) passing `<RowMenu>` inside `Row`'s `trailing` prop on `ProjectRow` and `ContinueList` nested a `<button>` inside `<div role="button">`, violating WCAG 4.1.2 (`nested-interactive`) once activatable rows gained explicit `role="button"`; (2) adding script commands (`Rename character`, `Read aloud`, `Reports…`) to `menu: "title"` with `visible: null` leaked a `Tools ▸` submenu onto Rundown title menus where those commands do not apply; and (3) waiting on `element.getAnimations({ subtree: true }).map((a) => a.finished)` over `body` in Playwright timed out in WebKit whenever an infinite CSS keyframe animation was active on the page.

### How it was caught

The `nested-interactive` violation was caught by `@axe-core/playwright` on the Library screen; the Rundown `Tools ▸` leak was caught by DOM menu-model inspection in `apps/web/test/discoverability-wave.dom.test.tsx`; and the WebKit timeout was caught by running `e2e/interface/ux-maturity.e2e.ts` against the `webkit` project.

### Rule

Always pass `<RowMenu>` to `Row`'s sibling `menu` prop rather than `trailing` so interactive row menus stay outside the row's `role="button"` surface. Gate any script-only command placed in `menu: "title"` or `menu: "view"` with an explicit `visible` predicate (such as `onPagedScript` or `ctx.docKind === "script"`) so rundowns and specialised modes stay uncluttered. When settling animations before axe or screenshot checks in Playwright, filter strictly to finite running animations (`animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().iterations)`).

### Enforced by

`apps/web/src/screens/library/project-row.tsx`, `apps/web/src/screens/library/continue-list.tsx`, `packages/commands/src/definitions/script.ts`, `packages/commands/src/definitions/material.ts`, `packages/commands/src/definitions/room.ts`, `apps/web/test/discoverability-wave.dom.test.tsx`, and `e2e/interface/ux-maturity.e2e.ts`.

## Separate one-shot completion latches from sticky session flags on transient offline notices

- Date: 2026-11-27

### What happened

`OfflineReadinessNotice` gated its `"Ready offline"` state on `wasActiveInSession()`, which stays `true` for the whole tab after first-visit service-worker installation or Tier-2 warming. When the `5 s` auto-dismiss timer faded the notice out and returned `phase` to `"hidden"` while `offlineReadiness` still held `status: "ready"`, the next render re-read `wasActiveInSession() === true` and immediately reopened the notice in an infinite loop. Separately, `createOfflineWarm` defaulted `container === null` (non-secure HTTP origins) to `shell_only` instead of `online_only`, making static offline badges read `"Preparing…"` where service workers cannot run.

### How it was caught

The auto-dismiss re-open loop was caught immediately by the fake-clock lifecycle test in `apps/web/test/offline-readiness-notice.dom.test.tsx`; the `online_only` gap was caught during the PWA telemetry and `StudioFooter` audit.

### Rule

Keep a dedicated per-cycle completion latch (`completedReadyRef`) on transient completion notices — set it when exiting `"ready"` and clear it only when a new active `"installing"` / `"warming"` pass starts — rather than resetting or re-reading a sticky session-wide activity flag alone. In `apps/web/src/boot/offline-warm.ts`, report `status: "online_only"` whenever `container === null` or service-worker registration is unavailable so Preferences and `StudioFooter` state honestly when offline caching cannot run.

### Enforced by

`apps/web/test/offline-readiness-notice.dom.test.tsx`, `apps/web/test/sw-lifecycle.test.ts` and `e2e/offline/pwa.e2e.ts`.

## Never fall back missing static assets to index.html, and flip hadController once the first service worker claims

- Date: 2026-11-27

### What happened

Serving `index.html` (`200 text/html`) for missing static asset URLs allowed a browser or service worker fetching an old hashed chunk after a deploy to store HTML under a `.js` or `.css` runtime cache key. Separately, capturing `const hadController = navigator.serviceWorker.controller !== null` once at boot kept `hadController` fixed at `false` even after the first-visit service worker called `clientsClaim()`, so clicking **Reload to update** later in that same opening session sent `SKIP_WAITING` and activated the new worker without reloading the tab.

### How it was caught

The static fallback cache-poisoning hazard was caught during the PWA freshness architecture audit; the immutable `hadController` bug was caught by the live Chromium Playwright update test in `e2e/offline/pwa.e2e.ts` when a waiting build activated during an initial session.

### Rule

Return `404` with `Cache-Control: no-store` from `packages/server-core/src/http/static.ts` for any missing static asset extension, and reject `text/html` responses in service-worker runtime asset caches (`apps/web/src/sw/precache.ts`). In `apps/web/src/boot/sw-lifecycle.ts`, keep `let hadController` mutable so the first `controllerchange` claim sets `hadController = true` without reloading, allowing any subsequent explicit **Reload to update** (`SKIP_WAITING`) in the same session to reload cleanly.

### Enforced by

`packages/server-core/test/http.test.ts`, `apps/web/test/sw-lifecycle.test.ts`, `apps/web/test/sw-manifest.test.ts` and `e2e/offline/pwa.e2e.ts`.

## Desktop local HTTP origins are secure contexts and inject a second inline script into index.html

- Date: 2026-11-27

### What happened

Because `http://127.0.0.1:<port>` is treated as a secure context by Chromium and WebKit, registering `/sw.js` unconditionally in `apps/web/src/main.tsx` could register a service worker inside the Electrobun desktop WebView and cache `local-node`'s per-launch injected desktop bootstrap script. Adding a strict HTML `Content-Security-Policy` in `server-core` also exposed two coupled origins: `packages/local-node/src/http/launch-guard.ts` injects a dynamic inline `<script>` whose hash must be added to `script-src` (with `ETag` removed and `Cache-Control: no-store`), and the demo control server runs on a separate localhost port whose origin must be permitted in `connect-src`.

### How it was caught

The desktop WebView service-worker and `launch-guard` CSP traps were caught during the architecture review; the demo control-port CSP block was caught immediately by live Chromium Playwright execution of `e2e/offline/pwa.e2e.ts` listening for `securitypolicyviolation` events.

### Rule

Never register `/sw.js` when running inside the desktop WebView (`desktopGlobal !== undefined`), and return `404` for `/sw.js` in `packages/local-node/src/http/launch-guard.ts`. Whenever `launch-guard.ts` injects its per-launch inline script into `index.html`, append that script's SHA-256 hash to the response's `Content-Security-Policy` `script-src`, strip `ETag` and set `Cache-Control: no-store`. Pass any configured demo control origin into `applySecurityHeaders` so `connect-src` allows demo control calls without loosening production CSP.

### Enforced by

`packages/local-node/test/launch-guard.test.ts`, `packages/server-core/test/http.test.ts`, `apps/web/test/boot.test.ts` and `e2e/offline/pwa.e2e.ts`.

## Inject root-relative PWA head links after Bun.build and stamp site/ asset hashes deterministically

- Date: 2026-11-27

### What happened

Placing root-relative `<link rel="manifest" href="/manifest.webmanifest">` and `/icons/*` tags directly in `apps/web/src/index.html` caused Bun's HTML bundler to look up `/manifest.webmanifest` on disk at bundle time and stop the build. On the static landing pages under `site/`, unversioned asset URLs (`assets/site.css`, `assets/icons.svg`, `og.png`, fonts and demo media) allowed browsers and GitHub Pages edge caches to keep serving stale assets after updates.

### How it was caught

The Bun HTML bundler constraint was caught immediately by `apps/web/test/build.test.ts`; the static landing-site freshness gap was caught during the delivery audit.

### Rule

Inject root-relative manifest and icon `<link>` tags in `apps/web/build.ts` right after `<meta name="manent-build">` (keeping `<head><script>${BOOT_SCRIPT}</script><meta name="color-scheme" content="light dark" />` first and zero literal hex colours in `apps/web/src/index.html`). After editing any file under `site/`, run `bun tools/stamp-site.ts` so every mutable local CSS, HTML, SVG sprite, OpenGraph and JSON-LD reference carries its exact `?v=<8-char-sha256>` query stamp before running `bun run verify`.

### Enforced by

`apps/web/test/build.test.ts`, `tools/test/colours.test.ts`, `tools/test/stamp-site.test.ts`, `tools/test/site.test.ts` and `.github/workflows/pages.yml`.

## CSS @container cannot match its own classes, and row hover must preserve active fill

- Date: 2026-11-27

### What happened

Placing `@container` and `@[42rem]:flex-row` on the same wrapper `<div>` in `SettingsShell` caused desktop viewports (1440 px) to stack the left rail vertically above `<main>` because CSS container queries only evaluate against descendants. Separately, `button:not(:disabled, [aria-disabled="true"]):hover > .mn-row:not([aria-selected="true"])` in `packages/ui/src/theme.css` had higher specificity than `.mn-row[aria-current]` and did not exclude `[aria-current="true"]` or `[aria-current="page"]`, turning active settings-rail tabs grey under the pointer.

### How it was caught

By capturing and visually inspecting live Chromium screenshots of Preferences, Project settings and Workspace settings at 1440 px, 375 px and 200 % interface size.

### Rule

Always place `@container` on an ancestor wrapper strictly above any element carrying `@[…]` container-query utilities. In `packages/ui/src/theme.css`, exclude `[aria-current="true"]` and `[aria-current="page"]` from `.mn-row` hover rules so active tabs and links keep `--bg-selected` under the pointer, and include `a[href]:not([aria-current="page"]):hover > .mn-row` so navigation links match tab hover feedback.

### Enforced by

`apps/web/src/settings-shell/settings-shell.tsx`, `packages/ui/src/theme.css`, `apps/web/test/settings-unify.dom.test.tsx`, `e2e/interface/preferences.e2e.ts` (200 % and 320 px overflow checks) and `tools/test/theme.test.ts`.

## Unify full-page settings through SettingsShell and collapse default-heavy style matrices

- Date: 2026-11-27

### What happened

Preferences, Project settings and Workspace settings had drifted into three separate chrome shells, headers, status bars and responsive breakpoints (viewport `md:` vs container queries, causing horizontal overflow at 200 % interface size), while Project settings rendered all 48 screenplay element style fields open by default with repeated `"As the format sets it"` placeholders that hid real format defaults and pushed Title page, Names and facts, People and Drafts far down the page.

### How it was caught

By a UX and visual review of live Project settings and Preferences screenshots reported as inconsistent and confusing.

### Rule

Build every full-page settings screen on `apps/web/src/settings-shell/` (`SettingsShell`, flat sibling `SettingsCard`s with no card-in-card nesting, and `SettingsNotice`), preserving the direct `div > header > h1` focus contract, `activeNavId={null}` for filter overlays such as `Set by you`, and `@[42rem]` container-query collapse for narrow viewports and 200 % interface sizes. Collapse large format-default grids (such as `ElementStyleRow`) into single-line summaries reading real defaults from `@manent/pagination`, expanding on demand into a two-column editor with `Default: …` placeholders, per-element `Reset`, an `N changed` badge and `Reset all` with Undo.

### Enforced by

`apps/web/test/settings-unify.dom.test.tsx`, `apps/web/test/ux-library-settings.dom.test.tsx`, `e2e/series/project-style.e2e.ts`, `e2e/tour/together-style.e2e.ts` and `docs/development/design-system.md`.

## Explicit keyboard semantics on activatable rows, editable scroll regions and inline clear buttons

- Date: 2026-11-27

### What happened

Three WCAG 2.2 AA keyboard and target-size regressions surfaced together during accessibility auditing: (1) `<Row onActivate={…}>` rendered a `<div tabIndex={0}>` with no `role="button"` and no `Space` handler, causing Library Search's `ArrowDown`/`ArrowUp` queries (`[role="listitem"] [role="button"]`) to return `null`; (2) editable `.ProseMirror` omitted `tabindex="0"` (setting it only when read-only), causing axe-core's `scrollable-region-focusable` check to flag `[data-region="page"]` for Safari keyboard scrolling; and (3) the Library Search inline clear button used `size="icon-xs"` (`20 px × 20 px`), falling below WCAG 2.2 AA 2.5.8's `24 px` minimum target size.

### How it was caught

By live Playwright `@axe-core/playwright` WCAG 2.2 AA sweeps (`e2e/interface/ux-maturity.e2e.ts`) and keyboard navigation DOM tests (`apps/web/test/library-search-keyboard.dom.test.tsx`).

### Rule

Give every activatable non-native row explicit `role="button"` and `Space` activation alongside `Enter`, keep `tabindex="0"` on `.ProseMirror` in both editable and read-only states so scrollable script regions always have explicit keyboard access, and size interactive inline icon buttons at least `size="icon-sm"` (`24 px × 24 px`) to meet WCAG 2.2 AA target-size requirements.

### Enforced by

`packages/ui/test/row.dom.test.tsx`, `apps/web/test/library-search-keyboard.dom.test.tsx`, and `e2e/interface/ux-maturity.e2e.ts`.

## Dropdown checkbox clearance specificity and toggle suffixes in menuModel

- Date: 2026-11-27

### What happened

In `packages/ui/src/theme.css`, the shared rule `[role^="menuitem"]:not(.mn-swatch-item)` (specificity `(0,2,0)`) set `padding-inline: 0.5rem`, which overrode the lower-specificity rule `:is([role="menuitemcheckbox"], [role="menuitemradio"])` (`(0,1,0)`) meant to reserve `2.25rem` of trailing space for checkmarks. Checked items with keyboard shortcuts (such as `Left panel ⌘⌥1`) or long labels collided directly with the trailing checkmark, and toggle commands emitted `: turn on` / `: turn off` suffixes beside an already-visible checkmark.

### How it was caught

By visual inspection of the `View ▾` dropdown menu in the running app after the unified menu redesign.

### Rule

Match or exceed the base menu-item selector specificity when reserving trailing indicator clearance (`[role^="menuitem"]:is([role="menuitemcheckbox"], [role="menuitemradio"]) { padding-inline-end: 2.25rem; }`). In `menuModel`, strip `: turn on` / `: turn off` suffixes when an item renders a checked state (`state.checked !== null`) while keeping full action phrasing in the Command Palette where no checkmark is shown.

### Enforced by

`packages/commands/test/menu.test.ts` (asserting stripped checkbox labels in `menuModel`) and `tools/test/theme.test.ts`.

## Scale read-only PageView panes via scaffold.applyZoom, not --page-zoom alone

- Date: 2026-11-27

### What happened

`mountHistoryPageView` initially wrote `--page-zoom` onto the scroll container to fit `816px` screenplay sheets inside narrower `Side by side` comparison panes. Setting `--page-zoom` alone only changed outer desk padding while `.mn-pages` stayed unscaled inside `.mn-zoom`, clipping the right edge of both screenplay sheets at `1280×800`.

### How it was caught

By opening `/s/$docId/history` in `Side by side` mode in the live browser and checking `scrollWidth > clientWidth` on each comparison pane.

### Rule

Whenever a read-only `PageView` must fit inside a variable-width pane, call `page.scaffold.applyZoom(percent)` (backed by a `ResizeObserver`) so `.mn-zoom` scales both visual width and layout height in lockstep with zero horizontal clipping.

### Enforced by

`apps/web/src/editor-host/history-page-view.ts` (`attachAutoFitZoom` calling `page.scaffold.applyZoom`) and live viewport verification in `Side by side` mode.

## Wrap menu text beside icons in a span and keep floating minimaps weightless

- Date: 2026-11-27

### What happened

Two small interface regressions appeared during the menu and History page work: (1) placing bare text beside a leading Lucide `<svg>` inside `workspace-switcher.tsx` menu items caused `rowWords` in `apps/web/test/library.dom.test.tsx` to skip the label; and (2) prototyping Version history with a permanent `280px` docked left minimap sidebar plus duplicated `Restore` / `Copy link` buttons ate horizontal room needed by screenplay sheets and introduced redundant chrome.

### How it was caught

`apps/web/test/library.dom.test.tsx` caught the unwrapped menu label immediately; visual review of `/s/$docId/history` caught the cramped docked sidebar and duplicate actions.

### Rule

Always wrap label text next to an icon inside a `<span>` inside menu items. Keep full-screen reading and review minimaps (`MiniMapToc`, `HistoryMinimapToc`) weightless on the floating right edge (`end-4`, closed at rest, expanding on hover/click with a `Pin` toggle) and keep primary actions (`Restore`, `Copy link`, `Name this draft…`) in a single bar without repeating them in side rails.

### Enforced by

`apps/web/test/library.dom.test.tsx`, `apps/web/test/history-minimap.test.ts` and [ADR 0079](../decisions/0079-dedicated-read-only-version-history-page.md).

## Running xvfb-run as PID 1 inside Docker deadlocks its Xvfb readiness signal

- Date: 2026-11-26

### What happened

`dockerRunArgs` in `bench/tiers/tiers.ts` started client benchmark containers with `docker run --rm … xvfb-run -a bun bench/run.ts --inside …` and no `--init`. Inside Linux containers, PID 1 ignores unhandled signals, so `xvfb-run`'s `SIGUSR1` readiness handshake from `Xvfb` never completed and the `D-modest` container sat idle at 0 % CPU without ever launching `bun`.

### How it was caught

By inspecting `docker stats` and `docker exec … ps -ef` on a `D-modest` container that had written no results after ninety minutes.

### Rule

Always pass `--init` to `docker run` for benchmark containers so a lightweight init process owns PID 1, forwards signals cleanly to `xvfb-run`, and reaps child browser processes.

### Enforced by

`bench/test/tiers.test.ts` (asserting `docker run --rm --init` on both client and server container invocations).

## Strip FORCE_COLOR in subprocess CLI tests run under bun test --parallel

- Date: 2026-11-26

### What happened

Switching `test:unit` to `bun test --parallel` caused six stderr assertions in `tools/test/demo-cli.test.ts` to mismatch because parallel test workers propagated `FORCE_COLOR=1`, causing `tools/demo/cli.ts` to wrap plain refusal lines in ANSI red escape sequences.

### How it was caught

By running `bun test --parallel ./packages ./apps ./tools ./bench` across all 590 test files before wiring it into `package.json`.

### Rule

When a test spawns a CLI subprocess and asserts exact `stdout` or `stderr` text, strip `FORCE_COLOR` from the inherited environment and set `NO_COLOR: "1"` so output stays identical under serial and `--parallel` test workers.

### Enforced by

`tools/test/demo-cli.test.ts` (explicitly stripping `FORCE_COLOR` and setting `NO_COLOR: "1"` in `demoEnv`).

## Hover-revealed row menus must swap with trailing metadata instead of reserving a resting spacer

- Date: 2026-11-26

### What happened

`Row` in `packages/ui/src/components/row/row.tsx` unconditionally rendered a `size-6` (24 px) trailing spacer beside its `gap-2` (8 px) even when the row's menu (`RowMenu`) hid itself with `opacity: 0` at rest on hover-capable pointers. In narrow sidebars such as the Scenes list, that created a 32 px dead gutter down the right edge, misaligned scene lengths from `44 scenes` and `Back to …`, and truncated scene headings 32 px early.

### How it was caught

By visual review of the Scenes list sidebar comparing resting scene page lengths against the toolbar count and the Ghost Follow strip above them.

### Rule

When a `Row` pairs trailing metadata with a hover-revealed menu (`RowMenu`), pass `menuReveal="hover"` so `@media (hover: hover)` omits `[data-menu-spacer]` at rest and cross-fades `[data-trailing]` out while revealing `[data-menu-handle]` on hover, focus-within or open menu—keeping the spacer only for touch pointers (`@media (hover: none)`) and always-visible menus (`menuReveal="always"`). Keep stacked side-panel toolbars, strips and rows on matching horizontal padding (`px-3`) so both column rails align.

### Enforced by

`packages/ui/src/components/row/row.tsx`, `packages/ui/src/theme.css`, `packages/ui/test/row.dom.test.tsx`, and `apps/web/test/ghost-follow.dom.test.tsx`.

## Binary searches over DOM bounding boxes must exclude hidden blocks

- Date: 2026-11-26

### What happened

`blockAcross` in `packages/editor/src/script-editor/page-controls.ts` binary-searched `:scope > p.el` by `getBoundingClientRect().bottom > top`. Once omitted scene bodies were hidden with `p.el.el-hidden { display: none }`, hidden paragraphs reported zero-height rects (`bottom === 0`) inside an otherwise monotonically increasing vertical list, which could divert binary search past the visible target block.

### How it was caught

While auditing `blockAcross` for Ghost Follow's `viewedBlock` lookup in `packages/editor/src/script-editor/page-controls.ts`.

### Rule

Whenever code binary-searches block elements by viewport rect, filter out hidden blocks (`:scope > p.el:not(.el-hidden)`) so the sequence of bounding boxes remains strictly monotonic.

### Enforced by

`packages/editor/src/script-editor/page-controls.ts` (`:scope > p.el:not(.el-hidden)`) and `packages/editor/test/bridge-plugin.dom.test.ts`.

## Mirror layout patches in editor decorations and skip empty groups in the outline

- Date: 2026-11-26

### What happened

`productionLayout` patched omitted scene headings to `{ text: "OMITTED" }` and every block inside an omitted scene to `{ type: "group", text: "" }` so pagination gave the heading one line and its body zero lines. Editor pagination decorations never applied those patches to the DOM, so omitted scene bodies stayed at full height and shifted every later page downward across sheet breaks and page headers. At the same time, `outlineOf` treated every `type: "group"` block as a `"section"` even when its text was empty, turning each hidden block into a blank 28 px row under the omitted scene in the Scenes panel.

### How it was caught

By visual and DOM inspection of an omitted scene (`Scene 25`) in `The Long Night`, where `Scene 26` overlapped Page 18's `Blue Rev.` header and five blank rows sat between `25 OMITTED` and `26` in the Scenes list.

### Rule

Whenever `LayoutPatches` hides a block (`{ type: "group", text: "" }`) or replaces its text (`patch.text`), pagination decorations must mirror that in the DOM (`el-hidden` with `display: none`; `data-omitted` with replacement text and hidden original runs) so rendered height matches the pagination engine. `outlineOf` ignores empty `group` blocks, and `bridgePlugin` refreshes the outline when `index.layoutKey` changes.

### Enforced by

`packages/editor/test/revisions-plugin.test.ts`, `packages/editor/test/page-styles.test.ts`, `packages/editor/test/bridge-facts.test.ts`, and `packages/editor/test/bridge-plugin.dom.test.ts`.

## Wire every new relay or asset helper into its live composition root and authenticate binary asset requests

- Date: 2026-11-26

### What happened

Two separate helpers passed isolated unit tests while remaining disconnected or unauthenticated in the live app. First, `createPrompterControlHttpProxy` in `packages/local-node` was exported and unit-tested directly, yet never wired into `createPrompterService`, and `docIdOf` did not parse parameterised `/api/prompter/:docId/…` paths, so synced rundowns fell through to local state instead of proxying to the cloud authority. Second, the browser graphic image uploader and `<img>` loader called `/api/projects/:projectId/assets/:assetId` without the signed-in Bearer header (and without scoping by the document's project ID on fetch), so live authenticated uploads and downloads were refused with `401`.

### How it was caught

By senior code review tracing end-to-end request paths from `apps/web` and `packages/local-node` composition roots into `packages/server-core` route handlers.

### Rule

Never declare a relay, proxy or HTTP helper finished on isolated unit tests alone: wire it into its live composition root (`createLocalNode`, `createServer`, `apps/web` services) and assert live end-to-end routing and Bearer-authenticated fetch/upload behaviour with the real server stack.

### Enforced by

`packages/local-node/test/prompter-control-relay.test.ts` (asserting live `createLocalNode` HTTP proxying across static and parameterised prompter control paths for synced vs local-only rundowns) and `apps/web/test/graphics-ui.dom.test.tsx` (asserting Bearer-authenticated project-scoped asset upload and fetch).

## Exclude baseline-absent added rows from row-level History restore controls

- Date: 2026-11-26

### What happened

The rundown History diff view rendered a `Restore` button on every non-`same` row, including rows whose diff kind was `"added"` (present now, absent in the chosen baseline version). Clicking `Restore` on such a row offered to restore something that never existed in that version, and the server's row restore rejected the missing row ID.

### How it was caught

By code review checking `canRestoreRow` in `apps/web/src/screens/document/history-rundown-diff.tsx` against `applyRundownRestore` in `packages/crdt/src/rundown/rundown-restore.ts`.

### Rule

Gate row-level History restore controls strictly on rows that exist in the baseline version (`rowDiff.kind !== "same" && rowDiff.kind !== "added"`), keeping whole-rundown restore for rolling back newly added rows.

### Enforced by

`apps/web/test/rundown-history.dom.test.tsx`, which asserts that `changed`, `moved` and `removed` rows expose a row `Restore` button for editors while `added` and `same` rows do not.

## Pin public documentation and release installer claims with automated tests

- Date: 2026-11-26

### What happened

Public site pages and the README drifted out of sync with shipped code: download links constructed non-existent `.AppImage`, `.exe` and unversioned macOS `.dmg` filenames that differed from the desktop build outputs, landing-page and comparison copy claimed legacy `.fdr` files could be imported directly, prohibited words slipped into visible text, and the README listed Game Script line-data exports as CSV instead of XML.

### How it was caught

By a full audit of `site/` and public documentation against the release workflow, desktop build scripts and format exporters.

### Rule

Whenever public documentation or site scripts state supported file formats, release artefact filenames or wording constraints, add a deterministic test that checks those claims against the source of truth so future changes cannot drift silently.

### Enforced by

`tools/test/site.test.ts` (asserting zero prohibited words, zero false `.fdr` import claims and no dead `.AppImage`, `Manent-windows.exe` or `Manent-mac.dmg` links) and `tools/check-records.ts` (verifying README fixed sections, package statuses and public document links).

## Preserve concurrent block restores as overlaps instead of silently replacing

- Date: 2026-11-26

### What happened

In `mergeByBlock`, when a block had no common ancestor (`base === null`) because it had been removed earlier and both sides concurrently restored different wordings under the same block ID, `outcomeOf` returned `replace` and silently overwrote the remote side's block instead of preserving both wordings as an overlap for review.

### How it was caught

By the history fuzz simulation in `@manent/testkit`, which hit a data-preservation invariant violation when concurrent offline edits and version restores converged on the same block ID.

### Rule

In three-way block merging, whenever `base === null` and both `mine` and `theirs` are present with differing content, return an `overlap` outcome so neither writer's wording is silently discarded.

### Enforced by

`packages/revisions/test/merge-doc.test.ts` and `packages/testkit/test/history-fuzz.test.ts`, which verify that differing `base === null` blocks produce an `overlap` and pass the history fuzz invariants across concurrent restore sequences.

## Upgrade stored create metadata when reopening a never-synced document with create options

- Date: 2026-11-26

### What happened

Opening a never-synced document before its creation parameters were available persisted `meta.create = null` in `StoreJournal`. When the caller later reopened the same document passing a `create` payload, the journal kept the stale `create: null` metadata, preventing the client from creating the document on the server once connectivity was available.

### How it was caught

By investigating offline document creation and reopening flows in `packages/sync-client/src/session/journal.ts`.

### Rule

When opening a journal whose stored metadata still has `neverSynced === true` and `create === null`, upgrade and persist the newly supplied `create` metadata before starting sync so deferred creation succeeds once online.

### Enforced by

`packages/sync-client/test/client.test.ts`, which reopens a never-synced document with a `create` payload after an initial `create: null` open and verifies that `meta.create` is persisted and synced.

## Guard asynchronous HTTP refreshes with a monotonic version counter against live socket events

- Date: 2026-11-26

### What happened

`refreshDriver` fetched the current Room window driver over HTTP and wrote the response straight into the driver store. When a live WebSocket `CONTROL` (`driver_changed`) event or a local Take/Release transition landed while the HTTP request was still in flight, the slower HTTP response resolved afterward and overwrote the newer live driver state.

### How it was caught

By concurrency review of the Room window driver store in `apps/web/src/room/driver.ts` under overlapping HTTP refresh and socket control frames.

### Rule

Whenever client state combines initial or periodic HTTP fetches with live WebSocket control events or local mutations, maintain a monotonic version counter per entry, capture it before starting the fetch, and discard the HTTP response if the version advanced while the request was in flight.

### Enforced by

`apps/web/test/driver.dom.test.ts`, which races a delayed `refreshDriver` HTTP response against a live `driver_changed` control event and local take/release transitions, verifying that stale responses never overwrite newer state.

## Validate CRDT trash fields and cross-workspace lookups against server-held state

- Date: 2026-11-26

### What happened

Client pushes to workspace and private index CRDT maps could set, alter or re-insert server-owned `trashedAt` and `trashedByUserId` fields or delete trashed entries directly, and Trash and public API lookups risked trusting unverified index references across workspaces or tombstoned indexes.

### How it was caught

By security review of `packages/server-core/src/library/` and `packages/server-core/src/public-api/scope.ts` tracing untrusted CRDT index pushes and workspace-scoped lookups.

### Rule

Inspect every client CRDT push to workspace and private index maps to reject forged, altered or newly inserted server-only trash fields and deletions of trashed entries. Resolve workspace ownership and public API scope exclusively against live, non-tombstoned server-held directory state (`control.sqlite`), never scanning workspaces for `user:` homes or trusting client-claimed workspace IDs.

### Enforced by

`packages/server-core/test/trash-security.test.ts` and `packages/server-core/test/public-api-security.test.ts`, which verify that forged or re-inserted trash fields, client removals of trashed entries, tombstoned indexes and cross-workspace lookups are refused.

## Keep prompter feed hubs per service instance and re-check permissions inside the document queue

- Date: 2026-11-25

### What happened

The first draft of the prompter feed keyed active feed hubs in a module-level `WeakMap` by `Clock`, so two server instances sharing one test clock could receive each other's live snapshots. In addition, the send route checked `send_to_prompter` access before entering the document serialisation chain (`inChain`), leaving a window where revoking access while a send was queued could still let the queued send run, and did not verify access on each linked story.

### How it was caught

By security review auditing cross-instance isolation and time-of-check/time-of-use paths across `packages/server-core/src/prompter/`.

### Rule

Never store live subscription or hub state in a module-level registry keyed by a shared dependency such as `Clock`; wire subscription handlers per service instance through `SyncSettings`. Always re-check access on both the target document and any linked document inside `inChain(docId, ...)` immediately before applying or replaying a write.

### Enforced by

`packages/server-core/test/prompter-security.test.ts`, which verifies two servers sharing one `Clock` stay isolated with zero cross-server snapshots and that revoking `send_to_prompter` while a send is queued in `inChain` refuses the queued send with `403`.

## Guard wall-clock air-window timers against backwards clock jumps

- Date: 2026-11-25

### What happened

The prompter's post-window flush timer was scheduled as a relative delay to `win.endsAt` and checked only `!airWindows.isInside(rundownId, now)` when it fired. When a clock moved backwards (as when seeded history steps step to an earlier day or a host clock steps back), the timer fired days before `win.startsAt`, saw `isInside === false`, and automatically flushed pending edits to the prompter before the air window had even begun.

### How it was caught

By live demo seeding of broadcast rundowns, where stories staged as changed inside the air window unexpectedly flipped back to `On prompter` after later steps moved the seed clock to earlier days.

### Rule

Whenever a scheduled callback acts on leaving a wall-clock window (`endsAt`), verify `now >= win.endsAt` (and explicitly skip when `now < win.startsAt`) rather than inferring window expiry solely from `!isInside(now)`.

### Enforced by

`packages/server-core/test/prompter-security.test.ts`, which steps the clock backwards before `win.startsAt` and verifies changed rows remain unsent while normal post-window expiry still flushes.

## Client undo on authority-enriched CRDT maps must never re-emit server-only keys

- Date: 2026-11-25

### What happened

Server-computed rundown fields (`durationMs` and `prompter`) live alongside client-edited keys on each row map, and the server refuses any client push that writes them. Using `Y.UndoManager` directly to undo a row deletion cloned the entire deleted row map—including those server-only keys—so undoing a deleted row produced a client push the server refused.

### How it was caught

By cross-package review tracing `packages/crdt/src/rundown/rundown-undo.ts` against the server push validator in `packages/server-core/src/rundown/validate.ts`.

### Rule

When a CRDT map mixes client-owned and server-only keys, client undo and redo must re-insert only an explicit allow-list of client-owned keys and let the server's commit hook recompute authority fields afterward.

### Enforced by

`packages/crdt/src/rundown/rundown-undo.ts` (allow-listed client keys on undo/redo) and `packages/server-core/test/rundown-guards.test.ts` (verifying the server refuses client writes to server-only keys and invalid rundown root fields).

## New SQLite indexes belong in a new numbered migration, never an earlier one

- Date: 2026-11-25

### What happened

Eight new `CREATE INDEX IF NOT EXISTS` statements were added inside historical migrations 4, 5 and 6 while leaving `STORAGE_SCHEMA_VERSION` at 9. Because `migrate()` exits immediately when `user_version` already equals `steps.length`, every existing SQLite database upgraded from version 9 skipped all eight indexes silently.

### How it was caught

By senior code review checking migration placement against `packages/storage/src/sqlite/files.ts` and `packages/storage/src/sqlite/migrations.ts`.

### Rule

Never edit an earlier migration step after it has merged. Append a new numbered migration entry across all three migration lists (`control`, `documents`, `checkpoints`) and bump `STORAGE_SCHEMA_VERSION` so existing databases receive the change on open.

### Enforced by

`packages/storage/test/schema-golden.test.ts`, which pins the schema at version 10 and tests upgrading an existing version 9 database to version 10 with all eight new indexes created.

## Unhashed service worker assets must never use CacheFirst in an unversioned cache

- Date: 2026-11-25

### What happened

Removing `/ink-compile.worker.js` from the revisioned precache manifest and matching all `.js` files with a `CacheFirst` route in a static `manent-runtime-assets-v1` cache would have pinned the first-visited Ink worker permanently across deploys and accumulated stale hashed chunks without cleanup.

### How it was caught

By senior code review tracing unhashed worker URLs and cache lifecycles across `apps/web/build.ts`, `apps/web/src/sw/precache.ts` and `apps/web/src/sw/worker.ts`.

### Rule

Restrict `CacheFirst` runtime caching to content-hashed asset URLs (`-[a-z0-9]{8}\.`), serve unhashed workers `NetworkFirst`, version runtime caches with the build ID (`__BUILD_ID`), and prune older runtime caches during the service worker `activate` event.

### Enforced by

`apps/web/test/sw-manifest.test.ts` and `apps/web/test/build.test.ts`, which verify hashed `CacheFirst` matching, `NetworkFirst` routing for the unhashed Ink worker, exclusion of the service worker and API routes, and deletion of older versioned runtime caches on activation.

## Never reuse Yjs client IDs across sessions or downgrade primary SQLite durability defaults

- Date: 2026-11-25

### What happened

An attempt to reuse the last persisted Yjs `clientId` on document reopen could collide with server-reserved IDs (`reserveClientId`) and still-live follower tabs, risking silent CRDT item-ID collisions. Separately, flipping `openDatabase()`'s default durability from `"full"` to `"normal"` silently removed `synchronous = FULL` and macOS `fullfsync` from primary `control.sqlite` and project document logs.

### How it was caught

By senior code review auditing CRDT client-ID lifetimes across `packages/sync-client` and SQLite pragma defaults across `packages/storage`.

### Rule

Always mint a fresh Yjs `clientId` per session; keep `openDatabase()` defaulting to `"full"` durability and opt into `"normal"` or `"off"` explicitly only for reconstructible derived caches (`.checkpoints.sqlite`, `search.sqlite`) or disposable staging directories.

### Enforced by

`packages/sync-client/test/client.test.ts` (asserting one fresh client ID per session, never reused) and `packages/storage/test/queries.test.ts` (querying live `PRAGMA synchronous`, `fullfsync`, `cache_size` and `temp_store` values for primary, checkpoint and staging databases).

## ProseMirror DecorationSet.find is inclusive at both ends

- Date: 2026-11-25

### What happened

`redrawChanges` in `packages/editor/src/changes/decorations.ts` called `mapped.find(start, end, ...)` and filtered `.filter((d) => d.from >= start)` to protect the node decoration of the preceding block (`first - 1`), but did not filter `d.to <= end`. When the block immediately following a replaced range shared a boundary at `end`, `find` returned its `Decoration.node` and stripped it while leaving its inner inline decoration behind.

### How it was caught

By the fast-check property test in `packages/editor/test/changes-plugin.test.ts` during full verification (`bun run verify`).

### Rule

When removing decorations inside a half-open block range `[start, end)` from `DecorationSet.find(start, end)`, filter both `d.from >= start` and `d.to <= end` so zero-width widgets at either boundary are removed while neighbouring `Decoration.node` ranges touching `start` or `end` stay intact.

### Enforced by

`packages/editor/test/changes-plugin.test.ts`, which compares incremental change decorations against a fresh full comparison across random edit and move sequences.

## Multi-column gutter markers overflowed a single-column desk gutter behind the side panel

- Date: 2026-11-25

### What happened

`--desk-gutter` remained `32px` while annotation markers sat unconditionally in column 1 (`+36px` from the sheet edge) and grew to ~50 px for mixed Comment/Note badges, with collaborator initials in column 2 (`+64px`). At `1280px` with the right side panel open, both badges collided with each other and clipped past the page desk's right edge behind the panel.

### How it was caught

By visual inspection and live browser bounding-box checks with the right side panel open.

### Rule

Keep `--desk-gutter` wide enough (`>= 96px`) to hold all visible gutter columns with breathing room, and anchor annotation badges at column 0 (`+8px` beside the sheet) whenever page-mode diff initials are absent so wide mixed badges never collide with collaborator avatars or clip off-screen.

### Enforced by

`tools/test/theme.test.ts` (asserting `--desk-gutter >= 96px`) and `packages/editor/test/annotations-plugin.dom.test.ts` (verifying column 0 in normal editing and column 1 when page-mode changes are active).

## Theme CSS styled legacy mark attributes instead of what the schema emitted

- Date: 2026-11-25

### What happened

`@manent/schema` emitted `<span data-color="...">`, `<mark data-highlight="...">`, and `<span class="caps">` for text colour, highlight, and all-caps marks, while `packages/ui/src/theme.css` only styled `[data-ink="..."]` and `[data-hl="..."]` and defined no `.caps` rule at all. Selecting any text colour or all-caps did nothing visually, and every highlight colour fell back to the browser's default bright yellow `<mark>` fill with black text.

### How it was caught

By selecting text in the live editor and applying text colours, highlights, and secondary formatting through the selection bubble menu.

### Rule

Every DOM attribute or class emitted by `MARK_SPECS` in `@manent/schema` must have a matching, tested rule in `packages/ui/src/theme.css` (and `PAGE_CSS` where layout depends on it), and `<mark>` elements must reset browser default `color` (`color: inherit`) so dark paper and combined text colours stay legible.

### Enforced by

`tools/test/theme.test.ts` and `packages/editor/test/page-styles.test.ts`, which assert rules for all five `[data-color]` values, all five `[data-highlight]` values, `mark[data-highlight]`, `.caps`, and `strong`, plus ≥ 4.5:1 AA contrast across every colour/highlight combination.

## Putting secondary badges inside a truncated heading clipped them and hid menu updates

- Date: 2026-11-25

### What happened

In the Scenes and Chapters list, writer assignment, scene progress, and open-comment counts were appended inline inside a single truncated heading span, and scene progress was only read when a writer was also assigned. On any normal-length chapter or scene title, CSS truncation clipped the badges completely off the edge, making Writer and Progress menu choices look like no-ops.

### How it was caught

By user testing of the Chapters row menu (`Writer` and `Progress`) and tracing `assignmentSceneMarks` through `SceneTitle` and `Row`.

### Rule

Place secondary status, assignment, and count tags in a dedicated metadata line or card footer outside `.truncate` and `line-clamp-*` title wrappers, and render independent states (such as scene progress without an assigned writer) from the union of their underlying maps.

### Enforced by

`apps/web/test/scene-row-menu.dom.test.tsx`, which asserts that progress renders without a writer and that assignment and open-comment tags sit outside the truncated heading in both List and Cards views.

## Portalled context menus inside a virtualised list lost arrow keys to the list behind them

- Date: 2026-11-25

### What happened

React synthetic `keydown` events bubble through the component tree even across DOM portals. Opening a right-click `ContextMenu` mounted inside `VirtualRows` caused the first ArrowDown press in the menu to reach `VirtualRows.onKeyDown`, where the target had no `[role="listitem"]` ancestor, so the list computed index 0 and yanked focus out of the menu back to the first row.

### How it was caught

By auditing keyboard navigation of the Scenes row context menu against `VirtualRows.keyTarget`.

### Rule

A container keyboard handler that manages focus among its children ignores events whose DOM target is not contained within `event.currentTarget` (and ignores non-item descendants when a child overlay owns keys).

### Enforced by

`apps/web/test/scene-row-menu.dom.test.tsx`, which dispatches arrow keys from a portalled menu inside `VirtualRows` and verifies that list focus never moves.

## Overlay scrollbars report zero layout width and were covered by edge-anchored labels

- Date: 2026-11-25

### What happened

The scrolling page indicator (`Page 9 of 291`) computed the scroller's right edge from `clientWidth` and added a 4 px gap. On macOS with overlay scrollbars, `offsetWidth === clientWidth` while the OS paints a 15 px scrollbar thumb inside the right edge during scrolling, so the indicator sat directly on top of the scrollbar thumb and poked past the top edge of long books.

### How it was caught

By visual inspection while scrolling a 291-page book in dark mode.

### Rule

Any floating indicator anchored beside a scroller's inline-end edge reserves overlay scrollbar width (16 px) whenever `offsetWidth - clientLeft - clientWidth === 0`, clamps its vertical coordinate inside the scroller's bounds, and uses overlay tokens (`bg-overlay`, `border-line`, `text-fg`) rather than inverted foreground/background fills.

### Enforced by

`apps/web/test/thumb-label.dom.test.ts`, which verifies overlay scrollbar clearance, classic scrollbar clearance, covering panel clearance, vertical clamping, and overlay tokens.

## Shared origin storage leaked per-tab Tour chrome into companion windows

- Date: 2026-11-25

### What happened

Persisting the active Tour scenario and step in `localStorage` caused multi-window Tour scenarios (`window.open("...?person=...&panels=closed")`) to hydrate the opener's active Tour step inside the companion window and draw a floating Tour bar and ring over the wrong tab. Even moving to `sessionStorage` required suppressing cloned tab storage on `?panels=closed` windows because `window.open` copies the opener's `sessionStorage`.

### How it was caught

By multi-lens code review of the Tour redesign before merge.

### Rule

Per-tab interface session state belongs in `tabStorage` (`sessionStorage`), never origin-wide `localStorage`, and companion windows opened with `?panels=closed` suppress and clear cloned Tour step storage before hydration.

### Enforced by

`apps/web/test/tour-redesign.dom.test.tsx`, which verifies reload restoration via `tabStorage` and asserts that a suppressed `?panels=closed` window clears cloned storage and draws no floating bar.

## A demo reset reloaded a pre-reset document path and dropped the next person on no access

- Date: 2026-11-25

### What happened

Both `useResetting` and `followSeed` called `location.reload()` after a demo reset or server reseed. When a tab had been sitting on a pre-reset script URL (`/s/<id>`), clearing Manent's session redirected to `/choose?next=%2Fs%2F<id>`, so whoever signed in next landed straight on `"You no longer have access"` for a wiped or private script.

### How it was caught

By clicking Reset in the demo bar while on a script and choosing another person after reload.

### Rule

Reloading the app after a demo reset or seed change navigates cleanly to `/` (`reloadAtHome`) whenever the tab is not already on the bare root path, so stale document or project URLs never survive across a reseed.

### Enforced by

`apps/web/test/resetting-screen.dom.test.tsx`, which verifies `reloadAtHome` replaces non-root paths with `/` and reloads only when already on `/`.

## A screen took focus from the open command palette

- Date: 2026-11-21

### What happened

On a slow machine the Library or a script could finish drawing after the person had already opened the command palette. The screen's heading then took focus in the middle of the query, so the rest of what was typed, and the Enter, went to the heading instead. A fast machine never showed it.

### How it was caught

An end-to-end test that picks a theme from the palette failed in Firefox on the Linux and Windows CI runners. It failed locally too once the machine was under full load (6 of 20 runs), and a probe that logged focus and keystrokes showed the heading taking focus mid-query.

### Rule

A screen moves focus on arrival only when nothing above it holds focus: while the palette is open it waits, and takes focus when the palette closes. A test that fails only on CI is run under load before it is called a timing problem, because a slow machine is where a person meets the race.

### Enforced by

`apps/web/test/library.dom.test.tsx`, which draws the Library while the palette is open and expects focus to stay in the palette's field.

## A test typed into a page that could not take keys yet

- Date: 2026-11-21

### What happened

A script's page stays hidden until its fonts have loaded, and a hidden page takes no focus. The end-to-end helper that opens a script resolved as soon as the editor was registered, so on a slow machine it placed the caret while the page was still hidden: focus stayed on the title heading and every key the test typed went to the heading's menu. Tests of Enter, Tab and the element picker failed in Firefox on CI. A person could not meet it, since nobody types into a page they cannot see, but it cost a round of CI repairs.

### How it was caught

By the CI failures, reproduced under load (11 of 180 runs failed before the fix, none of 360 after).

### Rule

A test helper waits for what a person waits for, the page shown and able to take keys, and never for an internal signal that comes earlier, such as a component being registered.

### Enforced by

`e2e/editor/support.ts`, whose open waits until the page is shown, and a test in `e2e/editor/typing.e2e.ts` that holds the font files unanswered and types once the page is drawn in the fallback face.

## Tests that fit in five seconds here ran out of time on slower runners

- Date: 2026-11-21

### What happened

Four tests passed on the machine where they were written and ran past Bun's default limit of five seconds per test on a slower CI runner: two property checks of the editor's pagination and change tracking, a scroll check on a 2,000-page script that took 5.4 seconds, and a check of the demo's phrase banks that re-read every other bank for each one, so its cost grew with the square of the banks' size.

### How it was caught

By the CI runners, each time on a different test.

### Rule

A test whose work is large states its own time limit, sized for a slow machine. Before raising a limit, check that the cost grows as the work does: a check that re-reads everything for every item is fixed, not given more time.

### Enforced by

Nothing yet beyond CI on three systems, `.github/workflows/ci.yml`; no check reads a test's limit against its work.

## A path written with backslashes on Windows broke a build and two tests

- Date: 2026-11-20

### What happened

Three times, code compared or listed paths that held forward slashes on macOS and Linux and backslashes on Windows. The size test lost its exemption for test files, because it split each path on a forward slash. The web build stopped on Windows, because its list of files to precache compared each output path with the build folder joined by a slash, and every file fell outside it. A test of the desktop node's store listed its files with backslashes and no longer matched its expectation.

### How it was caught

By the Windows job of the CI workflow, each time after the change had merged.

### Rule

A path that is compared, listed, stored or turned into a URL is first written with forward slashes; only a call to the file system takes the platform's own form.

### Enforced by

`apps/web/test/sw-manifest.test.ts`, which builds the precache list from backslash paths, and the Windows job in `.github/workflows/ci.yml`.

## Branches that each passed the gate failed it together

- Date: 2026-11-20

### What happened

Phrase banks for the demo's projects were written on separate branches at once, and each branch's check held its bank to its own voice. Merged, eleven lines turned out to stand in two banks, which the check of every bank against the others refuses. The same day a branch that kept the web app's entry chunk under its 150 KB budget, merged onto a `main` that was also under it, came out at 150.50 KB, and `main` was reset to its last passing commit.

### How it was caught

By running `bun run verify` on the merge result before it stayed on `main`.

### Rule

A check over the whole tree, such as uniqueness across files or the size of a bundle, is judged on the merge result, never on a branch alone. Every merge to `main` is followed by the gate, and a merge that fails it is fixed or undone at once.

### Enforced by

`packages/demo/test/banks-all.test.ts` and `apps/web/test/build.test.ts`, run by `bun run verify` after every merge.

## A font-loaded check said yes for a font nobody had declared

- Date: 2026-11-17

### What happened

A guard was meant to stop browser measurements of line wrapping unless the script font had loaded, because a fallback font has other widths and would make every result wrong. It used the browser's font-check call, `document.fonts.check()`. In Chromium, Firefox and WebKit that call answers true for a family with no declaration at all, so a missing stylesheet or a misspelt family name would have passed. A near-miss: the guard never reached `main`.

### How it was caught

By running the guard in all three engines on a page that declared no such font, before any measurement relied on it.

### Rule

To know a font is ready, load each face and inspect what comes back: every face asked for must return a loaded face of that family. A check is run once on an input where it must fail before it is trusted.

### Enforced by

Nothing yet. The browser harness for pagination will carry the guard.

## A cut-off CRDT update can be half applied

- Date: 2026-11-17

### What happened

Applying a truncated update to a bare Yjs document changed the document in 11 of the 79 cut positions tried, instead of refusing the bytes. A client that received a cut-off message could have been left holding part of someone's edit. A near-miss: it never reached `main`.

### How it was caught

By a test written before the code, which cut a real update at every position and applied each prefix.

### Rule

An update is decoded in full before it is applied, and applying it is all or nothing: `applyUpdate` in `@manent/crdt` refuses bytes that do not decode and leaves the document as it was.

### Enforced by

`packages/crdt/test/updates.test.ts` — "any prefix of a real update applies or changes nothing".

## Inserted text took on its neighbour's formatting

- Date: 2026-11-17

### What happened

The CRDT gives inserted text the formatting around it. Text inserted inside a bold or suggested run, by a writer or by a write made on someone's behalf, would silently have joined that run. A near-miss: it never reached `main`.

### How it was caught

A test that pins the library's own behaviour was written before the CRDT writer, and it showed the inheritance.

### Rule

A writer names every attribute in effect at the offset where it inserts, and clears those it does not want, so inserted text carries exactly the marks it was given.

### Enforced by

`packages/crdt/test/writer.test.ts` — "text inserted with no marks inside a suggested run is plain".

## One suggestion written in two forms became two marks

- Date: 2026-11-17

### What happened

Marks that may overlap are stored under a key derived from the mark's attributes. Computed from the attributes as a writer handed them over, a defaulted attribute left out or keys in another order gave a second key for the same suggestion. A merge of two valid documents could then hold two equal marks on one stretch of text, which validation refuses and the loader cannot read. A near-miss: it never reached `main`.

### How it was caught

In code review of the validator, before the CRDT package was written.

### Rule

A key, hash or identity is computed from the canonical form of what it identifies: every declared attribute present, defaults filled in, in the declared order.

### Enforced by

`packages/crdt/test/mapping.test.ts` — "the storage key of a suggestion does not depend on how the mark was written down".

## An attribute stored as an object is rewritten on every keystroke

- Date: 2026-11-17

### What happened

A suggested change to a block was first planned as one attribute holding an object. When the CRDT's ProseMirror binding rewrites a block, it checks each attribute with an identity comparison. An object fails that check every time, so each keystroke in the block would store it afresh under the typist's name and overwrite the author it recorded, which the server has to verify. A near-miss: it never reached `main`.

### How it was caught

By reading the binding's source before the schema was written.

### Rule

Block attributes are scalars; a suggested change is four of them. The cost: each scalar is its own last-writer-wins value, so if two people suggest a change to one block simultaneously, the four values can end up from different people.

### Enforced by

`packages/schema/test/validate.test.ts` — "each kind of damage is named, with its severity" (an object as an attribute's value is refused).

## A test corpus without sentence punctuation never broke a page inside a block

- Date: 2026-11-17

### What happened

The page engine splits speech and action across pages only at the end of a sentence. The generated test corpus had no sentence punctuation, so in 2,414 simulated pages no break fell inside a block, and the path that splits a block across two pages would never have been timed. A near-miss: no measurement had used the corpus yet.

### How it was caught

By simulating pagination over the corpus before the measurements were run.

### Rule

Count the cases a corpus is meant to exercise before trusting it. A count of zero stops the run.

### Enforced by

Nothing yet. The corpus generator's test will count the breaks.

## An import-matching pattern ran across two statements

- Date: 2026-11-17

### What happened

The boundary check finds `import … from` with a regular expression. Its pattern could begin at an earlier statement and run on into the next, so whether an import was for types only was decided from the wrong text. That gave one false report, a correct type import flagged, and one miss, a value import let through. It reached `main` in the check's first version and was fixed in the next commit.

### How it was caught

In code review.

### Rule

A pattern over source text is bounded to one statement, and its test holds both the false report and the miss, written as adjacent statements.

### Enforced by

`tools/test/check-boundaries.test.ts` — "some imports are for types only".

## The fix for a missed match made a false match

- Date: 2026-11-17

### What happened

The boundary check missed `window?.alert` in a pure package, because it expected a dot, a bracket or a parenthesis after a forbidden global. Letting `?` follow as well caught that, and also made the check report an optional parameter or member that merely carries a global's name, such as `document?: Doc`. Known and still open; code in pure packages avoids such names meanwhile.

### How it was caught

In code review of the fix.

### Rule

A pattern fix is tested against what it must newly catch and against what it must still let through.

### Enforced by

`tools/test/check-boundaries.test.ts` — "pure packages touch neither the DOM nor Bun" (the caught case; the false match is not tested yet).

## A typing slip in a budget file made the gate pass

- Date: 2026-11-17

### What happened

The benchmark harness cast its budget file to a type instead of validating it. A misspelt field made the lookup of a budget come back empty, and the verdict for an empty budget was "pass". A row without its hard limit could never fail, and a row that matched no scenario was ignored. A near-miss: it was fixed before the harness reached `main`.

### How it was caught

In code review.

### Rule

Data that drives a gate is validated, its version and fields included, and an entry that matches nothing is a finding, never a pass.

### Enforced by

`bench/test/harness.test.ts` — "a malformed budget file stops the run and names the file and the row".

## Two documents' chunks could be spliced on one socket

- Date: 2026-11-17

### What happened

Large messages travel in chunks tagged with a message ID. Each frame encoder numbered its chunked messages itself, so two encoders sending large messages on one connection could use the same ID, and the receiver would join chunks of two documents into one message. It reached `main` with the first wire format, before any client used it.

### How it was caught

Reproduced in an audit of the wire format before any client existed. The frozen format was reopened once to fix it.

### Rule

Message IDs belong to the connection. Every encoder of a connection draws from one allocator, and a test runs two producers into one consumer.

### Enforced by

`packages/sync-protocol/test/chunking.test.ts` — "two encoders on one connection never share a message ID".

## Containment CSS sent the caret to the end of the document

- Date: 2026-11-17

### What happened

With `content-visibility: auto` on sections of blocks, three engines misbehaved in three ways. In Chromium, an arrow key pressed while the caret's neighbouring sections were not rendered moved the caret hundreds of thousands of characters, to the last section of the document. WebKit moved a selection that code had set inside a section never rendered. In Firefox, explicit `contain` on a section stopped the arrow keys crossing a section boundary. A near-miss: no product code uses sections yet.

### How it was caught

In a throwaway prototype run in the three engines (their test builds, on one operating system), comparing every check with a flat document.

### Rule

The four safeguards of decision 0015, and no explicit `contain` on a section.

### Enforced by

Nothing yet. The editor's browser tests will hold these cases.

## Typing lag came from the interface and whole-document walks, not the editor core

- Date: 2026-11-17

### What happened

Typing lag is easily blamed on the editor core. In this project's prototype, ProseMirror's own share of a keystroke was small: about 1.3 ms of 18 ms in a flat 1,000-page document, the rest being the browser's own editing, style and layout. A near-miss: nothing had yet been optimised in the wrong place.

### How it was caught

By measuring where a keystroke's time goes before optimising anything.

### Rule

Decision 0031: the interface does not render on editor transactions, and a plugin that walks the whole document on a transaction is a defect.

### Enforced by

Nothing yet. The benchmark's typing budget will.

## Containment on every block was slower than none

- Date: 2026-11-17

### What happened

`content-visibility: auto` on each of 25,000 blocks cost more per keystroke than no containment: about 30 ms against 18 ms in a flat 1,000-page document, and scrolling fell to frames of about 49 ms. On wrappers of about 25 blocks it cut the keystroke from about 18 ms to 1.4 ms, about twelve-fold, and a later sweep found about 100 blocks per wrapper faster still at 2,000 pages. Prototype, headless Chromium, one machine. A near-miss: no product code did this.

### How it was caught

By measuring each variant in a throwaway prototype before choosing one.

### Rule

Contain groups of about 100 blocks, never single blocks.

### Enforced by

Nothing yet.

## A decoration at the document root is paid for on every keystroke

- Date: 2026-11-17

### What happened

ProseMirror maps the decorations of a set on every transaction. A stand-in for pagination that put a break widget for every page in the root set cost ProseMirror about 1.8 ms per keystroke at 120 pages and 58 ms at 1,000, with the CPU throttled four times. One node decoration per section, setting its height, cost about 8 ms per keystroke at 2,000 sections. Prototypes, one machine. A near-miss: no product code did this.

### How it was caught

In throwaway prototypes that measured each placement before pagination was designed.

### Rule

Decorations live inside sections, in per-section sets, never in one set at the root. A section's height is set by its node view.

### Enforced by

Nothing yet.

## A pattern literal can blind a text scanner

- Date: 2026-11-17

### What happened

The boundary check masks comments and strings before it looks for imports, and it does not understand regular-expression literals. A literal holding a quote, a backtick or the two characters that open a block comment can make it read the rest of the file as a string or a comment and blank it, so the imports below are never checked. A limit of how the check reads source, found before it hid a violation.

### How it was caught

In code review of the check.

### Rule

Build such a pattern with `new RegExp("…")`, never as a literal.

### Enforced by

Nothing yet. The limit is stated at the top of `tools/source-scan.ts`.

## A script named after a built-in command replaces it

- Date: 2026-11-17

### What happened

Bun runs a package script in place of its own command when the two share a name. Scripts called `check` or `fmt` would have made `bun check` and `bun fmt` run those scripts instead of Bun's own type checker and formatter. A near-miss: the scripts never had those names.

### How it was caught

Noticed while the scripts were named.

### Rule

A script never takes the name of a command of the tool that runs it. The gate is `verify`, and its steps are `typecheck` and `format`.

### Enforced by

Nothing yet.

## A duration written as a string was refused

- Date: 2026-11-17

### What happened

The minimum release age written as `"3d"` was refused by an earlier release of the package manager. Had it been written that way here, an install with that release would have stopped. A near-miss: the setting was written as a number from the start.

### How it was caught

By writing the setting in integer seconds before the first install; `tools/test/workspace.test.ts` pins it.

### Rule

Durations in configuration are integer seconds: `minimumReleaseAge = 259200` in `bunfig.toml`.

### Enforced by

`tools/test/workspace.test.ts` — "minimumReleaseAge is three days in integer seconds".

## A version chosen on paper was too new to install

- Date: 2026-11-17

### What happened

Three versions named while the work was planned were less than three days old when it started, and the installer refused them under the project's own release-age rule. An older patch release of each was used instead. A near-miss: the refusal came before anything depended on the newer versions.

### How it was caught

By trying the install under the rule before the work started.

### Rule

A version is pinned only after an install under the rule succeeds, and the version that install chose is the one written down.

### Enforced by

Nothing yet.

## A check that names what is private is itself the leak

- Date: 2026-11-17

### What happened

The first idea for keeping private folders out of the repository was a check that listed them by name. That list, in a tracked file, would have published the very names it was meant to hide; the same holds for an ignore file or a lint configuration that names them. A near-miss: no such list was written.

### How it was caught

While the check was being designed.

### Rule

An allow-list for paths (decision 0002). Private words are read from the maintainer's machine, never from a tracked file.

### Enforced by

`tools/test/check-tracked.test.ts` — "only the public tree may be tracked".

## A timing taken on a busy machine is not a measurement

- Date: 2026-11-17

### What happened

While other work ran, the machine's load stood at the limit agreed for timed runs, and a timing harness adds load of its own: a browser under CPU throttling, or a container on two cores, can push the load over the limit by itself. A row timed under such load looks like a real result. A near-miss: no timed run had been made yet.

### How it was caught

By reading the machine's load before the first timed run, and in review of how the runs would be timed.

### Rule

A timed run records the machine's load, a run above the limit is void, and a check that could not run is reported as not run, never as passed.

### Enforced by

Nothing yet. The benchmark harness does not record load yet.

## A check that read Markdown as plain text misread tables and code samples

- Date: 2026-11-17

### What happened

While the check of the public records was being written, a table header that it matched as plain text stopped matching once the formatter padded the table's cells, and a link shown inside a code span, as an example, was reported as a link to a missing file. A near-miss: both were found before the check was committed.

### How it was caught

By running the check on documents that had been through the formatter, before committing it.

### Rule

Compare table cells, not lines, and ignore structure inside code spans and fenced blocks.

### Enforced by

`tools/test/check-records.test.ts` — "link syntax inside code is not a link".
