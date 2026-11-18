# Architecture overview

How Manent is put together, and why. Read this first; [layers.md](layers.md) has the dependency rules in full and [repository.md](repository.md) has the folder outline and commands.

**Status as of 2026-11-18.** Most of the system is not written yet. Every part below carries one of three marks, checked against the `main` branch:

| Mark            | Meaning                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **built**       | On `main`, with tests, passing the quality gate                                                              |
| **in progress** | Partly on `main`: some of what the part is for exists, the rest is planned                                   |
| **planned**     | Decided, not written. The package exists as an empty entry point so the dependency rules already apply to it |

Numbers quoted as evidence come from throwaway prototypes on one machine. Each says what it did not cover. None is a benchmark result; the benchmark suite that will replace them has a harness and no scenarios yet.

## 1. What the system is

What it is being built to be; the parts below mark how much of it exists.

1. A script-writing app for film, series, shows, news, podcasts and books: true script pages, several people in one document, version history and production revisions.
2. It works offline. An edit is kept on the device first and sent when there is a connection; nothing that was acknowledged is lost.
3. The editor is plain ProseMirror. Merging is done by a CRDT (Yjs) that exactly one package is allowed to import.
4. One server program (Bun, SQLite) is the authority for every synced document: it orders, checks, stores and publishes edits.
5. It is delivered as a demo that runs on one machine. The same server program is meant to run inside the desktop app and, later, on a host.

## 2. The system in one diagram

```text
 BROWSER TAB (apps/web)                            DESKTOP APP (apps/desktop)       [planned]
 ┌────────────────────────────────────────┐        ┌──────────────────────────────────────┐
 │ React screens             [in progress]│        │ shell: window, menus, updater        │
 │ editor: ProseMirror view      [planned]│        │ the same web bundle in the window    │
 │   schema · keymaps · CRDT binding      │        │ sync-client ──ws──► LOCAL NODE       │
 │   pagination     → decorations         │        │   a Bun process, loopback only       │
 │   revision marks → decorations         │        │   SQLite files: the durable store    │
 │ sync-client: outbox, states   [planned]│        │   relay to the authority ─────┐      │
 │ local store: IndexedDB        [planned]│        │   authority only for a script │      │
 │ service worker: app shell     [planned]│        │   that was never synced       │      │
 └──────────────┬─────────────────────────┘        └───────────────────────────────┼──────┘
                │ HTTP: sign-in, session                         [built]           │
                │ WebSocket: one binary socket, all documents    [in progress]     │
                ▼                                                                  ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ SERVER PROGRAM (apps/server → server-core), one Bun process                            │
 │ the authority for every synced document                                                │
 │   HTTP routes · static web app · sign-in · sessions · bind-address check               │
 │   · socket: tickets and handshake                                          [built]     │
 │   rooms: one in-memory document per active script                          [planned]   │
 │   write path: limits → identity → apply → validate → append + commit                   │
 │               → acknowledge → publish                                      [planned]   │
 │   versions · revisions · rebuilds · export                                 [planned]   │
 └──────────────┬─────────────────────────────────────────────────────────────────────────┘
                ▼
   SQLite files: one for accounts and sessions, one per user, one per project   [planned]
```

What runs where:

| Setting            | Clients                                                             | Server program                                                                                                    | Storage                                                                                              | Status                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo, one machine  | Browser tabs on `http://localhost:4747`; each tab is its own person | Started on the same machine; plays the authority's role; listens on loopback only                                 | A data folder beside the code (`.manent-demo/`): the key that signs sessions and the seed's manifest | **in progress**: `make demo` installs, builds, seeds the people and the empty workspaces, starts the server under a supervisor and opens the chooser; the editor does not exist yet |
| Demo, two machines | A second machine on the same private network                        | Also listens on one private-range address; refuses a public or wildcard address because the demo has no passwords | Same                                                                                                 | **in progress**: `make demo LAN=1` listens on one private address as well; not yet tried from a second machine                                                                      |
| Desktop            | The app's own window                                                | A local node inside the app on loopback: durable store and relay. The authority stays the server                  | SQLite in the system's app-data folder                                                               | **planned**                                                                                                                                                                         |
| Hosted             | Browsers and desktop apps                                           | The same program behind a TLS-terminating proxy                                                                   | The same files, plus off-machine backup                                                              | **planned**, not in this release                                                                                                                                                    |

