# Layers and dependency rules

Which code may import which, as it is enforced today. Everything here is read from `tools/boundaries.config.ts` (the rules, as data) and `tools/check-boundaries.ts` (the check that applies them); where they and this page disagree, they are right and this page is out of date. The check runs as a step of `bun run verify`. For what each package does, see [overview.md](overview.md).

## 1. The layers

```text
 Presentation and composition   ui · demo · web · server · desktop                            screens, demo content, entry points
 Application                    crdt-binding · editor · commands                              editing and the commands behind it
 Services                       sync-client · client-web · storage · server-core · local-node    sync, storage, the authority
 Domain engines                 pagination · revisions · crdt · formats                       the document's rules, as libraries
 Kernel                         schema · settings · sync-protocol · perf                      shared values and rules
 Tooling                        testkit · bench · e2e · tools                                 outside the layers
```

The check enforces each row of the table below, edge by edge, and no edge in it points up a layer.

## 2. The allowed-dependency table

One row per workspace, in the order of `RULES`. `@manent/` is left out of every name. "May import" is the whole list of internal packages a workspace's code may import; anything else is refused. "Any declared" means any library the workspace's own `package.json` declares.

| Workspace       | Layer                        | Runtime | May import (internal)                                                                                                                                                        | External libraries                                                    |
| --------------- | ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `schema`        | Kernel                       | pure    | nothing                                                                                                                                                                      | `prosemirror-model`                                                   |
| `settings`      | Kernel                       | pure    | nothing                                                                                                                                                                      | none                                                                  |
| `sync-protocol` | Kernel                       | pure    | nothing                                                                                                                                                                      | `lib0`                                                                |
| `perf`          | Kernel                       | pure    | nothing                                                                                                                                                                      | none                                                                  |
| `pagination`    | Domain engines               | pure    | `schema` (types only)                                                                                                                                                        | none                                                                  |
| `revisions`     | Domain engines               | pure    | `schema`, `pagination`                                                                                                                                                       | `prosemirror-changeset`, `prosemirror-model`, `prosemirror-transform` |
| `crdt`          | Domain engines               | pure    | `schema`                                                                                                                                                                     | `yjs`, `y-protocols`, `lib0`                                          |
| `formats`       | Domain engines               | browser | `schema`, `pagination`, `revisions`                                                                                                                                          | any declared                                                          |
| `sync-client`   | Services                     | pure    | `sync-protocol`, `crdt`, `revisions`, `schema`, `perf`                                                                                                                       | none                                                                  |
| `client-web`    | Services                     | browser | `sync-client`, `sync-protocol`, `perf`                                                                                                                                       | any declared                                                          |
| `storage`       | Services                     | Bun     | `perf`                                                                                                                                                                       | any declared                                                          |
| `server-core`   | Services                     | Bun     | `storage` (types only), `sync-protocol`, `crdt`, `schema`, `revisions`, `pagination`, `formats`, `settings`, `perf`                                                          | any declared                                                          |
| `local-node`    | Services                     | Bun     | `server-core`, `sync-client`, `storage`, `sync-protocol`, `crdt`, `schema`, `perf`                                                                                           | any declared                                                          |
| `crdt-binding`  | Application                  | browser | `crdt`, `editor` (types only), `schema`                                                                                                                                      | any declared                                                          |
| `editor`        | Application                  | browser | `schema`, `pagination`, `revisions`, `settings` (types only), `perf`                                                                                                         | any declared                                                          |
| `commands`      | Application                  | pure    | `settings`                                                                                                                                                                   | none                                                                  |
| `ui`            | Presentation and composition | browser | `commands`, `settings`, `perf`                                                                                                                                               | any declared                                                          |
| `demo`          | Presentation and composition | browser | `schema`, `crdt`, `sync-protocol`, `sync-client`, `server-core` (types only)                                                                                                 | any declared                                                          |
| `web`           | Presentation and composition | browser | `ui`, `commands`, `settings`, `editor`, `crdt-binding`, `crdt`, `client-web`, `sync-client`, `sync-protocol`, `schema`, `pagination`, `revisions`, `formats`, `perf`, `demo` | any declared                                                          |
| `server`        | Presentation and composition | Bun     | `server-core`, `storage`, `demo`, `crdt`, `sync-client`, `sync-protocol`, `schema`, `pagination`, `revisions`, `settings`, `formats`, `perf`                                 | any declared                                                          |
| `desktop`       | Presentation and composition | Bun     | `local-node`, `server-core`, `storage`, `demo`, `sync-protocol`, `perf`                                                                                                      | any declared                                                          |
| `testkit`       | Tooling                      | Bun     | any package                                                                                                                                                                  | any declared                                                          |
| `bench`         | Tooling                      | Bun     | any package                                                                                                                                                                  | any declared                                                          |
| `e2e`           | Tooling                      | Bun     | any package                                                                                                                                                                  | any declared                                                          |
| `tools`         | Tooling                      | Bun     | any package                                                                                                                                                                  | any declared                                                          |

