# Set up a development copy

How to get Manent running from source, and the commands you will use every day.

## Requirements

- **Bun 1.4.4.** It is the only toolchain: never npm, yarn, pnpm or npx. The version is pinned in `package.json` (`packageManager`) and in the CI workflow.
- **Git.**
- **macOS, Linux or Windows.** CI runs the gate and the end-to-end tests on all three; it does not pass on every one yet.
- **Playwright's browsers**, for the end-to-end tests only (see [Testing](testing.md)).

## Get the code

```sh
git clone https://github.com/HMarzban/manent.git
cd manent
bun install
```

`bun install` installs from `bun.lock`, the only lockfile. `bunfig.toml` refuses any package release younger than three days, so a dependency is never one published minutes ago.

## Run the app

```sh
make demo            # or: bun run demo
```

[Getting started](../guide/getting-started.md) says what `make demo` does, its options for other ports and folders, and what to try. It builds the web app into `apps/web/dist`.

| Command                        | What it does                                                     |
| ------------------------------ | ---------------------------------------------------------------- |
| `make demo` / `bun run demo`   | Build, create the demo data if needed, start and open the app    |
| `make demo LAN=1`              | The same, and listen on one private address for a second machine |
| `make stop` / `bun run stop`   | Stop the server and the supervisor                               |
| `make reset` / `bun run reset` | Delete the demo data and create it again                         |
| `bun run build:web`            | Build the web app only                                           |
| `bun tools/stamp-site.ts`      | Stamp `?v=<sha256>` hashes across `site/` (`--check` verifies)   |
| `make` (no target)             | List the targets                                                 |

After a change to the web app, stop the demo and run `make demo` again: it rebuilds the app before it starts. There is no watch mode.

### The server's settings

`make demo` sets these for the server program (`apps/server`). Set them yourself only to run `bun apps/server/src/main.ts` by hand.

| Variable                                     | Default         | Meaning                                                                                       |
| -------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `MANENT_DEMO`                                | none            | Must be `1`. This build has only the demo sign-in, and the server will not start without it   |
| `MANENT_PORT`                                | `4747`          | The port on loopback                                                                          |
| `MANENT_LAN_HOST`                            | none            | One private-range address to listen on as well. A public or wildcard address is refused       |
| `MANENT_DATA_DIR`                            | `.manent-demo`  | The session key, and the SQLite files in `data/`                                              |
| `MANENT_WEB_DIR`                             | `apps/web/dist` | The built web app                                                                             |
| `MANENT_CONTROL_URL`, `MANENT_CONTROL_TOKEN` | none            | Set together: where the demo bar's server buttons are answered                                |
| `MANENT_RESEND_API_KEY`                      | none            | Set with `MANENT_RESEND_FROM`: Resend API key for Workspace settings → Notifications email    |
| `MANENT_RESEND_FROM`                         | none            | Set with `MANENT_RESEND_API_KEY`: sender address for Workspace settings → Notifications email |

`MANENT_FLAVOUR=test bun run build:web` builds the test flavour of the web app, which adds the hooks and screens the end-to-end tests use. Anything else builds the product.

## The gate

```sh
bun run verify
```

One command decides whether a change is finished. It runs the seven static checks concurrently via `verify:checks` (`bun run --parallel`) and stops before `test:unit` if any check does not pass:

| Step            | Tool                        | Checks                                                                                               |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `verify:checks` | `bun run --parallel`        | Runs all seven static checks below concurrently                                                      |
| `format:check`  | `bun fmt --check`           | Formatting. `bun run format` fixes it                                                                |
| `typecheck`     | `bun check`                 | Types, in strict mode                                                                                |
| `lint`          | oxlint                      | Correctness and suspicious patterns; warnings fail                                                   |
| `tracked`       | `tools/check-tracked.ts`    | Every tracked file is on the allow-list of the public tree                                           |
| `boundaries`    | `tools/check-boundaries.ts` | Every import is allowed by `tools/boundaries.config.ts` (see [Layers](../architecture/layers.md))    |
| `records`       | `tools/check-records.ts`    | The changelog, decision records, lessons, README and these documents keep their rules; links resolve |
| `tour`          | `tools/check-tour.ts`       | Every Tour scenario has its end-to-end test, and every Tour test its scenario                        |
| `test:unit`     | `bun test --parallel`       | Isolated multi-process unit, property and DOM tests in `bench`, `tools`, `packages` and `apps`       |

Each step is also a script of its own, so `bun run lint` runs one. Some repository rules are unit tests and so run in the last step: the size limit of a source file (400 lines), the interface rules, the colour rule (every colour is a token in `packages/ui/src/theme.css`) and the glossary of interface words.

Most of the gate's time goes to the unit tests. To run one package's tests while you work, see [Testing](testing.md).

## Find your way around

- [Repository outline](../architecture/repository.md): every folder.
- [Architecture overview](../architecture/overview.md): how the parts fit together.
- [Testing](testing.md), [Benchmarks](benchmarks.md), [Desktop app](desktop.md).
- [Coding standards](standards.md).
