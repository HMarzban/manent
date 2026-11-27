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
bun run verify:checks                                     # all seven static checks in parallel
bun run test:unit                                         # all unit tests in parallel, as the gate runs them
bun test --parallel packages/schema                       # one workspace (implies --isolate)
bun test --isolate packages/schema/test/validate.test.ts  # one file
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

`test:e2e` is the simple way: it builds the web app's test flavour (`MANENT_FLAVOUR=test`), which adds the hooks and screens the tests use, and runs every test in one engine after another.

The suite's demo builds the web app again each time it starts, in the flavour `MANENT_FLAVOUR` names. So to run a part of the suite, set `MANENT_FLAVOUR=test` on the Playwright command itself:

```sh
MANENT_FLAVOUR=test bun run --filter @manent/e2e test smoke --project webkit
MANENT_FLAVOUR=test bun run --filter @manent/e2e test editor/flow --project chromium
```

The words after `test` filter by file path; `--project` is `chromium`, `firefox` or `webkit`.

The fast way to run the whole suite is all three engines at once with `bun run test:e2e:parallel` (`tools/e2e-parallel.ts`), which starts Chromium, Firefox and WebKit concurrently on ports `4800`, `4810` and `4820` with isolated temporary build folders (`MANENT_WEB_DIR`) and cleans them up on exit. Extra Playwright filters pass straight through:

```sh
bun run test:e2e:parallel
bun run test:e2e:parallel smoke
```

You can still run one engine at a time on a chosen port and folder:

```sh
MANENT_FLAVOUR=test MANENT_WEB_DIR="$(mktemp -d)" MANENT_E2E_PORT=4800 bun run --filter @manent/e2e test --project chromium
MANENT_FLAVOUR=test MANENT_WEB_DIR="$(mktemp -d)" MANENT_E2E_PORT=4810 bun run --filter @manent/e2e test --project firefox
MANENT_FLAVOUR=test MANENT_WEB_DIR="$(mktemp -d)" MANENT_E2E_PORT=4820 bun run --filter @manent/e2e test --project webkit
```

On an 18-core Mac the three took about 7 minutes together, as a rough guide. Both ways leave `apps/web/dist` as it was, so `make demo` keeps its own build.

| Folder             | What it covers                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/smoke/`       | The demo: choosing a person, the Library, the demo bar, stopping and starting the server                                         |
| `e2e/editor/`      | Typing, the Enter and Tab flow, the picker, paste, composition, another writer, zoom                                             |
| `e2e/interface/`   | Screens, focus, the palette, preferences, keyboard rebinding, Export and Print, contextual mode triggers, WCAG 2.2 AA axe checks |
| `e2e/sync/`        | The local store, offline work and its merge, tabs sharing one connection                                                         |
| `e2e/offline/`     | Offline shell, first-visit offline-readiness notice, cold airplane-mode launch, manifest/icons/CSP/404 guards and SW updates     |
| `e2e/typesetting/` | Page layout against the engine, fonts, line positions, the PDF                                                                   |
| `e2e/tour/`        | One test per Tour scenario, on a freshly seeded demo; a scenario the Tour does not show is not run                               |

### Ports

The suite's demo listens on port 4757 and its supervisor on 4758. `MANENT_E2E_PORT` moves both (the supervisor takes the next port), so two copies of the repository, or two engines as above, can run the suite at once:

```sh
MANENT_FLAVOUR=test MANENT_E2E_PORT=4790 bun run --filter @manent/e2e test smoke --project webkit
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
| `MANENT_AGED=1`           | off     | About 13 minutes: builds an aged script in `bench/test/crdt-rebuild.test.ts` and checks the rebuild budget                             |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request, cancelling superseded non-`main` runs and caching `~/.bun/install/cache`. It fans out five parallel jobs with Bun 1.4.4 and a frozen lockfile: `checks` (fast parallel static gate on Ubuntu with no browser download), `verify` (Ubuntu, macOS and Windows with Chromium only for benchmark tests), `e2e` (three OSes × three browser engines in parallel, each installing only its own browser), `clone` (three OSes, no browsers) and `demo` (three OSes, Chromium only, running `seed:check` and `test:demo`). A unit test pins the workflow, so a change to it is a deliberate one.

CI does not pass on every system yet. Until it does, run `bun run verify` and the end-to-end tests that cover a change on your own machine.

## Manual screen-reader audit checklist

Automated `@axe-core/playwright` checks (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) run in `e2e/interface/` (`ux-maturity.e2e.ts`, `surfaces-a11y.e2e.ts`, `smart-palette.e2e.ts`) and `e2e/rundown/axe.e2e.ts` across Chromium, Firefox and WebKit, and `palette.dom.test.tsx` / `smart-palette.e2e.ts` assert `aria-activedescendant`, polite live-region announcements and focus restoration. Automated checks do not substitute for assistive-technology users; when auditing manually with VoiceOver (macOS Safari) or NVDA (Windows Firefox/Chrome), verify:

1. **Command palette (`Ctrl+K` / `⌘K`):** opening moves focus to the `Commands` combobox; `ArrowDown` / `ArrowUp` reads each highlighted option's label, live state (`On` / `Off`), shortcut or disabled reason via `aria-activedescendant`; `Tab` announces the active scope button (`All`, `Commands`, `Settings`, `Go to`, `Scripts`); toggling a `Settings here` switch speaks the polite confirmation without losing focus; `Escape` closes in one press and returns focus to the editor or previous control.
2. **Inline numeric prompts (`Lines per page`, `Read rate`, `Target length`):** the prompt label is read as the input's accessible name, pre-filled values (such as from `lines 52`) are announced as selected, and submitting announces the updated figure and `Undo` action in the status live region.
3. **Regions and panels:** `F6` / `Shift+F6` cycles regions cleanly, direct jumps (`Scenes`, `Comments`, `Checks`, `Preferences: …`) land focus inside the target panel or heading, and closing dialogs or panels returns focus to its opener.

## Writing a test

- Write the test first and watch it fail for the reason you expect.
- Assert exact values. A test that cannot fail is not a test.
- Never weaken, skip or delete a test to make the gate pass. `test.skip`, `test.only` and `test.todo` are not committed. The one exception is a long run that an environment variable switches on, such as `test.skipIf(process.env.MANENT_AGED !== "1")`.
- A test that needs a temporary folder uses `createTempTrees` from `@manent/testkit`, which removes what it made.
