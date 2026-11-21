# Manent

A collaborative, offline-capable script-writing app being built for film, series, shows, news, podcasts and books. What it aims at: true script pages, version history, production revisions, and offline work that is never silently lost.

**Status, 2026-11-18: early.** The foundation is in the repository. The editor is not. This page says exactly what runs.

## Run it

You need [Bun](https://bun.com) 1.4.4 or later.

```sh
make demo        # without make: bun run demo
```

It installs the dependencies, builds the web app, seeds the demo data, starts the server on your machine under a small supervisor and opens `http://localhost:4747`. `make demo LAN=1` lets a second machine on your private network join. To stop: Ctrl+C, or `make stop`. `make reset` seeds the demo data again.

## What opens

1. **Choose who you are.** Six demo people, each with a title; one click, no password. Each browser tab is its own person, so two tabs can be two people.
2. **Library**, which is empty: "No scripts yet". The demo stops here.

A bar labelled "Demo" lets you switch person and stop or start the server, and a Tour panel lists eight groups, each still marked "Not in this build yet". The server listens on your machine only, and with `LAN=1` on one private address as well; it refuses a public address, because the demo has no passwords.

## What exists and what does not

| Built                                                                                                              | Planned                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Repository structure in six layers, with the imports between packages checked                                      | Page engine and paginated editor                                  |
| Quality gate: `bun run verify` (format, types, lint, tracked files, boundaries, project records, Tour, unit tests) | Storage, the server's write path, the client outbox, offline work |
| Document schema: sections, one block node, stable block IDs, validation, one canonical form                        | Version history and production revisions                          |
| Binary sync protocol, and a server socket that answers its handshake                                               | Rooms: the socket refuses every document until they exist         |
| CRDT package: documents, writes addressed to a block, all-or-nothing updates                                       | The editor's binding to it                                        |
| Server: HTTP, demo sign-in, sessions, static web app                                                               | Desktop app                                                       |
| `make demo`: launcher, supervisor, the demo people and empty workspaces                                            | Seeded scripts and Tour scenarios                                 |
| Web app: person chooser, empty Library, demo bar                                                                   |                                                                   |
| End-to-end tests in three browser engines, a fresh-clone test, a continuous-integration workflow for three systems |                                                                   |
| Benchmark harness (no scenarios yet)                                                                               | Benchmark scenarios and the published report                      |
| Project records: changelog, decision records, lessons                                                              |                                                                   |

## Read next

- [Architecture overview](docs/architecture/overview.md): how the system is put together and why, with the status of every part
- [Layers and dependency rules](docs/architecture/layers.md): which package may import which, and how that is checked
- [Repository outline](docs/architecture/repository.md): every folder, and the commands a contributor uses
- [Decisions](docs/decisions/README.md): what was decided, what else was considered, and what each choice costs
- [Lessons](docs/memory/lessons.md): mistakes and near-misses, and the rule each one produced
- [Changelog](CHANGELOG.md): what changed, newest first
- [AGENTS.md](AGENTS.md): the rules for anyone who changes this repository

## Acknowledgement

Manent was inspired by [Scripto](https://scripto.com), cloud-based collaborative screenwriting and script management software. The idea of one shared editor for a whole production comes from Scripto, and this project is grateful for it.

Manent is an independent project, written from scratch. It contains no Scripto code, design or content. It is not affiliated with or endorsed by Scripto, and Scripto is a trademark of its owners. Manent explores different directions, such as offline writing, page-accurate pagination and revision history.

Thank you to the Scripto team.

## Licence

Manent is licensed under the Apache License 2.0. The [LICENSE](LICENSE) file is the authority; this paragraph only points to it.

If you like the project, get in touch: https://github.com/HMarzban or marzban98@gmail.com
