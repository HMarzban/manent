# Repository outline

What is in the repository on `main` as of 2026-11-18, what it is growing into, and the commands a contributor uses. For how the parts fit together see [overview.md](overview.md); for the import rules see [layers.md](layers.md).

Marks: **built** is on `main` with tests; **in progress** is partly on `main`; **planned** is not written. A package marked _empty_ has a `package.json` and entry files that export nothing yet, so the dependency rules already apply to it.

## 1. On `main` today

```text
manent/
├── package.json            workspaces, scripts, and the catalog: every external version, in one place
├── bun.lock                the only lockfile
├── bunfig.toml             install settings: a release must be three days old before it can be installed
├── tsconfig.base.json      strict TypeScript settings shared by every workspace
├── tsconfig.json           the files `bun run typecheck` covers
├── Makefile                thin wrappers over `bun run <name>`; `make` alone prints the list
├── .oxlintrc.json          lint rules: correctness and suspicious patterns are errors
├── .prettierignore         files the formatter skips
├── .gitattributes          LF line endings on every system; the three record files merge by keeping both sides
├── .gitignore
├── LICENSE                 the licence terms
├── README.md               what it is and what runs today
├── AGENTS.md               the rules for anyone who changes the repository
├── CHANGELOG.md            what changed, newest first
│
├── docs/
│   ├── architecture/       overview.md, layers.md, repository.md (this file)
│   ├── decisions/          one record per decision, and their index
│   └── memory/             lessons.md: mistakes, near-misses and the rule each one produced
│
├── .github/workflows/
│   └── ci.yml              the gate, the end-to-end tests and the fresh-clone test on macOS, Windows and Linux
│
├── packages/               libraries; each has one entry point, src/index.ts
│   ├── schema/             document model                                              built
│   │   ├── src/schema.ts       doc → section+ → block+ → text*; one block node with a `type` attribute
│   │   ├── src/block-types.ts  the 21 elements and which of the 8 formats offers each
│   │   ├── src/attrs.ts        block attributes and their defaults
│   │   ├── src/marks.ts        the 10 marks; which link addresses are safe
│   │   ├── src/identity.ts     block IDs; the split marker; attributes after a new block, a split, a join
│   │   ├── src/validate.ts     what is wrong with a stored document: reject, newer or repair
│   │   ├── src/normalize.ts    the three repairs any client may make; cutting blocks into sections
│   │   ├── src/canonical.ts    the one spelling in which documents are compared, hashed and stored
│   │   ├── src/block-view.ts   a document's blocks as plain frozen data
│   │   ├── src/json.ts         this build's view of a stored document
│   │   └── test/               unit and property tests
│   ├── settings/           empty                                                       planned
│   ├── sync-protocol/      the wire protocol, as bytes; no socket                      built
│   │   ├── src/messages.ts     every message a client and the server exchange
│   │   ├── src/codec.ts        one message to one frame and back; unknown frames are skipped
│   │   ├── src/frame.ts        the header every frame starts with, and who may send each type
│   │   ├── src/chunking.ts     a message larger than one frame, as chunks
│   │   ├── src/gating.ts       which client versions may connect, and which may edit
│   │   ├── src/constants.ts    protocol version, size limits, frame numbers, error codes
│   │   ├── src/http.ts         what the HTTP routes answer, and what a client sends them
│   │   └── test/               unit, property and malformed-input tests
│   ├── perf/               timing marks for the product build, off by default          built
│   ├── pagination/         empty                                                       planned
│   ├── revisions/          empty                                                       planned
│   ├── crdt/               the only importer of Yjs: documents, updates, block writes  built
│   ├── formats/            empty                                                       planned
│   ├── sync-client/        empty                                                       planned
│   ├── client-web/         empty                                                       planned
│   ├── storage/            empty                                                       planned
│   ├── server-core/        the server as a factory; never listens itself               in progress
│   │   ├── src/http/server.ts      createServer(config): the host check, the routes, the web app's files
│   │   ├── src/http/routes/        health, sign-in and the signed-in person, demo mode, the socket's ticket and upgrade
│   │   ├── src/http/static.ts      serves the built web app; nothing outside its folder
│   │   ├── src/auth/sign-in.ts     the sign-in port: how a visitor becomes an identity
│   │   ├── src/auth/directory.ts   the directory port: who exists, and where they belong
│   │   ├── src/auth/sessions.ts    sessions signed into their own token
│   │   ├── src/net/bind.ts         which addresses the password-less demo may listen on
│   │   ├── src/socket/handler.ts   a ticket opens the socket, HELLO is answered, document frames are refused
│   │   ├── src/socket/tickets.ts   single-use tickets for a signed-in person
│   │   ├── src/testing/            in-memory doubles of the two ports, and the tests every implementation passes
│   │   └── test/
│   ├── local-node/         empty                                                       planned
│   ├── crdt-binding/       empty                                                       planned
│   ├── editor/             empty                                                       planned
│   ├── commands/           empty                                                       planned
│   ├── ui/                 empty                                                       planned
│   ├── demo/               demo people, sign-in, the Tour's format, the seed           in progress
│   └── testkit/            test support                                                in progress
│       └── src/temp-trees.ts   temporary directories for tests, each removed by one call
│
├── apps/                   entry points; nothing imports an app
│   ├── web/                the browser app                                             in progress
│   │   ├── build.ts            builds static files into apps/web/dist (ignored by git)
│   │   ├── src/main.tsx        entry: router, data client, the tab's person
│   │   ├── src/router.tsx      routes: `/` (Library) and `/choose`; `?person=<id>` signs a tab in
│   │   ├── src/session.ts      who this tab is, kept in tab storage so two tabs can be two people
│   │   ├── src/api.ts          requests to the server and to the demo's server control
│   │   ├── src/text.ts         every sentence the app shows, in one place
│   │   ├── src/screens/        choose.tsx ("Choose who you are"), library.tsx (empty Library)
│   │   ├── src/demo/           demo-bar.tsx, tour-panel.tsx, use-demo.ts (the seed and the server control)
│   │   └── test/
│   ├── server/             the server program                                          built
│   │   ├── src/env.ts          reads settings from the environment; starts only in demo mode
│   │   ├── src/main.ts         builds the configuration, keeps the session key, listens
│   │   ├── src/bun-adapter.ts  Bun's listener and sockets, adapted to the server's seams
│   │   └── test/
│   └── desktop/            empty                                                       planned
│
├── bench/                  benchmark suite                                             in progress
│   ├── harness.ts              runs scenarios in fresh processes; percentiles with intervals
│   ├── stats.ts                nearest-rank percentiles and bootstrap intervals; never a mean
│   ├── budgets.ts              reads the budgets file and judges a value against a row
│   ├── run.ts                  `bun run bench [--filter <text>]`
│   ├── budgets.json            the budgets a run is judged against: none yet
│   ├── corpus/ crdt/ client/ server/     where scenarios go: empty
│   ├── results/                one JSON file per run (ignored by git)
│   └── test/
│
├── e2e/                    browser end-to-end tests                                    in progress
│   ├── playwright.config.ts    three browser engines, against one demo on ports of its own
│   ├── smoke/                  the demo skeleton: chooser, Library, demo bar
│   ├── clone/                  clones the repository and starts the demo from the clone
│   ├── support/                tourScenario, the one way a Tour test is written
│   └── tour/                   one test per Tour scenario: none yet
│
├── tools/                  repository checks and the demo launcher                     built
│   ├── demo/                   the launcher behind `make demo`: checks the machine, installs, builds, seeds, supervises the server
│   ├── boundaries.config.ts    which workspace may import which: the architecture as data
│   ├── check-boundaries.ts     the check that reads it; source-scan.ts reads source as text for it
│   ├── check-tracked.ts        fails if a tracked file lies outside the listed public tree
│   ├── check-tour.ts           every Tour scenario has its end-to-end test, and every Tour test its scenario
│   ├── check-records.ts        the check of the public documents; records*.ts hold its rules
│   └── test/                   tests of the checks, and of the workspace's own conventions
│
└── types/
    └── assets.d.ts         lets TypeScript accept stylesheet imports
```