The demo replaces only sign-in. Sync, the write path and recovery are meant to be the real ones running locally, not a mock.

## 3. Layers

Dependencies point down this diagram; no edge points up. The layers and the per-package rules are data in `tools/boundaries.config.ts`, and [layers.md](layers.md) reads them out in full.

```text
 Presentation and composition   ui · demo · web · server · desktop                            screens, demo content, entry points
 Application                    crdt-binding · editor · commands                              editing and the commands behind it
 Services                       sync-client · client-web · storage · server-core · local-node    sync, storage, the authority
 Domain engines                 pagination · revisions · crdt · formats                       the document's rules, as libraries
 Kernel                         schema · settings · sync-protocol · perf                      shared values and rules
 Tooling                        testkit · bench · e2e · tools                                 outside the layers
```

| Layer                        | May import today                                                                                                                                                                                         | Must never know about                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kernel                       | No internal package. `schema` may import `prosemirror-model` and `sync-protocol` may import `lib0`; `settings` and `perf` import nothing                                                                 | The DOM, Bun or Node, sockets, storage                                                                                                                                                                                                                                                                                                               |
| Domain engines               | The kernel, and each other as listed per package: `revisions` → `pagination`; `formats` → `pagination` and `revisions`                                                                                   | Sockets and databases. `pagination`, `revisions` and `crdt` are pure; `formats` imports no Bun or Node built-in. `crdt` is the only importer of `yjs` and `y-protocols`; `pagination`, `revisions` and `formats` never see the CRDT                                                                                                                  |
| Services                     | The layers below, as listed per package; `client-web` also `sync-client`; `server-core` also `storage` (types only); `local-node` also `server-core`, `sync-client` and `storage`                        | The application and presentation layers. `sync-client` is pure and reaches the network, storage and time only through its ports. Only `storage` and `local-node` import `bun:sqlite`; in `server-core` only the HTTP edge names Bun. `server-core` and `local-node` return handlers and never open a port (a convention; the check does not test it) |
| Application                  | `crdt-binding`: `crdt`, `schema`, and `editor` for types only. `editor`: `schema`, `pagination`, `revisions`, `perf`, and `settings` for types only. `commands`: `settings`                              | The network and storage. `crdt-binding` is the only importer of `y-prosemirror`; `editor` never imports the CRDT. `commands` is pure                                                                                                                                                                                                                 |
| Presentation and composition | `ui`: `commands`, `settings`, `perf`. `demo`: `schema`, `crdt`, `sync-protocol`, `sync-client`, and `server-core` for types only. The three apps: the packages their rows in [layers.md](layers.md) list | Each other: nothing imports an app. `ui` knows no document. `ui`, `demo` and `web` import no Bun or Node built-in; in `web` only the editor host may take values from `editor` or `crdt-binding`                                                                                                                                                     |
| Tooling                      | Any package                                                                                                                                                                                              | `bench`, `e2e` and `tools` are never imported; only test code and tooling import `testkit` or a package's `./testing` entry                                                                                                                                                                                                                          |

Every workspace, its layer, its job and its status:

