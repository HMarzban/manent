# 0017. One document per script, episode, segment or story, stored one file per project

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

Every cost the prototypes measured, from keystroke time to load time and memory, grows with the size of the live document. A series, a season or a daily show produces thousands of pages over its life, and a daily script kept in one reused document keeps growing with material that was deleted long ago.

## Options considered

- One document per project, season or show. Rejected: the live document grows without bound, and a client has to load all of it.
- One document per script, episode, segment or story, under small index documents. Chosen.
- For storage, one SQLite file per workspace. Rejected: SQLite has one writer per file, so a busy workspace would serialise the commits of every project in it, and one damaged file would take all of them.

## Decision

Every script and episode, every late-night segment and every news story gets a CRDT document of its own, and a whole feature film or novel-length work is a single document. Small index documents hold order and references, and a client loads an index and only the documents in view, typically one to three. On the server, each project's documents share one SQLite file, beside one control file and one file per person.

## Consequences and trade-offs

- Every live document stays in the size range where everything measured was fast.
- Features that span documents need the index and work of their own: continuous page numbers across segments, search across a project, moving a scene between documents, undo across them.
- A client keeps several rooms open at once, so the wire carries many documents over one connection.
- Storage is not built yet. This record fixes its layout.

## Revisit when

A common workflow needs atomic changes across documents, or one project's file grows until a single writer becomes its bottleneck.