## 2. What it is growing into

Only what is not written yet. Nothing here should be read as existing; a folder named here may already exist as an empty entry.

```text
manent/
├── packages/
│   ├── settings/               the settings registry: definitions, validation, resolution, store    planned
│   ├── pagination/             pure page engine: tables, wrap, rules, positioned lines              planned
│   ├── revisions/              block diff, three-way block merge, revised lines, scene numbers      planned
│   ├── formats/                PDF from engine output; interchange formats                          planned
│   ├── sync-client/            connection state machine, outbox, local-store and transport ports    planned
│   ├── client-web/             the sync client's browser drivers: socket, IndexedDB, leader tab     planned
│   ├── storage/                storage ports; a SQLite driver and an in-memory one                  planned
│   ├── server-core/            + rooms, write path, versions, revisions                             planned
│   ├── local-node/             desktop: durable store and relay on loopback                         planned
│   ├── crdt-binding/           the binding between the CRDT and the editor                          planned
│   ├── editor/                 ProseMirror plugins, keymaps, decorations                            planned
│   ├── commands/               the command registry: definitions, key bindings, the menu model      planned
│   ├── ui/                     tokens, components, shared widgets                                   planned
│   ├── demo/                   + seeded scripts, the Tour's scenarios                               planned
│   └── testkit/                + fixtures, corpus generator, fuzzers,
│                                 deterministic simulation, golden files                             planned
├── apps/
│   ├── web/                    + editor screen, real Library, status, offline shell                 planned
│   └── desktop/                the desktop shell: window, menus, updater                            planned
├── bench/                      + scenarios, budgets, a generated report                             planned
├── e2e/                        + one test per Tour scenario                                         planned
└── spikes/                     throwaway prototypes of the riskiest assumptions:
                                the desktop shell, the offline shell, pages in real browsers         planned
```