Who may import a workspace is part of its row. The three apps, `bench`, `e2e` and `tools` are never imported, by name or by a relative path. `testkit` is imported only by test code and tooling. Every other package may be imported by any workspace whose row lists it. A types-only edge lets `import type` and `export type` statements cross and nothing else.

Some libraries are confined: whatever the rows say, only the workspaces named here may import them from their product code.

| Library or module                                                                                                     | Only in                                                |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `yjs`, `y-protocols`                                                                                                  | `crdt`                                                 |
| `y-prosemirror`                                                                                                       | `crdt-binding`                                         |
| `electrobun`                                                                                                          | `desktop`                                              |
| `bun:sqlite`                                                                                                          | `storage`, `local-node`                                |
| `prosemirror-model`                                                                                                   | `schema`, `revisions`, `editor`, `crdt-binding`, `e2e` |
| `prosemirror-state`, `prosemirror-view`                                                                               | `editor`, `crdt-binding`, `e2e`                        |
| `prosemirror-transform`                                                                                               | `revisions`, `editor`                                  |
| `prosemirror-keymap`, `prosemirror-commands`, `prosemirror-inputrules`, `prosemirror-gapcursor`, `prosemirror-search` | `editor`                                               |
| `prosemirror-changeset`                                                                                               | `revisions`                                            |

## 3. Pure and browser packages

Nine rows are pure: `schema`, `settings`, `sync-protocol`, `perf`, `pagination`, `revisions`, `crdt`, `sync-client` and `commands`. Pure code runs unchanged in a browser, a worker, the server and a test. In a pure package's product code the check refuses:

