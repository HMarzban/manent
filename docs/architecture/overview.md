# Architecture overview

How Manent is put together, and how much of it exists. [layers.md](layers.md) has the dependency rules in full and [repository.md](repository.md) the folder outline. Every status on this page was read from the code on `main`:

| Mark            | Meaning                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **built**       | Does its job end to end, with tests, and is used by the running app or the tooling                    |
| **in progress** | Some of what the part is for works; the rest is missing or is a placeholder file that exports nothing |
| **planned**     | Decided, not written                                                                                  |

## What the system is

1. A collaborative writing studio for film, series, shows, news, podcasts, books, stage plays and games: true pages laid out as they print, live multiplayer editing, version history and production revisions.
2. It works offline. Every change is stored on the device first and sent when a connection is available; a change the server has acknowledged is never lost.
3. The editor is plain ProseMirror. Merging uses a CRDT (Yjs) isolated inside one package (`@manent/crdt`, bound by `@manent/crdt-binding`).
4. One server program (Bun and SQLite) is the authority for every synced document: it orders, validates, stores and broadcasts every change.
5. Today it runs locally as a browser PWA or as a desktop app (which embeds `@manent/local-node` for durable SQLite storage, offline search and relay, and launches the bundled server program as a child process unless pointed at an existing server). A hosted service with real accounts is planned.

## The system in one diagram

```text
 BROWSER TAB (apps/web)                                     DESKTOP APP (apps/desktop)
 ┌─────────────────────────────────────────────────┐        ┌───────────────────────────────────────────┐
 │ React screens: Studio Desk chooser & Clean      │        │ shell: custom studio window chrome        │
 │   workspace mode, Library (Search, Folders,     │        │   (macOS/Windows), native menus, bespoke  │
 │   Favourites, Private, Trash), Script & Book    │        │   About window, dialogs, 6 h updater,     │
 │   studio, Beside, Series & Board, Rundowns,     │        │   manent:// & OS file associations,       │
 │   History (/s/$docId/history), Prompter, Room,  │        │   Prompter files, Export everything…      │
 │   Reader (/r/$token), Send, Settings, Prefs     │        │ the same web app in the window            │
 │                                       [built]   │        │ local node (packages/local-node):         │
 │ editor: ProseMirror, pages (v1–v3), Book sheet  │        │   loopback service, SQLite store          │
 │   & footnotes, inline graphics & chyrons,       │        │   (records v2 clean-workspace mode),      │
 │   picker, find, changes, revision marks,        │        │   offline-first cloud gating & recovery,  │
 │   comments, notes, suggestions, alternates,     │        │   offline FTS5 search, prompter & LAN     │
 │   timing, Ink worker                  [built]   │        │   MOS relay, server relay        [built]  │
 │   CRDT binding · presence             [built]   │        └────────────────────┬──────────────────────┘
 │ sync client: link, journal, outbox,             │                             │
 │   history, production, prompter feed  [built]   │                             │
 │ local store: IndexedDB · asset cache · leader   │                             │
 │ service worker: offline PWA & warming [built]   │                             │
 └──────────────┬──────────────────────────────────┘                             │
                │ HTTP: sign-in, session, script, assets, sharing, drafts,       │
                │   private copy, driver, prompter, MOS, search, trash,          │
                │   workspace, API keys, notifications, /api/v1/*, history, prod │
                │ WebSocket /ws: one binary socket for every open script & feed  │
                ▼                                                                ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ SERVER PROGRAM (apps/server → server-core), one Bun process: the authority                       │
 │   HTTP edge: host and origin checks, routes, demo sign-in, sessions, static web app   [built]    │
 │   socket: single-use tickets, handshake, version gate, prompter feed hub              [built]    │
 │   rooms: one live document per open script; room-free viewer snapshot cache           [built]    │
 │   write path: admit → identity → apply → validate → commit → acknowledge → publish    [built]    │
 │   checkpoints on a worker thread (LRU + deflate) · healing · reorganisations          [built]    │
 │   collaboration: sharing, groups & links, comments, sent drafts, private hand-in      [built]    │
 │   broadcast: rundown durations, air windows, prompter leases, MOS 2.8.5 / WinPlus-IP  [built]    │
 │   workspace: FTS5 search catch-up, 30-day Trash, Can also, /api/v1/*, notifications   [built]    │
 │   version history: record, list, open, name, restore (scripts and rundowns)           [built]    │
 │   production revisions & assets: lock, issue, recall, layout changes, project assets  [built]    │
 └──────────────┬───────────────────────────────────────────────────────────────────────────────────┘
                ▼
   SQLite files: control.sqlite (people, roles, shares, trash, keys, outbox), search.sqlite (FTS5),
   one file per project or person (including project assets), and a .checkpoints.sqlite beside each
```

