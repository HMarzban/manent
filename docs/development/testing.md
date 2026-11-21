# Testing

Manent has four kinds of test. The unit tests run in the gate (`bun run verify`); the others run in CI and on demand.

| Kind                      | Where                                 | Runner                      | In the gate |
| ------------------------- | ------------------------------------- | --------------------------- | ----------- |
| Unit, property and DOM    | `<workspace>/test/*.test.ts(x)`       | `bun test`                  | Yes         |
| End-to-end, three engines | `e2e/**/*.e2e.ts`                     | Playwright                  | No; CI      |
| Fresh clone               | `e2e/clone/fresh-clone.test.ts`       | `bun test`                  | No; CI      |
| Long runs                 | durability, simulation and fuzz seeds | `bun test` with more rounds | No          |

`make test` (or `bun run test`) runs the unit, end-to-end and fresh-clone tests in turn.

## Unit tests

```sh
bun run test:unit                                   # all of them, as the gate runs them
bun test --isolate packages/schema                  # one workspace
bun test --isolate packages/schema/test/validate.test.ts   # one file
```

- A test lives in `<workspace>/test/` and imports from `bun:test`.
- **Property tests** use fast-check, for example `packages/crdt/test/convergence.test.ts` and `packages/pagination/test/properties.test.ts`.
- **DOM tests** are named `*.dom.test.tsx`. Their first import is `import { withDom } from "@manent/testkit/dom"`, and they call `withDom()`; that registers happy-dom for the file. A rule in the gate checks the import comes first.
- **Simulations.** `packages/testkit` drives the sync client and server through a simulated network, devices and storage, seed by seed. `apps/web/test/status-simulation.test.ts` does the same for the status a person sees.

## End-to-end tests

The end-to-end tests start a real demo, with its own data in a temporary folder, and drive it in Chromium, Firefox and WebKit through Playwright.

```sh
bun run --filter @manent/e2e install-browsers   # once
bun run test:e2e                                 # build the test flavour, then every test in every engine
```

`test:e2e` builds the web app's test flavour first (`MANENT_FLAVOUR=test`). To run a part of the suite, build once and then call Playwright through the e2e workspace:

```sh
MANENT_FLAVOUR=test bun run build:web
bun run --filter @manent/e2e test smoke --project webkit
bun run --filter @manent/e2e test editor/flow --project chromium
```

The words after `test` filter by file path; `--project` is `chromium`, `firefox` or `webkit`.

| Folder             | What it covers                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `e2e/smoke/`       | The demo: choosing a person, the Library, the demo bar, stopping and starting the server   |
| `e2e/editor/`      | Typing, the Enter and Tab flow, the picker, paste, composition, another writer, zoom       |
| `e2e/interface/`   | Screens, focus, the palette, preferences, keyboard rebinding, Export and Print, axe checks |
| `e2e/sync/`        | The local store, offline work and its merge, tabs sharing one connection                   |
| `e2e/typesetting/` | Page layout against the engine, fonts, line positions, the PDF                             |
| `e2e/tour/`        | One test per Tour scenario. Empty: there are no scenarios yet                              |

### Ports

The suite's demo listens on port 4757 and its supervisor on 4758. `MANENT_E2E_PORT` moves both (the supervisor takes the next port), so two copies of the repository can run the suite at once:

```sh
MANENT_E2E_PORT=4791 bun run --filter @manent/e2e test smoke --project webkit
```

The tests run one at a time (`workers: 1`), because some of them stop and start the one server.

## Fresh clone

```sh
bun run test:clone
```

Clones the repository into a temporary folder, starts the demo from the clone on ports 4767 and 4768, checks that it answers, and stops it. It catches anything the demo needs that is not tracked.

## Long runs

Some tests take a count from the environment, so CI stays quick and a long run is one variable away:

| Command or variable       | Default | What it does                                                                                                                           |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:durability` | 200     | Kills the server under load from three editors, round after round, and checks that no acknowledged change is lost (`MANENT_KILLS=200`) |
| `MANENT_KILLS`            | 20      | Rounds of the same test inside the gate                                                                                                |
| `MANENT_SIM_SEEDS`        | 25      | Seeds of the sync and status simulations                                                                                               |
| `MANENT_FUZZ_RUNS`        | 100     | Runs of the conservation fuzz test                                                                                                     |
| `bun run test:offline`    | —       | Only the offline end-to-end test, after a test-flavour build                                                                           |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request, on Ubuntu, macOS and Windows. Each runner installs Bun 1.4.4 and the dependencies from the lockfile, installs the browsers, then runs `bun run verify`, `bun run test:e2e` and `bun run test:clone`. A unit test pins the workflow, so a change to it is a deliberate one.

## Writing a test

- Write the test first and watch it fail for the reason you expect.
- Assert exact values. A test that cannot fail is not a test.
- Never weaken, skip or delete a test to make the gate pass. `test.skip`, `test.only` and `test.todo` are not committed.
- A test that needs a temporary folder uses `createTempTrees` from `@manent/testkit`, which removes what it made.