| Package         | Layer                        | Responsibility                                                                                                                                                                                                         | Status                                                                                                                                                                                                 |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema`        | Kernel                       | Document schema, element and format lists, block attributes and their defaults, block identity rules, validation with severities, the repairs any client may make, a canonical JSON form and a flat view of the blocks | **built**                                                                                                                                                                                              |
| `settings`      | Kernel                       | The settings registry: definitions, validation, resolution, store                                                                                                                                                      | **planned**                                                                                                                                                                                            |
| `sync-protocol` | Kernel                       | Binary frame codec, message types, chunking, version gating, error codes, and the bodies of the HTTP routes as shared types                                                                                            | **built**                                                                                                                                                                                              |
| `perf`          | Kernel                       | Timing marks that ship in the product build, off until switched on, in a fixed ring buffer                                                                                                                             | **built**                                                                                                                                                                                              |
| `pagination`    | Domain engines               | Pure page engine: width tables, line wrap, break rules, positioned lines                                                                                                                                               | **planned**                                                                                                                                                                                            |
| `revisions`     | Domain engines               | Block-aligned diff, three-way merge per block, revised lines, page labels, scene numbers                                                                                                                               | **planned**                                                                                                                                                                                            |
| `crdt`          | Domain engines               | The only package that imports Yjs: documents, the script body as a view, writes addressed to a block, all-or-nothing updates                                                                                           | **built**                                                                                                                                                                                              |
| `formats`       | Domain engines               | Import and export: PDF from engine output, and the interchange formats                                                                                                                                                 | **planned**                                                                                                                                                                                            |
| `sync-client`   | Services                     | Connection state machine, outbox, local-store and transport ports                                                                                                                                                      | **planned**                                                                                                                                                                                            |
| `client-web`    | Services                     | The sync client's browser drivers: socket, IndexedDB store, leader tab                                                                                                                                                 | **planned**                                                                                                                                                                                            |
| `storage`       | Services                     | Storage ports and their SQLite driver                                                                                                                                                                                  | **planned**                                                                                                                                                                                            |
| `server-core`   | Services                     | `createServer()`: HTTP routes, sign-in, sessions, the socket; later rooms, the write path, versions, revisions, rebuilds                                                                                               | **in progress**: HTTP, sign-in, sessions, bind check, static files, and a socket that takes a one-use ticket and answers the version handshake; there are no rooms, so every document frame is refused |
| `local-node`    | Services                     | Desktop: loopback service, durable store, relay to the authority, first-sync hand-off                                                                                                                                  | **planned**                                                                                                                                                                                            |
| `crdt-binding`  | Application                  | The binding between the CRDT and the editor                                                                                                                                                                            | **planned**                                                                                                                                                                                            |
| `editor`        | Application                  | ProseMirror plugins, keymaps, decorations                                                                                                                                                                              | **planned**                                                                                                                                                                                            |
| `commands`      | Application                  | The command registry: definitions, key bindings, the menu model                                                                                                                                                        | **planned**                                                                                                                                                                                            |
| `ui`            | Presentation and composition | Design tokens, components, shared widgets                                                                                                                                                                              | **planned**                                                                                                                                                                                            |
| `demo`          | Presentation and composition | Demo people and workspaces, the demo sign-in, the Tour's format and content, the seed generator                                                                                                                        | **in progress**: people, workspaces, sign-in, the Tour format and its checker, a seed with the people and four empty workspaces; no seeded scripts                                                     |
| `web`           | Presentation and composition | Screens and routes                                                                                                                                                                                                     | **in progress**: person chooser, empty Library, demo bar with the server's controls, empty Tour panel                                                                                                  |
| `server`        | Presentation and composition | Reads settings from the environment, creates the server, listens                                                                                                                                                       | **built** for what `server-core` offers today                                                                                                                                                          |
| `desktop`       | Presentation and composition | Desktop shell only                                                                                                                                                                                                     | **planned**                                                                                                                                                                                            |
| `testkit`       | Tooling                      | Fixtures, temporary trees, later the corpus generator, fuzzers and simulation                                                                                                                                          | **in progress**: temporary trees for tests                                                                                                                                                             |
| `bench`         | Tooling                      | Benchmark harness, statistics, budgets, scenarios                                                                                                                                                                      | **in progress**: harness, statistics and budget validation built; no scenarios, no budgets                                                                                                             |
| `e2e`           | Tooling                      | Browser end-to-end tests and the fresh-clone test                                                                                                                                                                      | **in progress**: smoke tests of the demo skeleton in three browsers, the fresh-clone test; no Tour scenario yet                                                                                        |
| `tools`         | Tooling                      | Boundary, tracked-files, records and Tour checks; repository tests; the demo launcher and supervisor                                                                                                                   | **built**                                                                                                                                                                                              |

## 4. Abstraction seams

Each seam is an interface with one implementation behind it today (or none yet), placed where a replacement is plausible.

| Seam               | Where           | Why it exists                                                                                                                                                                                                                                                                                                                                   | Behind it today                                                                                                                                                                                                                                                   |
| ------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRDT library       | `crdt`          | Versions, compare, restore and revisions work on materialised documents and block IDs, so they do not depend on one library's internals and survive a change of library or major version. The interface is small: apply an update, encode state, encode a state vector, diff, subscribe, materialise to editor JSON, write to a block by its ID | Interface **built** in `crdt`. The rule is **built**: the boundary check lets only `crdt` import `yjs` and `y-protocols`. Limit: the binding lives in `crdt-binding` (**planned**; `y-prosemirror` is allowed only there), the second place tied to the library   |
| Storage            | `storage`       | The server's logic is written against ports, one per aggregate, so a second driver can replace SQLite when more than one host must write                                                                                                                                                                                                        | **Planned**: ports, one per aggregate, with a `bun:sqlite` driver and an in-memory one                                                                                                                                                                            |
| Sign-in provider   | `server-core`   | The demo needs password-less people; a hosted release needs a real identity provider. Sessions, roles and authorisation should be the same code either way                                                                                                                                                                                      | **Built**: `SignInProvider` (it describes the sign-in and authenticates) and a `Directory` of people and memberships, both in `server-core`; the demo's provider lives in `demo`; a redirect-based provider adds its calls together with the code that calls them |
| Transport          | `sync-protocol` | Messages are encoded to bytes without reference to a socket, so the same protocol can run over an internet socket, the desktop app's loopback socket and an in-memory link in simulation tests                                                                                                                                                  | Codec, chunking and version gating **built**; the server's socket accepts a connection with a one-use ticket, answers the handshake and refuses document frames, because there are no rooms yet; there is no client socket                                        |
| Client local store | `sync-client`   | The outbox needs a store that records, per update, whether the authority has acknowledged it. The browser and the desktop app keep it in different places                                                                                                                                                                                       | **Planned**, in `sync-client` (the port) and `client-web` (the IndexedDB driver)                                                                                                                                                                                  |
| Desktop shell      | `apps/desktop`  | Everything the desktop app does apart from the window, menus and updater lives in `local-node`, so the shell can be replaced without touching it                                                                                                                                                                                                | **Planned**. The rule is **built**: only `desktop` may import `electrobun`. The library is declared; no shell has been written or run yet                                                                                                                         |
| Export formats     | `formats`       | Exports read the page engine's output rather than the screen, so a PDF has the same pages as the editor by construction; XML parsing goes through an adapter so the package runs in a browser and in Bun                                                                                                                                        | **Planned**                                                                                                                                                                                                                                                       |

## 5. Document model

```text
doc ── section+ ── block+ ── text*
```

- **One document per script, episode, segment or story.** A film or a book-length manuscript is one document. Projects, seasons and rundowns are small index documents that hold IDs. A client opens the index and the one to three documents on screen. _(Indexes: planned.)_
- **`section`** is an invisible container of about 100 blocks, roughly four pages. It carries no meaning and is never shown or selectable; it exists so the browser can skip off-screen content (see 8).
- **`block`** is the only content node. Its element (scene heading, action, character, dialogue and so on, 21 in all across eight formats) is the `type` attribute, not a node type. Changing an element is an attribute change, never a delete and re-insert, so text another person is typing into that block at that moment survives.
- **Nothing can be made invalid by a merge.** Every attribute has a default and no node needs more than one child. An element name written by a newer build is kept and drawn as a general block, never dropped.
- **Stable block identity.** Every block has an application-level `id`. Scene numbers, locked pages, comments and revision records are keyed by it, never by a CRDT-internal identifier, so they survive a whole-document replace, a version snapshot or a rebuild. A split keeps the ID on the first half and gives the second a new ID plus a marker naming its origin; a join keeps the earlier block; paste always creates new IDs.
- **Validation has three outcomes**, which the server's write path will use: _reject_ (structurally invalid), _newer_ (written by a newer schema: kept) and _repair_ (empty section, duplicate ID, unsafe link: put right, never refused).

The schema, attributes, identity helpers, validation and repairs are **built** in `schema`, and `crdt` keeps documents in that shape. The editor and the server's checks of an edit are **planned**.

Stored versus derived:

| Stored in the script's CRDT document                                                                             | Sequenced by the server, in SQLite, never merged                                      | Derived, never stored                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sections, blocks, text, marks, block attributes; script settings (format, paper, lines per page, engine version) | Versions, named drafts, revision sets, page-lock anchors, issued scene numbers, roles | Page breaks, page numbers, (MORE) and (CONT'D), unlocked scene numbers, revision asterisks, revised-page colours, timing, character and location lists |

The rule behind the split: anything that must be exact and mean one thing to everyone (a version, a lock, an issued number) is ordered by one authority; anything that can be computed from the document is computed, so it cannot go stale or conflict.

## 6. How a keystroke travels

All of this section is **planned**, except what it stands on, which is **built**: the frame codec in `sync-protocol`, the CRDT documents and their updates in `crdt`, and the schema the server will validate against.

```text
 editor ─► CRDT update ─► local store (outbox) ─► socket ─► SERVER ─► other clients
   1            2                 3                  4        5–8          9