### Where it runs

| Setting            | Clients                                                       | Server program                                                              | Storage                                           | Status                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo, one machine  | Browser tabs on `http://localhost:4747`; each tab is a person | On the same machine under a supervisor; loopback only                       | `.manent-demo/`: the session key and SQLite files | **built**                                                                                                                                                                                                                        |
| Demo, two machines | A second machine on the same private network                  | Also listens on one private-range address; refuses a public or wildcard one | The same                                          | **in progress**: `make demo LAN=1` listens; browsers keep an offline copy of the app only on `localhost` or HTTPS                                                                                                                |
| Desktop            | The app's own window (macOS, Windows, Linux)                  | A local node inside the app relays to the server, which stays the authority | SQLite in the system's app-data folder            | **built**: unsigned installers for macOS (`.dmg`), Windows (`-setup.zip`) and Linux (`.tar.gz`), with custom studio chrome, offline-first cloud gating, offline FTS5 search, Prompter files, LAN MOS relay and `manent://` links |
| Hosted             | Browsers and desktop apps                                     | The same program behind a proxy that ends TLS                               | The same files, with backups off the machine      | **planned**                                                                                                                                                                                                                      |

The demo replaces only sign-in. Sync, the write path, storage and recovery are the real ones, running locally.

## Packages

Dependencies point down; no edge points up. The layers and each package's allowed imports are data in `tools/boundaries.config.ts`, and [layers.md](layers.md) reads them out.

```text
 Presentation and composition   ui · demo · web · server · desktop                               screens, demo content, entry points
 Application                    crdt-binding · editor · commands                                 editing and the commands behind it
 Services                       sync-client · client-web · storage · server-core · local-node    sync, storage, the authority
 Domain engines                 pagination · revisions · crdt · formats                          the document's rules, as libraries
 Kernel                         schema · settings · sync-protocol · perf                         shared values and rules
 Tooling                        testkit · bench · e2e · tools                                    outside the layers
```

Every workspace, its job and its status:

