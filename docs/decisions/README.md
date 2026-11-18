# Decisions

One short record per decision that constrains later work. A record says what was decided, what else was considered, what it costs and what would make us look again.

## Rules

- A record is written before the code that depends on it merges.
- Numbers are four digits, in the order the records were written, with no gaps. If `main` took your number first, take the next one.
- A record is not rewritten after it merges, except to fix a typo or to change its status. A decision that turns out wrong gets a new record, and the old one's status becomes `Superseded by NNNN`.
- `Decided by` names a role, never a person: `project owner`, `engineering lead`, or `project owner and engineering lead`.
- Evidence is stated with its conditions (machine, data, number of runs) and with what was not measured.
- Every record is listed in the index below, in order, as `- [NNNN. Title](file)`; a superseded one ends ` — superseded by NNNN`.
- Records 0002 to 0033 were written on 2026-11-17 from working notes, after the decisions had been made. Their date is the day they were recorded.

## Template

File name: `NNNN-short-title.md`, lower case, words joined by hyphens.

```text
# NNNN. Title in sentence case

- Date: YYYY-MM-DD
- Status: Accepted
- Decided by: project owner

## Context

What forced a decision, and the constraints that applied.

## Options considered

Each option, with the reason it was or was not chosen.

## Decision

What was decided, in one or two sentences.

## Consequences and trade-offs

What this buys, what it costs, and where the limit is.

## Revisit when

The evidence or event that would reopen this.
```

## Index

- [0001. Keep public project records, checked by the gate](0001-public-project-records.md)
- [0002. Working notes stay out of the repository, and the public tree is an allow-list](0002-working-notes-stay-out.md)
- [0003. A measured claim carries its conditions](0003-measured-claims-carry-conditions.md)
- [0004. Bun is the only toolchain](0004-bun-is-the-only-toolchain.md)
- [0005. One workspace, one lockfile, one version catalog](0005-one-workspace-one-catalog.md)
- [0006. Package boundaries are an allow-list, checked from source text](0006-boundaries-are-an-allow-list.md)
- [0007. One gate: `bun run verify`](0007-one-local-gate.md)
- [0008. Packages export factories, and importing a module does nothing](0008-factories-and-quiet-imports.md)
- [0009. The first release is a demo that runs on one machine](0009-first-release-is-a-local-demo.md)
- [0010. The demo has no passwords, so the server refuses to be reachable](0010-password-less-demo-stays-local.md)
- [0011. One document must stay comfortable at 2,000 pages](0011-two-thousand-pages.md)
- [0012. The benchmark ships with the app, and its budgets are checked data](0012-benchmark-ships-with-the-app.md)
- [0013. Plain ProseMirror, without a wrapper framework](0013-plain-prosemirror.md)
- [0014. One block node whose element is an attribute](0014-one-block-node.md)
- [0015. Invisible sections keep long documents fast](0015-invisible-sections.md)
- [0016. Every block carries its own stable ID](0016-stable-block-identity.md)
- [0017. One document per script, episode, segment or story, stored one file per project](0017-one-document-per-script.md)
- [0018. Schema and wire changes only add, and content from a newer build is kept](0018-additions-only.md)
- [0019. Pagination is a pure function of the document, drawn with decorations](0019-pagination-is-a-pure-function.md)
- [0020. What can be derived is not stored](0020-derived-not-stored.md)
- [0021. Locked pages are ordered page-start anchors](0021-locked-pages-are-anchors.md)
- [0022. A CRDT with a custom sync server, not a central-authority protocol](0022-crdt-with-a-custom-server.md)
- [0023. Yjs 13 behind a narrow interface that one package owns](0023-yjs-behind-a-narrow-interface.md)
- [0024. The server is the only authority for a synced document](0024-one-authority.md)
- [0025. History lives outside the live document](0025-history-outside-the-live-document.md)
- [0026. A document is rebuilt only when it is over budget](0026-rebuild-only-over-budget.md)
- [0027. One compiled server program on SQLite files](0027-one-server-program.md)
- [0028. On the web, offline work lives in browser storage](0028-browser-storage-on-the-web.md)
- [0029. Desktop shell: Electrobun with bundled Chromium, Electron as the fallback](0029-desktop-shell.md)
- [0030. Interface stack: React, TanStack libraries, Zustand, shadcn components on Base UI](0030-interface-stack.md)
- [0031. The interface does not render on editor transactions](0031-interface-off-the-keystroke-path.md)
- [0032. Tool and interface text never says "error" or "failed"](0032-one-vocabulary.md)
- [0033. A browser tab is one person](0033-a-tab-is-one-person.md)
