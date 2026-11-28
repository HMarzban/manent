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
├── .github/                CI, desktop, release, benchmark and Pages workflows, issue and PR templates
├── site/                   public landing, comparison and design-system pages (published via pages.yml)
├── LICENSE, NOTICE         the licence terms and the copyright line
├── README.md               what Manent is, quick start, truthful status and documentation map
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
├── tools/                  the gate's checks, desktop build tools and the demo launcher
└── types/                  ambient types: stylesheet and asset imports
```

## packages/

Each package has one entry point, `src/index.ts`, tests in `test/`, and some a `./testing` entry that only tests and tooling may import.

```text
packages/
├── schema/          document model (v5): schema, elements, marks, identity, validation, repairs, Game Script walker, prompter projection, canonical JSON
├── settings/        settings registry, store, and every personal, project and script setting (src/definitions/)
├── sync-protocol/   binary frames, messages, codec, chunking, version gating, refusal codes, desktop shell and HTTP bodies
├── perf/            timing marks, off by default
├── pagination/      versioned page engines (src/engines/v1/, v2/, v3/), timing/, running headers, book TOC, generated Unicode & serif font tables
├── revisions/       compare/, merge/, restore/, checks/ (script & manuscript Book checks), numbers/, and production/
├── crdt/            the only importer of Yjs: documents, bookMatter, rundowns, index maps, templates, awareness, undo scope
├── formats/         pdf/, epub/, docx/, markdown/, book/ (multi-part compile), production/ (packets & Sides), fdx/, fountain/, game/, ink/, mos/, reports/, rundown/, archive/, pdf-text/, watermark/
├── sync-client/     link/, session/, outbox/, tabs/, recovery/, review/, move/, upstream/, history/, production/, prompter/ behind ports
├── client-web/      browser drivers: IndexedDB store, offline asset cache, Web Locks leader, socket & fetch transport, production cache
├── storage/         storage ports, sqlite/ (schema v13, FTS5 search/, assets, outbox), and in-memory driver in testing/
├── server-core/     http/, auth/, net/, socket/, sync/, limits/, view/, rebuild/, history/, production/, sharing/, comments/, drafts/, private-copy/, driver/, project/, rundown/, prompter/, mos/, assets/, search/, library/, workspace/, permissions/, public-api/, notifications/, suggestions/
├── local-node/      desktop loopback service: node/ (cloud status, clean-workspace records v2, reseed), store/, search/, prompter-files/, relay/, upstream/, handoff/, lock/, http/, auth/
├── crdt-binding/    y-prosemirror binding/, history/ (undo, composition) and presence/
├── editor/          ProseMirror editor: script-editor/, elements/, keys/, actions/, picker/, complete/, find/, page/, pagination/, front-pages/, footnotes/, graphics/, annotations/, changes/, revisions/, cursors/, margin-marks/, margin-people/, material/, names/, room-log/, suggest/, timing/, ink/, bridge/, scroll/
├── commands/        command registry, contextual recommendation & frecency engine, menu model and definitions (src/definitions/)
├── ui/              components/ (brand, stock, grid, row, sortable, surface-state), palette/, settings-react/, surfaces/, theme.css and words/
├── demo/            people, workspaces, sign-in, Tour manifest & 7 tracks (tour/), seed/ (content/, generate/), simulated writers (writers/)
└── testkit/         temporary trees, DOM setup, test server, bots, sync/, production/ and mock MOS simulations
```

## apps/

```text
apps/
├── web/             the browser & desktop web app (PWA)
│   ├── build.ts         builds into apps/web/dist (not tracked); MANENT_FLAVOUR=test builds the test flavour
│   └── src/
│       ├── main.tsx, router.tsx    entry, router, clean-workspace guard and screen preloading
│       ├── routes/                 route modules: /choose, /, /s/<id> (and /history, /send/<form>, /present, /prompter, /v/<v>, /changes/<a>/<b>), /p/<id>/{board,settings}, /w/<id>/settings[/<group>], /r/<token>, /join/<token>, /preferences[/<pane>], /about
│       ├── boot/, pwa/, sw/        boot script, service-worker lifecycle, install store, offline-readiness notice and offline warming
│       ├── screens/                Studio Desk chooser, Library & Series Overview, Document, History, Send, Present, Board, Reader, Settings, About
│       ├── editor-host/            the sole zone importing @manent/editor and @manent/crdt-binding values
│       ├── shell/, settings-shell/ app shell, desktop titlebar integration, command palette, regions, announcer, shared settings chrome
│       ├── handlers/, services/, state/   command handlers, per-person services, Zustand stores
│       ├── comments/, sharing/, send/, send-draft/, reader/, room/, room-log/, beside/   collaboration and review surfaces
│       ├── history/, production/, checks/, material/, names/, facts/, numbers/, goals/, writing-tools/   editorial and production workflows
│       ├── rundown/, prompter/, prompter-files/, templates/, graphics/, timing/   broadcast and media workflows
│       ├── game/, ink/             Game Script player Beside and Ink Web Worker compiler & player
│       ├── import/, archive/, desktop/   file imports, project archives, desktop bridge
│       ├── demo/                   the fenced @manent/demo zone (with test-only screens/states/): demo-bridge.ts, Demo Stage & Tour
│       └── text.ts                 the web app's own sentences
├── server/          the server program: reads environment (env.ts), opens storage, search & checkpoint worker, seeds demo, listens
└── desktop/         the Electrobun desktop shell (see docs/development/desktop.md)
```

## bench/, e2e/, tools/

```text
bench/
├── harness.ts, budgets.ts, measure.ts, run.ts  harness: fresh processes, bootstrap percentiles, quiet checks
├── env.ts, tiers/                              tier, slowdown, mode and Docker tier orchestration
├── budgets.json                                budgets and hard limits, judged on each area's reference tier
├── client/  crdt/  server/  corpus/  demo/     scenarios, *.bench.ts
└── results/                                    one JSON file per run (not tracked)

e2e/
├── playwright.config.ts    Chromium, Firefox and WebKit against one isolated demo
├── smoke/ editor/ interface/ sync/ offline/ typesetting/ rundown/ series/   functional and WCAG 2.2 AA suites
├── tour/                   one test per Tour scenario (93 scenarios across web and desktop)
├── clone/                  clones the repository and starts the demo from the clone
└── support/                shared helpers

tools/
├── demo/                   the launcher behind make demo, seed-check and supervisor
├── check-*.ts              the gate's checks: tracked files, boundaries, records, Tour, UI rules, colours, glossary, stock
├── glossary/               domain vocabulary modules (paired with plain-words.ts)
├── e2e-parallel.ts         runs Chromium, Firefox and WebKit Playwright suites concurrently on isolated ports
├── build-server-release.ts compiles all six release server binaries and archives apps/web/dist concurrently
├── boundaries.config.ts    which workspace may import which
├── records.config.ts       the rules of the public documents
├── stamp-site.ts           stamps `?v=<sha256>` cache-busting hashes across site/
├── unicode/                generates Courier Prime, Source Serif 4 and Unicode tables from vendored data
├── theme/                  theme token parser, contrast verifier and standalone 24-gem Museum showcase
├── notices.ts              writes the third-party licence notices that ship with releases
├── desktop/                desktop build, icon generation, checksum-verified toolkit download, size check, smoke and headless tools
└── test/                   tests of the checks and of the repository's conventions
```