| Package         | Layer                        | Responsibility                                                                                                                                                                                                                                                                                                                                        | Status                                                                                                                                                                                                                                 |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`        | Kernel                       | Document schema (v5): sections, single block node, elements and marks of 8 formats (including Book craft elements, openings and inline footnotes), inline graphics, stable block IDs, text anchors, rundown & prompter projection, Game Script playthrough walker, validation, repairs and canonical JSON                                             | **built**                                                                                                                                                                                                                              |
| `settings`      | Kernel                       | Settings registry, validation, personal/project/script scopes, store and every preference and layout/publishing setting                                                                                                                                                                                                                               | **built**                                                                                                                                                                                                                              |
| `sync-protocol` | Kernel                       | Wire protocol: binary frames, messages, chunking, version gating, refusal codes, prompter control frames, desktop shell v1 messages and HTTP route bodies                                                                                                                                                                                             | **built**                                                                                                                                                                                                                              |
| `perf`          | Kernel                       | Product timing marks, off until enabled, in a fixed ring buffer                                                                                                                                                                                                                                                                                       | **built**                                                                                                                                                                                                                              |
| `pagination`    | Domain engines               | Pure versioned page engines (`v1`, `v2`, opt-in `v3` Book Publishing with Source Serif 4 FUnit metrics, 5 trims, mirrored gutters, shared running headers, right-hand chapters, Roman front matter & auto-TOC) plus Variety/Podcast/Rundown timing                                                                                                    | **built**                                                                                                                                                                                                                              |
| `revisions`     | Domain engines               | Block-aligned script compare, row-aligned rundown compare, three-way block merge, anchor resolution, restore plans, script & manuscript Book checks, rename character, script numbers and production model                                                                                                                                            | **built**                                                                                                                                                                                                                              |
| `crdt`          | Domain engines               | The sole importer of Yjs: documents, additive `bookMatter(doc)` over `titlePage`, rundowns, templates strip/mint, body view, index maps, block-addressed writes, reorganisations, awareness and undo scope                                                                                                                                            | **built**                                                                                                                                                                                                                              |
| `formats`       | Domain engines               | Offline file I/O: PDF (scripts, Sides, packets, Engine 3 books with cover/TOC/endnotes/back matter), EPUB 3, round-trip Word (`.docx`), lossless Markdown (`.md`), Multi-part Book Compile, FDX, Fountain, Game Script JSON/XML, Ink, MOS 2.8.5 / WinPlus-IP wire encoding, rundown exports, CSV/PDF reports and Project archive zips                 | **built**                                                                                                                                                                                                                              |
| `sync-client`   | Services                     | Pure sync state machine behind ports: link, journal, outbox, handshake, leader/follower tabs, read-only `ViewHandle`, recovery, versions, production and prompter feed client                                                                                                                                                                         | **built**                                                                                                                                                                                                                              |
| `client-web`    | Services                     | Browser drivers for `sync-client`: IndexedDB store, project-scoped offline asset cache and uploader, Web Locks leader with lease fallback, socket/fetch transport and production cache                                                                                                                                                                | **built**                                                                                                                                                                                                                              |
| `storage`       | Services                     | Storage ports and drivers: SQLite (schema v13 with compressed checkpoints, `doc_directory_by_home_kind`, derived FTS5 `search.sqlite`, project assets and notification outbox) plus in-memory driver for tests                                                                                                                                        | **built**                                                                                                                                                                                                                              |
| `server-core`   | Services                     | `createServer()`: HTTP edge, CSP, auth, sessions, socket, rooms, write path, checkpoints, healing, sharing, comments, drafts, private copies, rundowns, prompter control, MOS bridge, assets, search and `/api/v1/`                                                                                                                                   | **built**                                                                                                                                                                                                                              |
| `local-node`    | Services                     | Desktop loopback service: durable SQLite (`records.sqlite` v2 with clean-workspace persistence and demo-reseed shielding), offline-first cloud gating & recovery, offline FTS5 search, Prompter files writer, LAN MOS relay, local export-all and first-sync handoff                                                                                  | **built**                                                                                                                                                                                                                              |
| `crdt-binding`  | Application                  | Binds a CRDT document to ProseMirror (`y-prosemirror`), undo history, IME composition hold and presence                                                                                                                                                                                                                                               | **built**                                                                                                                                                                                                                              |
| `editor`        | Application                  | `createScriptEditor`: element flow, keys, Book front/back matter sheet, footnotes, inline graphics & chyrons, picker, autocomplete, find, paged view (v1–v3), drift monitor, remote cursors, annotations, suggestions, alternates, revisions and Ink                                                                                                  | **built**                                                                                                                                                                                                                              |
| `commands`      | Application                  | Command registry, key bindings and chords, rebinding checks, contextual recommendations & frecency engine and menu model                                                                                                                                                                                                                              | **built**                                                                                                                                                                                                                              |
| `ui`            | Presentation and composition | Components, Bound "M" brand kit, 24 studio themes & Hidden Gem Collector Vitrine, command palette, sortable lists, surfaces, `theme.css` tokens and every interface string                                                                                                                                                                            | **built**                                                                                                                                                                                                                              |
| `demo`          | Presentation and composition | Demo people, three seeded workspaces (all 8 project kinds and formats in Writers' room), password-less sign-in, simulated writers, 7 Tour story tracks and all 93 active Tour scenarios (zero hidden)                                                                                                                                                 | **built**                                                                                                                                                                                                                              |
| `web`           | Presentation and composition | Installable offline PWA and desktop UI: Studio Desk chooser & Clean workspace mode, Library, Search, Folders, Trash, Script & Book studio, smart Command Palette, collaboration, Series Overview & Board, Rundowns, Prompter, dedicated History, Send, Reader (including shared Ink Player), unified Settings, custom About window and service worker | **built**                                                                                                                                                                                                                              |
| `server`        | Presentation and composition | Entry point reading `MANENT_*` env vars, opening SQLite storage, search index and checkpoint worker, seeding the demo, starting notifications and listening                                                                                                                                                                                           | **built**                                                                                                                                                                                                                              |
| `desktop`       | Presentation and composition | Electrobun shell: custom theme-matched window chrome (macOS/Windows main, Present & About windows), display-aware `1440 × 940` sizing, Bound "M" OS icons, native menus, 6-hour updater, `manent://` & file associations, Prompter files and local-node host                                                                                          | **built**                                                                                                                                                                                                                              |
| `testkit`       | Tooling                      | Test harnesses: temporary trees, test server, bots, seeded sync/production/desktop/MOS simulations, fuzzers and DOM setup                                                                                                                                                                                                                             | **built**                                                                                                                                                                                                                              |
| `bench`         | Tooling                      | Benchmark harness, bootstrap statistics, budgets, scenarios across client/CRDT/server/demo/desktop and report generator                                                                                                                                                                                                                               | **built**: published at commit `a44b0bc8` ([report.md](../benchmark/report.md)); `D-modest`/`D-typical`/`host` standard client tiers, `rundown.w5`, Windows/Linux desktop smoke and post-`a44b0bc8` server fixes await a fresh publish |
| `e2e`           | Tooling                      | Playwright end-to-end suites in Chromium, Firefox and WebKit, WCAG 2.2 AA axe checks, 93-scenario Tour runner, desktop smoke and fresh-clone test                                                                                                                                                                                                     | **built**                                                                                                                                                                                                                              |
| `tools`         | Tooling                      | Gate checks (`boundaries`, `records`, `tracked`, `tour`, `colours`, `glossary`, `ui-rules`, `stock`), demo launcher/supervisor, Unicode/serif table generator, theme tools and desktop build scripts                                                                                                                                                  | **built**                                                                                                                                                                                                                              |