| Refused                                 | Detail                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A built-in module                       | `bun`, any `bun:` module, any `node:` module                                                                                               |
| An external library off the row's list  | The lists are in the table above; `settings`, `perf`, `pagination`, `sync-client` and `commands` have none                                 |
| Ten globals                             | `Bun`, `process`, `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, `requestAnimationFrame`, `HTMLElement` |
| Six more globals, in `sync-client` only | `WebSocket`, `BroadcastChannel`, `fetch`, `setTimeout`, `setInterval`, `Date`                                                              |

A global counts as used when it is followed by `.`, `[`, `(` or `?`, or read from `globalThis`.

Seven rows run in a browser: `formats`, `client-web`, `crdt-binding`, `editor`, `ui`, `demo` and `web`. Their product code may not import `bun`, a `bun:` module or a `node:` module. Their use of globals is not checked.

## 4. One entry point, and the testing entry

Every workspace that can be imported declares its entry points in the `exports` of its `package.json`, and the check accepts only these keys:

| Key            | Must point to            | Where                                                                                    |
| -------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `.`            | `./src/index.ts`         | Required in every such workspace                                                         |
| `./testing`    | `./src/testing/index.ts` | Any such workspace: the fakes of its ports and the fixtures other workspaces' tests need |
| `./dom`        | `./src/dom.ts`           | A tooling row only                                                                       |
| `./<name>.css` | `./src/<name>.css`       | Any such workspace: a stylesheet                                                         |

Each target must exist. The apps, `bench`, `e2e` and `tools` are never imported, so their `exports` are not read.

A package is imported by its name, never by a path inside it: `@manent/schema` is accepted, `@manent/schema/src/attrs.ts` is refused, and so is a relative path that climbs into another workspace. Only test code and tooling may import a `./testing` or `./dom` entry, or `testkit`; code under a package's `src/testing/` may import another package's `./testing` entry but not `testkit`.

## 5. Zones

A zone keeps something inside some folders of one workspace. Product code of that workspace outside the folders is refused it.

| Workspace     | Folder             | Outside the folder                                                                                  |
| ------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `server-core` | `src/http/`        | No code may use the `Bun` global, so only the HTTP edge depends on the Bun runtime                  |
| `web`         | `src/editor-host/` | No code may import values from `@manent/editor` or `@manent/crdt-binding`; `import type` is allowed |

## 6. Test code

Test code is every file under a workspace's `test/` or `src/testing/` folder, and every file named `*.test.ts`, `*.test.tsx` or `*.e2e.ts`. It may import only the internal packages its row lists, plus `testkit` (except from `src/testing/`) and a package's `./testing` or `./dom` entry; it may not import an app or reach past an entry point. It is free of the rest: types-only edges, declared dependencies, external lists, confined libraries, built-in modules and globals are not checked in it. Product code may not reach into its own workspace's `test/` or `src/testing/` by a relative path.

The files read are, for the workspaces under `packages/` and `apps/`, the `.ts` and `.tsx` files in `src/` and `test/`, and for `bench`, `e2e` and `tools`, every `.ts` and `.tsx` file; `node_modules` is skipped. A build script beside an app's `src/` is not read.

## 7. How to add a package or a dependency

**A new package**

1. Create `packages/<name>/package.json` with the name `@manent/<name>`, `"private": true`, `"type": "module"` and `"exports": { ".": "./src/index.ts" }`, and create `src/index.ts`.
2. Add a row for it to `RULES` in `tools/boundaries.config.ts`: its layer, its runtime, who may import it, the internal packages it may import and which of them for types only, for a pure row its list of external libraries, and any globals it refuses beyond the shared ten. A workspace with no row is reported as `no-rule`.
3. Add its name to the row of each workspace that may import it.
4. The manifest declares exactly the internal packages its row lists, each as `"workspace:*"`, and `bench`, `e2e` and `tools` declare every package. The repository tests in `tools/test/workspace.test.ts` check both.
5. Add a row for the package to the table in [overview.md](overview.md); the records check requires one for every workspace.
6. Run bun install, then bun run verify.

**A new edge between existing packages**

1. Add the target to the importer's `internal` list, and to its `typesOnly` list when only types should cross.
2. Declare `"@manent/<target>": "workspace:*"` in the importer's `package.json`.
3. Check that the edge does not point up a layer. One that must is a sign that the code belongs in a lower package.

**A new external library**

1. Add it to the catalog in the root `package.json` with an exact version, such as `1.2.3`, never a range; `tools/test/workspace.test.ts` checks this.
2. Declare it in the importing workspace's `package.json` as `"catalog:"`.
3. For a pure row, add it to that row's `external` list. Each addition there is a library that the browser, the server and every test will carry.
4. If only some workspaces may ever import it, add it to `restrictedExternal` with their names.

A change to `tools/boundaries.config.ts` is an architecture change and should be reviewed as one.

## 8. What the check reports

`bun run boundaries` runs the check alone. On success it prints one line and exits 0:

```text
boundaries: 0 violations in 190 files
```

Otherwise it prints one line per violation, `file:line rule message`, sorted by file and line, and exits 1. Two invented examples:

```text
packages/editor/src/index.ts:3 allow-list @manent/editor may not import @manent/storage
packages/pagination/src/wrap.ts:12 pure @manent/pagination may not use document
```

| Rule                  | Raised when                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-list`          | An internal import is not on the importer's list, or a pure row imports an external library that is not on its list                                                     |
| `types-only`          | A value import crosses a types-only edge                                                                                                                                |
| `pure`                | A pure row imports a built-in module or uses a forbidden global                                                                                                         |
| `no-bun`              | A browser row imports a built-in module                                                                                                                                 |
| `deep-import`         | An import names a path inside a package, a `./testing` or `./dom` entry the package does not have, or a relative path into another workspace                            |
| `app-import`          | Anything imports an app, `bench`, `e2e` or `tools`, by name or by a relative path                                                                                       |
| `restricted-external` | A confined library is imported by a workspace that is not one of its homes                                                                                              |
| `undeclared`          | An import names a package the importing workspace's `package.json` does not declare                                                                                     |
| `single-entry`        | An importable workspace's `exports` lacks `"."` pointing to `./src/index.ts`, holds another key or target than those of part 4, or points to a file that does not exist |
| `catalog`             | A dependency's version is not `"workspace:*"` for an internal package or `"catalog:"` for an external one                                                               |
| `no-rule`             | A workspace has no row in `RULES`                                                                                                                                       |
| `testing-entry`       | Product code outside tooling imports a `./testing` or `./dom` entry or `testkit`, or code under `src/testing/` imports `testkit`                                        |
| `test-code`           | Product code reaches into its own workspace's `test/` or `src/testing/` by a relative path                                                                              |
| `zone`                | Product code outside a zone's folders uses that zone's global or imports a value from that zone's packages                                                              |
| `inline-type`         | An `import { … }` or `export { … }` statement marks a name with `type` inside its braces; a type needs its own `import type` or `export type` statement                 |

## 9. What the check does not do

Stated so that nobody assumes more than is enforced.

- **It reads source as text, not as a syntax tree.** Comments and the contents of strings are masked first. It does not understand regular-expression literals or JSX text, it reads a template literal as one string up to its closing backtick, and it sees an import only when the specifier is a string literal; one computed at run time is invisible to it.
- **Globals are checked only in pure rows and zones, and only where they are used** as part 3 says; a global passed around as a bare value is not seen. Browser rows are kept from built-in modules, not from globals.
- **A row that is not pure has no list of external libraries.** Any declared library is accepted, unless it is confined.
- **Three rules are conventions, with no check behind them:** `server-core` and `local-node` export factories and never listen on a port themselves; importing a module has no side effect, such as opening a socket or a database; the apps stay thin.