```

| #   | Step                                                       | Detail                                                                                                                                                        |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The editor applies the transaction                         | ProseMirror state changes; pagination re-runs for the affected pages only                                                                                     |
| 2   | The binding turns it into a CRDT update                    | A few bytes for a keystroke                                                                                                                                   |
| 3   | The update is written to the local store, unacknowledged   | Apply, store, then send, in that order. The local copy is loaded before the socket opens                                                                      |
| 4   | It is sent as a `PUSH` frame with a client sequence number | One socket carries every open document; a message over the frame limit travels as chunks                                                                      |
| 5   | The server checks it                                       | Size and rate limits; every client ID in the update belongs to this user; the update applies cleanly and leaves nothing pending                               |
| 6   | The server validates what the push touched                 | Known attributes, text-only content, allowed marks, guarded settings. A failure is answered with a permanent error code and the room is reloaded from the log |
| 7   | The server appends it to the log and commits               | Next sequence number, checksum, user, time. Pushes handled in the same event-loop turn share one transaction                                                  |
| 8   | The server acknowledges                                    | Only after the commit. Nothing is acknowledged or published before it is durable                                                                              |
| 9   | The server publishes to the document's subscribers         | Each client stores an incoming update at once and applies it to the view once per frame, merged with the others that arrived                                  |

Why an explicit outbox, when a CRDT can compute what a peer is missing: a Yjs state vector does not record deletions, so "the server has my clock" cannot stand for "the server has my edit". Seen in a throwaway run: a delete-only change left the state vector unchanged.

Why remote updates are merged per frame: in a throwaway run on one machine, twenty remote updates applied one at a time to a 120-page document cost about 15 ms; merged and applied once, about 1.7 ms.

The frame, as the codec encodes it today:

```text
type (1 byte) · flags (1 byte) · [message ID, if chunked] · [document ID (16 bytes) · generation, if a document frame] · body
```

- Types 0–15 concern the connection (hello, welcome, session refresh, error, heartbeat); 16–127 concern one document (subscribe, sync, push, acknowledge, presence, server events, viewer content, a guarded setting).
- A frame whose type or flag this build does not know is skipped, and bytes after the last known field are ignored, so an addition never locks an older build out.
- A frame is at most 4 MiB; a larger message travels as chunks, up to 64 MiB once reassembled.
- Versions are gated twice: at connection (a client below the server's minimum is refused) and per document (a client older than a document's schema or page engine may read it, not edit it).

**"Saved" and "Synced" are two facts and are never merged into one:**

| Word   | Means                                                                                     | Web                          | Desktop                                                             |
| ------ | ----------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| Saved  | The edit is committed to durable storage on this device                                   | In the browser's local store | In the local node's SQLite file                                     |
| Synced | The outbox is empty: every update has been acknowledged by the authority after its commit | Same                         | The local node relays the authority's acknowledgement to the window |

Typing never waits for either. If a push is permanently refused, the client keeps the text, abandons that client ID, reloads the server's state and replays its unacknowledged changes block by block; whatever cannot be placed is filed as recovered text rather than dropped.

## 7. How pages are computed

**Planned**; the package is empty on `main`.

- **A pure function.** `paginate(blocks, profile, locks) → pages`: no DOM, no fonts, no async, no editor import. Text is wrapped in character cells, not pixels, by the engine's own line breaker with its own width tables. The same inputs give the same pages on every client, on the server and in the PDF writer.
- **Never stored.** There are no page nodes in the document. Page breaks are view state, drawn as ProseMirror decorations: one widget between blocks at a page break, or one at the exact character offset when a break falls inside a block, carrying the page gap, the header and the page number.
- **Never measured.** The DOM is not read to decide a break, so there is no feedback loop and no dependence on a machine's fonts. A monitor compares rendered line counts near the viewport with the engine's and corrects the screen, never the pages.
- **Incremental.** A keystroke restarts from the last page whose break did not depend on the changed block and stops as soon as a new page start coincides with an old one.
- **Locked pages are an input.** Production page locks are ordered page-start anchors (a block ID and an offset) passed to the same function, so every client derives the same A-pages.

Evidence, with its limits: a prototype of the engine alone, on one fast laptop, repaginated a 124-page synthetic script from cold in about 0.7 ms (median) and handled a keystroke incrementally in about 0.05 ms. That prototype had no editor, no decorations and no real fonts attached.

Known limit, by choice: page parity between screen, collaborators and PDF is promised only for characters in the bundled script font. Wide, right-to-left and complex-script text is kept but may wrap differently and will not print correctly.

## 8. How long documents stay fast

**Planned.** The target is one 2,000-page document inside the typing budget. It is a target until it has been measured in the real app.

The first thing that slows down is the browser, not the CRDT: in one large editable element, keystroke cost grows with the number of blocks. Evidence from a throwaway browser prototype (bare ProseMirror in a headless browser, one machine, synthetic script text; **no sync and no pagination attached**), keystroke to next frame, typing in the middle, median:

| Document                               | No throttle | 4x CPU throttle | 6x CPU throttle        |
| -------------------------------------- | ----------- | --------------- | ---------------------- |
| Flat, 1,000 pages (25,000 blocks)      | 17.7 ms     | 78.6 ms         | 100.7 ms               |
| Flat, 2,000 pages (50,000 blocks)      | 37.9 ms     | 149.2 ms        | about 289 ms, unstable |
| In sections of 100 blocks, 2,000 pages | 3.4 ms      | 6.6 ms          | 10.3 ms                |

What the section structure relies on:

1. `content-visibility: auto` on each section, so the browser skips layout and paint for sections off screen.
2. Each section's placeholder height comes from the page engine, which knows every block's line count, so the scrollbar does not jump.
3. The sections that hold the selection, and their neighbours, stay rendered.
4. Document-start and document-end keys set the selection from the model.
5. Backspace, Delete, Enter, paste and drop are section-aware, so a section boundary is never visible to the writer.
6. An existing block never moves between sections during normal editing; sections are rebalanced only when a document is rebuilt. This keeps concurrent edits from colliding on structure.

In the prototype, items 1 to 4 together made caret movement, selection and scrolling match a flat document in three browser engines (test builds, one operating system); without 2 to 4 the caret jumped to the last section on one arrow key in one engine and the scrollbar moved backwards. Item 5 was found to be needed there (the stock Backspace joins two sections and appears to do nothing) and has not been built. Item 6 has not been tested under concurrent edits.

Not yet measured: sections with the CRDT binding attached, with real pagination decorations, with real fonts, under an input method, in the release builds of the other browsers, or on Windows and Linux. If `content-visibility` fails on an engine, the fallback keeps the sections and drops the CSS there, with a lower measured comfort limit stated in the product.

Two more rules keep a document small however long it lives: history is kept outside the live document (see 9), and a document over its size budget is rebuilt from its content into a new _generation_. Every document frame already carries a generation number, so this can be added without a protocol change.

## 9. Where history and revisions live

**Planned.**

| Thing                                                                                  | Where it lives                                                                                                       | Why                                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Every accepted edit                                                                    | An append-only log per document in SQLite, with a server-assigned sequence number, user and time                     | The log is the source of truth; the in-memory document is a cache of it                                                 |
| Checkpoints                                                                            | Disposable snapshots of state at a sequence number                                                                   | Loading is the newest valid checkpoint plus a short tail of the log                                                     |
| An automatic version made online                                                       | A position in the log: one row                                                                                       | The log is totally ordered, so every prefix is a consistent state                                                       |
| Named drafts, sent drafts, revision baselines, issued revisions, versions made offline | Content snapshots: editor JSON, chunked by scene, hashed and compressed                                              | They survive a rebuild and a change of CRDT library; consecutive versions share most chunks                             |
| Revision sets, page-lock anchors, issued scene numbers                                 | Rows written by the server, one request at a time                                                                    | Workflow state must mean one thing to everyone, so it is sequenced, not merged                                          |
| Revision marks, revised-page colours, A-pages                                          | Nowhere: derived by comparing the set's baseline with the current document, block by block, and drawn as decorations | A derived mark cannot go stale and is identical on every client. Cost: a retyped block has a new ID and is marked whole |
| The live CRDT document                                                                 | Current content only, with garbage collection on                                                                     | Size and load time stay flat                                                                                            |

Evidence for keeping history out of the live document: in a throwaway run on one machine, a heavily rewritten 120-page synthetic script with garbage collection off (which in-document history requires) was 18 to 20 times its plain text and loaded about twice as slowly as the same history with it on (about 4.5 times).

Compare and restore work on materialised documents and block IDs. Restore is a new forward edit, never a rewrite of history.

## 10. The quality gate and the boundary check

**Built.** One command, `bun run verify`, runs eight steps in order and stops at the first failure:

| Step            | Command                | Fails when                                                                                                                             |
| --------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Format          | `bun run format:check` | A file is not formatted                                                                                                                |
| Types           | `bun run typecheck`    | Any type error, under strict settings                                                                                                  |
| Lint            | `bun run lint`         | Any warning or error                                                                                                                   |
| Tracked files   | `bun run tracked`      | A tracked file lies outside the listed public folders and root files                                                                   |
| Boundaries      | `bun run boundaries`   | An import breaks a rule in `tools/boundaries.config.ts`                                                                                |
| Project records | `bun run records`      | A public document breaks its format, links to a file git does not track, contradicts the repository, or names something kept out of it |
| Tour            | `bun run tour`         | A Tour scenario has no end-to-end test, or a test has no scenario                                                                      |
| Unit tests      | `bun run test:unit`    | Any test fails; property tests run here too                                                                                            |

The boundary check reads every source file as text and tests each import against the configuration: which package may import which, which edges are types only, which packages are pure or run in a browser, which external libraries are confined to one package, which folders of a package have stricter rules, what test code may import, and that each package has one entry point. Its own tests feed it small repositories that break each rule. [layers.md](layers.md) has the full table.

The end-to-end tests (`bun run test:e2e`, three browser engines) and a test that clones the repository and starts the demo from the clone (`bun run test:clone`) run outside the gate. The workflow in `.github/workflows/ci.yml` runs the gate and both on macOS, Windows and Linux.

## 11. Where to start reading the code

| Read                                                                                       | For                                                                                                 |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, then `docs/decisions/README.md`                                               | The standing rules, and why each constraint exists                                                  |
| `tools/boundaries.config.ts`                                                               | The dependency rules, as data: one row per workspace, the confined libraries and the zones          |
| `packages/schema/src/index.ts`, then `schema.ts`, `attrs.ts`, `identity.ts`, `validate.ts` | The document model                                                                                  |
| `packages/sync-protocol/src/messages.ts`, then `codec.ts`                                  | The wire protocol: every message, then how it becomes bytes                                         |
| `packages/crdt/src/index.ts`                                                               | The CRDT interface: documents, updates, and writes addressed to a block                             |
| `packages/server-core/src/http/server.ts`                                                  | The server as a factory: `createServer(config)` returns handlers and never listens                  |
| `packages/server-core/src/auth/sign-in.ts`, then `packages/demo/src/sign-in.ts`            | A seam, then its first implementation                                                               |
| `apps/server/src/main.ts`                                                                  | How an app composes a package: read the environment, build the configuration, listen                |
| `apps/web/src/router.tsx`                                                                  | The web app's routes and the per-tab person                                                         |
| `tools/check-boundaries.ts` and `tools/test/check-boundaries.test.ts`                      | How the rules are enforced and what each violation looks like                                       |
| `bench/harness.ts` and `bench/stats.ts`                                                    | How measurements will be taken: fresh processes, percentiles with bootstrap intervals, never a mean |