## Seams

Each seam is an interface placed where a replacement is plausible.

| Seam                | Where                  | Why                                                                                                                                                         | Behind it today                                                                                                          |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CRDT library        | `crdt`, `crdt-binding` | Versions, compare, restore and revisions work on plain documents and block IDs, so they survive a change of library                                         | Yjs. The boundary check lets only these two packages import it                                                           |
| Storage             | `storage`              | The server is written against ports, so another driver can replace SQLite                                                                                   | SQLite (`bun:sqlite`) and an in-memory driver with fault injection                                                       |
| Sign-in             | `server-core`          | The demo needs password-less people, a hosted release a real provider; sessions and roles stay the same code                                                | The demo's provider in `demo`                                                                                            |
| Transport and clock | `sync-client`          | The client is pure: socket, storage, timers, locks and the clock are passed in, so the same code runs in a browser, the desktop and a simulation            | Browser drivers in `client-web`; simulated ones in `testkit`                                                             |
| Desktop shell       | `apps/desktop`         | All but the window, menus and updater lives in `local-node`, so the shell can be replaced                                                                   | Electrobun                                                                                                               |
| Files               | `formats`              | A PDF reads the page engine's output, not the screen, so it has the editor's pages by construction; the script and book formats read and write the document | The PDF, EPUB 3, Word (`.docx`), Markdown (`.md`), multi-part Book compile, packet, FDX and Fountain readers and writers |

## Document model

```text
doc ── section+ ── block+ ── text*
```

- **One document per script.** A film or a book-length manuscript is one document.
- **`section`** is an invisible container of about 100 blocks. It is never shown or selectable; it lets the browser skip content that is off screen.
- **`block`** is the only content node. Its element (Scene Heading, Action, Dialogue and so on) is an attribute, not a node type, so changing an element never deletes text someone else is typing into the block.
- **No merge can make a document invalid.** Every attribute has a default and no node needs more than one child. An element written by a newer build is kept and drawn as General.
- **Stable block identity.** Every block has its own `id`. Scene numbers, locks and revision records key on it, never on a CRDT-internal identifier. A split keeps the ID on the first half; a join keeps the earlier block; a paste makes new IDs.
- **Validation has three outcomes:** _reject_ (structurally invalid), _newer_ (written by a newer schema: kept) and _repair_ (put right, never refused). The server's write path validates only the blocks a change touched.

| Stored in the script's CRDT document                             | Ordered by the server, in SQLite, never merged                             | Derived, never stored                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Sections, blocks, text, marks, block attributes; script settings | Versions and named drafts, revision sets, page locks, issued scene numbers | Page breaks, page numbers, (MORE) and (CONT'D), scene numbers, the status a person sees |

