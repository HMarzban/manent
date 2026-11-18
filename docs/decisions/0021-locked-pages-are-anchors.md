# 0021. Locked pages are ordered page-start anchors

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

Once a script is in production its page numbers are locked: page 12 stays page 12, and new material on it becomes 12A, 12B and so on. The lock must survive concurrent edits, offline edits and rebuilds, and every client must derive the same pages from it.

## Options considered

- CRDT relative positions. Rejected: they belong to the library's internals and do not survive a rebuild.
- A page number stored on every block. Rejected: it cannot represent a block that spans pages, and a moved block keeps its old page.
- An ordered list of where each page starts. Chosen.

## Decision

When the pages are locked, the server writes down where every page begins, in order: its label, a block ID, a character offset and the quoted text there, with a few following block IDs as fallbacks. The list is an input to the page function (decision 0019), so every client computes the same pages. Text belongs to the page whose anchor most closely precedes it, and anchors count only while they stay in order. No page label is ever used twice, however deep the letters go: a page added after a locked 12 is 12A, then 12B, and a page added before a locked 12A, with no letter left between them, is A12A. The label scheme is part of the engine's first version.

## Consequences and trade-offs

- A block that spans three pages has two anchors at different offsets, and a rebuild leaves the list unchanged, because it names block IDs and offsets.
- The anchors are data, so a richer rule later is a server change, not a migration of documents.
- No working production coordinator has reviewed this model or the label scheme. Changing the scheme once its golden tests exist needs a new engine version.

## Revisit when

A real revision sequence arises that the anchors cannot express, or a production coordinator's review finds the labels wrong.
