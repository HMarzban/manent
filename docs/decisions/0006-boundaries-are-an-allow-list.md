# 0006. Package boundaries are an allow-list, checked from source text

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

The workspaces sit in layers that depend only downwards: a document engine never imports the interface, a pure package never touches the browser or Bun, and one package alone imports the CRDT library. Rules of this kind decay unless something refuses the import that breaks them.

## Options considered

- A lint plugin for import rules. Rejected: layers and runtimes would need a configuration language of their own, and the type-only form of an import is easily lost.
- Compiler project references. Rejected: they describe build order, not which package may import which, nor which globals a package may name.
- Convention and review alone. Rejected: a rule nothing checks is broken by the first hurried change.
- A small checker that reads a table of rules as data. Chosen.

## Decision

`RULES` in `tools/boundaries.config.ts` has one row per workspace: its layer, its runtime (pure, browser or Bun), who may import it, the packages it may import, and which of those for types only. The same table says where certain libraries may be imported, sets path-scoped zones inside a workspace, and holds the rules for test code and for a package's `./testing` entry. A workspace without a row is itself a violation. `tools/check-boundaries.ts` reads the source as text, so it sees `import type`, and `bun run boundaries` runs it in the gate. The table is the reference; this record does not repeat it.

## Consequences and trade-offs

- A new import edge is a one-line change to data, visible in review.
- The scanner has limits, stated at the top of `tools/source-scan.ts`: it does not understand regular-expression literals or JSX text, it takes a template literal as one string, and it needs a specifier written as a string literal. A pattern built with `new RegExp(...)` avoids the first limit (see the lessons).

## Revisit when

One of the scanner's limits hides a real violation, or a rule needs something only a full parser can tell.