Anything that must mean one thing to everyone, such as a version or a lock, is ordered by one authority. Anything that can be computed from the document is computed, so it cannot go stale. Script settings live in maps that only the server writes, at a person's request.

## A change, step by step

```mermaid
sequenceDiagram
  participant E as Editor (editor, crdt-binding)
  participant C as Sync client (sync-client)
  participant L as Local store (client-web: IndexedDB)
  participant S as Server (server-core)
  participant D as SQLite (storage)
  participant O as Other clients
  E->>C: ProseMirror transaction becomes a Yjs update
  C->>L: journal: stored as own, not acknowledged → "Saved"
  C->>S: PUSH {clientSeq, update} over /ws
  S->>S: admit, check client id, apply, validate touched blocks
  S->>D: commit in one transaction
  S-->>C: ACK {clientSeq, serverSeq}
  C->>L: marked acknowledged → "Synced"
  S-->>O: SYNC update to editors, VIEW_PATCH to readers
```

1. **In the editor.** `createScriptEditor` (`packages/editor`) is bound to the script's Yjs document by `bindDocument` (`packages/crdt-binding`). y-prosemirror writes each transaction into the document; remote updates are held back while a person composes text with an input method.
2. **On the device.** The sync client sees the local update and the journal stores it with "own, not acknowledged" (`packages/sync-client/src/session/journal.ts`). In a browser the store is IndexedDB, one database per person (`packages/client-web/src/idb-store.ts`). The status says **Saved** once the write lands.
3. **One tab talks.** Only one tab per person holds the connection, chosen by a Web Lock or, where there are none, a lease in IndexedDB. Other tabs pass their changes to it over a BroadcastChannel.
4. **To the server.** The link asks `POST /api/ws-ticket` for a single-use ticket and opens `/ws`. For each script it subscribes, exchanges state vectors, then sends the outbox in batches as `PUSH` frames, each waiting for its acknowledgement.
5. **The write path** (`packages/server-core/src/sync/write-path.ts`): admission (edit rights, current document, rate and size limits), client-id ownership, apply to the room's live document, validate the touched blocks and refuse writes to the server-only settings maps, then queue.
6. **Commit, then acknowledge.** Queued changes are committed to the project's SQLite file in one transaction. Only then does the server send `ACK`, and pass the change to the room's other editors as `SYNC` and to viewers as `VIEW_PATCH`.
7. **Back on the device.** `ACK` marks the journal's entries acknowledged; two seconds after nothing waits, the status says **Synced**. Remote updates are applied at most once per animation frame.

**Offline.** Steps 1 to 3 happen as before. The change stays in the outbox, across reloads, until a connection returns. Then the client subscribes again, the two sides exchange what each lacks, and the outbox is sent; a change the server already has is acknowledged again, not applied twice. If the server refuses a change for good, the client keeps its copy as a version on the device, reloads the server's state and merges its own changes back block by block; text that cannot be placed is kept as recovered text. If the document was reorganised meanwhile, waiting changes are replayed once through `POST /api/docs/replay`.

## Storage

- **Drivers.** SQLite in production (`packages/storage/src/sqlite/`, schema version 13 with query indexes on sharing, draft sends/opens, revision issues, checkpoint pins and `doc_directory_by_home_kind`, compressed checkpoints, project-scoped asset tables, derived FTS5 `search.sqlite` and notification outbox tables), and an in-memory driver with transactional rollback parity and fault injection for tests and the simulation.
- **Files and durability.** `control.sqlite` holds people, roles, share links, sent drafts, Trash records, API key hashes, notification outbox rows and tombstones. Each project, and each person's own desk, has its own file, `project-<id>.sqlite` or `user-<id>.sqlite`, and a `.checkpoints.sqlite` beside it. Primary files keep full SQLite durability (`synchronous = FULL` and `fullfsync` on macOS); derived caches (`.checkpoints.sqlite` and `search.sqlite`) use `normal` durability and disposable staging seeds use `off` (`docs/decisions/0059-tiered-storage-durability-and-on-demand-delivery.md`). In the browser, IndexedDB keeps `strict` durability for unsynced writing and recovered passages, uses `relaxed` durability for replaceable cache and metadata writes, and reads document lists from bounded metadata summaries without loading CRDT blobs.
- **What is in a file.** An append-only log of updates per document, the clients that wrote them, quarantined rows and healing marks, reorganisation epochs and replays, versions stored as content-addressed chunks, one per scene, project-scoped graphic assets, and production's tables: page locks, revision sets and their blocks, issues, issued scene numbers and request keys.
- **Checkpoints** are built on a worker thread (`durability: "normal"`, a 2-entry warm CRDT document LRU so consecutive jobs apply only incremental tails, direct Yjs XML tree walking in `measureDoc` reusing the encoded state length, and transparent level-1 `deflateRawSync` compression verified by canonical SHA-256), so a room loads the newest checkpoint and the log after it. A row that does not read is quarantined and the document is marked for healing.
- **In the demo** everything lives under `.manent-demo/data/`; `make reset` deletes it.

