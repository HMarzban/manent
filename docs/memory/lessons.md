# Lessons

Mistakes and near-misses, newest first, each with the rule that now prevents it. Read the ones that touch your change before you start. Add one when a review finding or an incident shows a class of mistake, not a single slip.

Each lesson has a title, a date and four parts: what happened, how it was caught, the rule, and what enforces the rule. "Enforced by" names the check or test file in backticks, or begins "Nothing yet" and says what will. A lesson is not rewritten after it merges, except to fix a typo or to update "Enforced by" when a check arrives.

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