The order of work: three throwaway prototypes of the riskiest assumptions; then three tracks side by side (the page engine and PDF; storage, the server's write path and the sync client; the interface); then the editor that joins them; then rebuilds, offline work in the browser, the desktop app, version history, production revisions, the first full benchmark run, and the demo's content and Tour.

## 3. Commands

Requirement: Bun 1.4.4 or later. Each `make` target wraps `bun run <name>`, so `make` itself is optional.

**Work today:**

| Command                             | Does                                                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install`                       | Installs from the lockfile                                                                                                                                                                         |
| `bun run verify`                    | The quality gate: format check, typecheck, lint, tracked-files check, boundary check, records check, Tour check, unit tests. Run it before every commit                                            |
| `bun run test:unit`                 | Unit and property tests in `packages`, `apps`, `tools` and `bench`                                                                                                                                 |
| `bun test packages/schema`          | One package's tests                                                                                                                                                                                |
| `bun run boundaries`                | The boundary check alone                                                                                                                                                                           |
| `bun run records`                   | The check of the public documents alone                                                                                                                                                            |
| `bun run tour`                      | The Tour check alone; today it reports 0 scenarios                                                                                                                                                 |
| `bun run format`                    | Formats every file                                                                                                                                                                                 |
| `bun run typecheck`, `bun run lint` | One gate step alone                                                                                                                                                                                |
| `bun run build:web`                 | Builds the web app into `apps/web/dist`                                                                                                                                                            |
| `bun run test:e2e`                  | Builds the web app, starts a demo on ports of its own and runs the end-to-end tests in three browser engines                                                                                       |
| `bun run test:clone`                | Clones the repository into a temporary folder and starts the demo from the clone                                                                                                                   |
| `make demo` or `bun run demo`       | Installs, builds the web app, seeds the people and the empty workspaces, starts the server on `http://localhost:4747` under a supervisor and opens the browser. Stop it with Ctrl+C or `make stop` |
| `make demo LAN=1`                   | The same, and the server listens on one private address of this machine as well                                                                                                                    |
| `make stop`                         | Stops the server and its supervisor                                                                                                                                                                |
| `make reset`                        | Deletes the demo data and seeds it again                                                                                                                                                           |
| `make test` or `bun run test`       | Unit, end-to-end and fresh-clone tests in turn                                                                                                                                                     |
| `make bench` or `bun run bench`     | Runs the harness. With no scenarios yet it reports "0 scenarios" and writes a result file with none                                                                                                |
| `make`                              | Prints the list of targets                                                                                                                                                                         |

Settings the server program reads from the environment, which `make demo` sets for it: `MANENT_DEMO=1` (required: this build has only the demo sign-in), `MANENT_PORT` (default 4747), `MANENT_LAN_HOST` (one private-range address to listen on as well as loopback), `MANENT_DATA_DIR` (default `.manent-demo`), `MANENT_WEB_DIR` (default `apps/web/dist`), and `MANENT_CONTROL_URL` with `MANENT_CONTROL_TOKEN` (set together: where the demo bar's server controls are answered).

**Defined, and not working yet:**

| Command        | Meant to                       | Today                                                                      |
| -------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `make desktop` | Build and open the desktop app | Prints "The desktop app is not in this build yet." and exits with status 1 |

The workflow in `.github/workflows/ci.yml` runs on every push and pull request, on Linux, macOS and Windows: it installs from the lockfile, runs `bun run verify`, installs the browsers, and runs `bun run test:e2e` and `bun run test:clone`.