## The server

- **Routes.**
  - Core, auth and demo: `GET /health`; `GET` and `POST /api/sign-in`, `GET /api/me`, `GET /api/demo`, and demo control routes; `POST /api/ws-ticket` and `GET /ws`.
  - Documents, assets, history and production: `POST /api/docs` and `/api/docs/{remove,adopt,describe,replay,clients,removed,people}`; `/api/projects/:projectId/assets/:assetId`; `GET /api/versions`, `/api/versions/{content,who,since}` and `POST /api/versions/{name,save,upload,restore,authors}`; `POST /api/production/{state,lock,pages,layout,issue,recall,unlock,end,import,file}`.
  - Collaboration, room and private copies ([working-together.md](working-together.md)): `/api/share/{people,grant,remove,grant-group,remove-group,link,revoke-link,join}`; `/api/drafts/{send,sends,open,since,pdf}`; `/api/private/{create,handin}`; `/api/driver/{current,take,release}`.
  - Prompter and MOS ([prompter.md](prompter.md), [rundowns.md](rundowns.md)): `/api/prompter/{send,send-previous}`, `/api/prompter/operator/{take,release}`, `/api/prompter/control`, `/api/workspaces/:workspaceId/mos`, `/api/prompter/:docId/mos`, plus `SUBSCRIBE(mode: "prompter")` over `/ws`.
  - Search, Trash, Workspace settings, notifications and public API ([workspace-search-and-ink.md](workspace-search-and-ink.md)): `GET /api/search`; `/api/trash/{move,restore,list}`; `/api/workspace/{settings,people,people/role,api-keys,api-keys/create,api-keys/revoke,notifications,notifications/set}`; and read-only `GET /api/v1/{folder,lines,fdx,ink}` (API-key authenticated).
  - Any other path serves the built web app.
- **Edges.** A request must name the server's own host; the socket also checks the origin. The demo server listens on loopback, and on one private-range address with `MANENT_LAN_HOST`; it refuses a public or wildcard address, because the demo has no passwords.
- **Sessions** are signed with a key kept in the data folder. **Tickets** for the socket are single-use and short-lived.
- **Reorganisations.** When a document's CRDT grows past its budget, it is reorganised into a new, compact document once its room is quiet, and clients are told to move.
- **History.** The history service records, lists, opens, names, thins and restores versions for both scripts and rundowns (requiring `edit_rundowns` inside the serialisation queue for rundown writes), keeps them across reorganisations and storage compaction, and says who wrote a passage.
- **Broadcast prompter, MOS and assets.** `PrompterFeedHub` serves live prompter feeds, server-arbitrated operator scroll leases (`/api/prompter/operator/{take,release}`, `/api/prompter/control`) and the outbound MOS 2.8.5 / Autoscript WinPlus-IP TCP bridge (`/api/workspaces/:workspaceId/mos`, `/api/prompter/:docId/mos`), ensuring air-window holds govern both the browser Prompter window and external hardware prompters. Project-scoped inline graphic binaries live under `/api/projects/:projectId/assets/:assetId` with SHA-256 verification and per-project storage quotas.
- **Production.** The production service locks a script's page and scene numbers, changes pages and layout on a locked script, issues a revision once and starts the next, and recalls one within a day; only the server writes issued scene numbers.

## Pages

The page engine (`packages/pagination`) is a pure function from a document's blocks, a page profile and the locks to positioned lines on pages. Engines v1 and v2 measure Courier Prime on a fixed grid from precomputed tables, and opt-in Engine v3 (Book Publishing) measures bundled Source Serif 4 from precomputed FUnit tables across five trim sizes with mirrored margins, alternating running heads and optional right-hand chapter starts, so the same input gives the same pages in every browser and in Bun. Engines are versioned, so a script keeps its layout when the engine changes.

