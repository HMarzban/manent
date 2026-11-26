# Working in this repository

Rules for everyone who changes this repository, human or AI agent.

## The gate

- The toolchain is Bun 1.4.4: never npm, yarn, pnpm or npx.
- `bun run verify` is the one gate: `verify:checks` (parallel static checks) then `test:unit` (`bun test --parallel`). While iterating, use `bun run verify:checks`, `bun test --parallel <paths>`, `bun run test:e2e:parallel` and `bun run format`.

## Boundaries

- Libraries live in `packages/`, thin entry points in `apps/`. Apps import packages; nothing imports an app, `bench`, `e2e` or `tools`.
- A package imports only what `tools/boundaries.config.ts` allows and its own `package.json` declares, by name (`@manent/<name>`), never a file inside another package.
- Pure packages (`schema`, `settings`, `sync-protocol`, `perf`, `pagination`, `revisions`, `crdt`, `sync-client`, `commands`) use nothing from the DOM, Bun or Node, and name nothing after a DOM global such as `document`. Packages that run in a browser import no `bun:` or `node:` module; elsewhere a Node built-in is `node:fs`, never `fs`.
- Only `crdt` imports `yjs`, only `crdt-binding` imports `y-prosemirror`, only `apps/desktop` imports `electrobun`.
- A type is imported in its own `import type { X }` statement; the inline `import { type X }` counts as a value import.
- External versions live in the root catalog (`catalog:`); internal ones are `workspace:*`.
- Importing a module does nothing: packages export factories and apps start them.
- Only the public tree listed in `tools/check-tracked.ts` is tracked. Working notes are kept out of the repository.

## Code

The gate does not check these yet; review does:

- Leave nothing the change does not need: no unused export, option or file, and nothing said twice.
- Test first: watch the test fail for the reason you expect, then pass. Assert exact values. Never weaken, skip or delete a test to pass the gate.
- Tests live in `<workspace>/test/*.test.ts` and import from `bun:test`.
- Stored shapes and wire formats only gain members: nothing is renamed, removed or reordered.
- One concept has one name. Identifiers use American spelling (`normalizeDoc`); prose is British.
- A pattern holding a quote, a backtick or `/*` is built with `new RegExp("…")`; the boundary scanner cannot read such a literal.
- Text shown to a person (interface, terminal, README) never uses the words "generation", "rebuild", "conflict", "error" or "failed".
- A commit is `<type>(<scope>): <summary>`: type `feat`, `fix` or `chore`, the workspace as scope, present tense.

## Records

Keep these with every change:

- [CHANGELOG.md](CHANGELOG.md): every merged change adds one entry under Unreleased, newest first, for a reader who did not see the work.
- [Decision records](docs/decisions/README.md): a decision that constrains later work gets a record before the code that depends on it merges.
- [Lessons](docs/memory/lessons.md): a review finding or incident that reveals a class of mistake adds a lesson with the rule that now prevents it. Read the lessons that touch your change first.
- A change to what works updates the README's status table and [the architecture overview](docs/architecture/overview.md) in the same commit.

For all of them:

- A record is never rewritten to hide a mistake. A wrong decision is superseded by a new record, and the old one stays.
- A record stands on its own: it cites nothing outside this repository and no section or task numbers, names no private person, and attributes a decision to a role, project owner or engineering lead.
- Outside `LICENSE`, only the README's fixed Acknowledgement and Licence sections name the project that inspired Manent or hold an email address.
- A measured claim states its conditions and limits. Nothing is called verified unless it was run.
