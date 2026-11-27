# Repository outline

What is in each folder. For how the parts fit together and how much of each exists, see [overview.md](overview.md); for the import rules, [layers.md](layers.md); for the commands, [Set up a development copy](../development/setup.md).

## The root

```text
manent/
├── package.json            workspaces, scripts, and the catalog: every external version, in one place
├── bun.lock                the only lockfile
├── bunfig.toml             install settings: a release must be three days old before it is installed
├── tsconfig.base.json      strict TypeScript settings shared by every workspace
├── tsconfig.json           the files `bun run typecheck` covers
├── Makefile                thin wrappers over `bun run <name>`; `make` alone lists them
├── .oxlintrc.json          lint rules: correctness and suspicious patterns are errors
├── .prettierignore         files the formatter skips
├── .gitattributes          LF line endings everywhere; the record files merge by keeping both sides
├── .github/                the CI, desktop, release and Pages workflows, issue templates and the pull-request template
├── site/                   the public landing page and comparison page, published to GitHub Pages by hand (pages.yml)
├── LICENSE, NOTICE         the licence terms and the copyright line
├── README.md               what Manent is, what works, how to run it
├── AGENTS.md               the rules for anyone who changes the repository
├── CONTRIBUTING.md         how to propose a change, and how it is reviewed
├── SECURITY.md             how to report a vulnerability
├── CODE_OF_CONDUCT.md      how people treat each other here
├── CHANGELOG.md            what changed, newest first
├── docs/                   these documents (see the index in docs/README.md)
├── packages/               libraries
├── apps/                   entry points; nothing imports an app
├── bench/                  the benchmark suite
├── e2e/                    end-to-end and fresh-clone tests
├── tools/                  the gate's checks and the demo launcher
└── types/                  ambient types: stylesheet and asset imports
```

## packages/

Each package has one entry point, `src/index.ts`, tests in `test/`, and some a `./testing` entry that only tests and tooling may import.

```text
packages/
├── schema/          the document model: schema, elements, attributes, identity, validation, repairs, canonical JSON
├── settings/        the settings registry, the store, and every preference and script setting (src/definitions/)
├── sync-protocol/   frames, messages, codec, chunking, version gating, error codes, HTTP bodies
├── perf/            timing marks, off by default
├── pagination/      the page engine, versioned (src/engines/v1/), with generated font and Unicode tables
├── revisions/       compare/, merge/, restore/ and the production model in production/
├── crdt/            the only importer of Yjs
├── formats/         pdf/ (the PDF writer), production/ (the issued packet), fdx/ and fountain/ (read and write), script/, text/ and xml/
├── sync-client/     link/, session/, outbox/, tabs/, recovery/, review/, move/, upstream/, history/, production/ and the ports it is driven through
├── client-web/      the browser drivers: IndexedDB store, leader election, socket transport, production cache
├── storage/         the ports, sqlite/ and an in-memory driver in testing/
├── server-core/     http/, auth/, net/, socket/, sync/ (rooms and the write path), limits/, view/, rebuild/, history/, production/
├── local-node/      the desktop's loopback service: node/, store/, relay/, upstream/, handoff/, lock/, http/, auth/
├── crdt-binding/    binding/, history/ (undo, composition) and presence/
├── editor/          the ProseMirror editor: elements/, keys/, picker/, complete/, find/, page/, pagination/, cursors/, changes/, revisions/
├── commands/        the command registry and its definitions (src/definitions/)
├── ui/              components/, palette/, surfaces/, theme.css and words/: every word the interface shows
├── demo/            people, workspaces, sign-in, the Tour (tour/), the seed (seed/), its content and phrase banks (content/, generate/), simulated writers (writers/)
└── testkit/         temporary trees, DOM setup, a test server, bots, the sync simulation (sync/) and the production simulation (production/)
```

## apps/

```text
apps/
├── web/             the browser app
│   ├── build.ts         builds into apps/web/dist (not tracked); MANENT_FLAVOUR=test builds the test flavour
│   └── src/
│       ├── main.tsx, router.tsx    entry and routes: /choose, /, /s/<id>, /s/<id>/history, /s/<id>/send/<form>, /preferences/<pane>
│       ├── boot/                   service-worker lifecycle, update checks and background offline-tool warming
│       ├── pwa/                    install prompt store and persistent first-visit offline-readiness notice
│       ├── screens/                the Studio Desk chooser (choose/), the Library, the script, dedicated read-only History, Send, Preferences
│       ├── editor-host/            where the editor and the CRDT binding are mounted
│       ├── handlers/               what each command does
│       ├── services/               per-person services: sync, the Library list, preferences
│       ├── state/                  the interface's stores
│       ├── send/                   Export and Print
│       ├── import/                 Import…, file drops and what an import kept
│       ├── history/                version history timeline, compare, restore and review state
│       ├── production/             locking, the Pages tab, Issue and Recall
│       ├── desktop/                the page's half of the desktop app
│       ├── shell/                  regions, the announcer, Escape and focus
│       ├── demo/                   the demo bar and the Tour panel
│       ├── sw/                     the service worker
│       └── text.ts                 the app's own sentences
├── server/          the server program: reads the environment, opens storage, seeds the demo, listens
└── desktop/         the desktop shell on Electrobun (see docs/development/desktop.md)
```

## bench/, e2e/, tools/

```text
bench/
├── harness.ts, budgets.ts, measure.ts, run.ts  the harness: fresh processes, percentiles with intervals, quiet checks
├── env.ts, tiers/                              the run's tier, slowdown and mode, and the tier that judges each area
├── budgets.json                                budgets and hard limits, judged on each area's reference tier
├── client/  crdt/  server/  corpus/  demo/     scenarios, *.bench.ts
└── results/                                    one JSON file per run (not tracked)

e2e/
├── playwright.config.ts    three engines, against one demo on ports of its own
├── smoke/ editor/ interface/ sync/ offline/ typesetting/   the suites
├── tour/                   one test per Tour scenario (92 scenarios across web and desktop)
├── clone/                  clones the repository and starts the demo from the clone
└── support/                shared helpers

tools/
├── demo/                   the launcher behind make demo, and its supervisor
├── check-*.ts              the gate's checks: tracked files, boundaries, records, Tour, interface rules, colours, glossary
├── e2e-parallel.ts         runs Chromium, Firefox and WebKit Playwright suites concurrently on isolated ports and build folders
├── build-server-release.ts compiles all six release server binaries and archives apps/web/dist concurrently
├── boundaries.config.ts    which workspace may import which
├── records.config.ts       the rules of the public documents
├── unicode/                generates the page engine's tables from vendored Unicode data
├── theme/                  reads the theme and checks its contrast
├── notices.ts              writes the licence notices of the third-party code that ships
├── desktop/                the desktop build tools: the build, the toolkit download, the size check, the smoke and headless runs
└── test/                   tests of the checks and of the repository's conventions
```
