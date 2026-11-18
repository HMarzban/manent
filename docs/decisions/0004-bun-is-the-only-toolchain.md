# 0004. Bun is the only toolchain

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

A TypeScript project usually runs several tools side by side: a runtime, a package manager, a test runner, a bundler, a formatter and a type checker, each with its own configuration and version. The project owner wanted the server, the desktop app's local process and the tooling to share one runtime, used for what it offers rather than as a faster Node.

## Options considered

- The usual Node tool set. Rejected: more moving parts, and the desktop app's local process would need a second runtime.
- Bun as the runtime only, with other tools around it. Rejected: most of the configuration remains, for little gain.
- Bun for everything it covers. Chosen.

## Decision

Bun 1.4.4, pinned by `packageManager` in the root `package.json`, is the runtime, package manager, test runner, bundler, formatter (`bun fmt`) and type checker (`bun check`). Lint is oxlint, because Bun has no linter. npm, yarn, pnpm and npx are not used.

## Consequences and trade-offs

- One install and one version to pin.
- Maturity is the cost. `bun check` and `bun fmt` were a few weeks old when this was decided, and the 1.4 line is a recent rewrite of Bun itself.
- What Bun itself labels experimental or unstable stays unused, namely `bun:ffi`, Redis pub/sub, the server's HTTP/2 and HTTP/3, `Bun.markdown` and the React Compiler flag. Bun's `Worker` is experimental too; where one is used it is long-lived and never terminated.
- `typescript` stays installed for the editor's language server.
- Bun's server sits behind a thin adapter (`apps/server/src/bun-adapter.ts`), and SQLite is to do the same, so a Bun defect that blocks one system moves an adapter, not the code above it.

## Revisit when

A Bun defect blocks a supported system with no workaround, or one of its young built-in tools gives results the gate cannot trust.
