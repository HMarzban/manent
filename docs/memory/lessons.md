# Lessons

Mistakes and near-misses, newest first, each with the rule that now prevents it. Read the ones that touch your change before you start. Add one when a review finding or an incident shows a class of mistake, not a single slip.

Each lesson has a title, a date and four parts: what happened, how it was caught, the rule, and what enforces the rule. "Enforced by" names the check or test file in backticks, or begins "Nothing yet" and says what will. A lesson is not rewritten after it merges, except to fix a typo or to update "Enforced by" when a check arrives.

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