The editor runs the engine inside a ProseMirror plugin's state, after every change, and repaginates only what the change can reach. Pagination decorations mirror production layout patches on screen (`OMITTED` headings and hidden omitted-scene bodies) so DOM height matches the engine, while a drift monitor holds the browser's line wrapping to the engine's line starts. Whenever `changesPlugin` renders inline deletions or screenplay-formatted removed blocks (`del.el`, with trailing removals ordered strictly before `pb-last`) on the page, `sheetBoxSyncPlugin` keeps `.mn-sheet` underlays and `.mn-zoom` height synced to rendered `.pb-head` / `.pb-foot` boundaries via `PageScaffold.setPageBoxes` (absorbing extra diff height into `.pb-fill` via `--fill-trim` before expanding overflowing sheets, with bottom-anchored footers) and resets to fixed-pitch layout once changes hide. On passive scroll, the editor bridge resolves the reading-zone heading in O(log n) over visible blocks and publishes it to the outline store's isolated viewed channel for Scenes Ghost Follow. Print draws the engine's pages, and the PDF writer (`packages/formats`) draws the same positioned lines.

## History and production revisions

- **Merging and comparing** (`packages/revisions`) are built: a block-aligned compare drives the editor's changes layer, row-aligned rundown compare drives Rundown History, and a three-way merge by block is used by recovery, private-copy hand-in and replays on the server.
- **Version history** is built on the server and on the device for both scripts and rundowns: the top-bar **History** button beside **Share** opens a dedicated read-only `/s/$docId/history` screen (keeping the live editor mounted underneath without allowing edits) with a floating right-edge Change-Aware Minimap TOC, auto-fitted script comparisons (`On the page` and lockstep `Side by side` with DOM-synced per-page sheets and screenplay-formatted removed blocks, `Asterisks only` with right-margin asterisks via `changeMarksPlugin`, and `As it was`) and rundown diffs (`In the grid`, `Side by side`, `As it was`), named drafts, and full or single-scene/single-row restore.
- **Production revisions** are built: the model in `revisions`, the packet and Sides writers in `formats`, storage, the server's service, the client in `sync-client` and `client-web`, the editor's marks, and the screens (the lock dialogs including Try it on a copy first, the Pages tab, and Issue, Recall and Sides on the Send screen).

## Where to start reading

| File                                                                           | What it shows                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [AGENTS.md](../../AGENTS.md), then [the decisions](../decisions/README.md)     | The standing rules, and why each constraint exists                                                           |
| `tools/boundaries.config.ts`                                                   | The dependency rules as data: one row per workspace                                                          |
| [working-together.md](working-together.md)                                     | Comments and anchors, sharing, groups and links, sent drafts, suggestions, private copies and Room window    |
| [projects-and-series.md](projects-and-series.md)                               | Project index maps, shared styles, page furniture, series episodes, room documents and the series Board      |
| [rundowns.md](rundowns.md)                                                     | Variety and Podcast timing, collaborative Show and News rundowns, server durations and air windows           |
| [prompter.md](prompter.md)                                                     | One prompter projection, manual and 2 s automatic sends, Send previous, live feed and desktop prompter files |
| [workspace-search-and-ink.md](workspace-search-and-ink.md)                     | Full-text search, folders and Trash, Workspace settings, Can also, public REST API, notifications and Ink    |
| `packages/schema/src/schema.ts`, `identity.ts`, `validate.ts`                  | The document model                                                                                           |
| `packages/sync-protocol/src/messages.ts`, then `codec.ts`                      | Every message, then how it becomes bytes                                                                     |
| `packages/crdt/src/index.ts`                                                   | The CRDT interface                                                                                           |
| `packages/editor/src/script-editor/create.ts`                                  | How the editor is assembled                                                                                  |
| `packages/sync-client/src/session/local-copy.ts`, `journal.ts`, `handshake.ts` | One script's sync on the device                                                                              |
| `packages/server-core/src/sync/write-path.ts`, then `service.ts`               | What the server does with a change                                                                           |
| `packages/pagination/src/engines/v1/paginate.ts`                               | The page engine                                                                                              |
| `apps/server/src/main.ts`, `apps/web/src/router.tsx`                           | How the two apps compose the packages                                                                        |
