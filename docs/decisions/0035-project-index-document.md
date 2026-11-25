# 0035. Each project has its own index document

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Every project beyond a single script holds shared state that belongs to the project rather than to one script or to the whole workspace: its kind and template, shared style overrides, seasons and episodes, characters, sets, terms and pinned facts, sharing groups, series board, draft ladder, copy sources and extra capabilities. Keeping that state in the workspace index would force every member of a busy workspace to sync every project's board and facts; keeping it only in server tables would break offline creation and editing.

## Options considered

- Store project metadata inside the workspace index document. Rejected: every workspace member would load and sync data for projects they never open, and edits to one project's names or board would contend on the workspace index.
- Store project metadata only in server SQLite tables behind HTTP routes. Rejected: a writer creating a project or editing names and board cards offline could not merge those changes cleanly on reconnect.
- Give each project its own CRDT index document, created on the device when the project is created, with a deterministic ID derived from the project ID (`indexDocId("project", projectId)`). Chosen.

## Decision

Each project owns one CRDT index document (`kind: "index"`), created on the device as soon as the project is created and addressed deterministically by `indexDocId("project", projectId)`. Its root maps (`template`, `style`, `seasons`, `episodes`, `names`, `facts`, `groups`, `board`, `ladder`, `source`, `can_also`) sync through the normal document write path, where the server checks each map touched by a push against the pusher's role: owners and people permitted to issue revisions may write `template`, `style`, `groups`, `ladder` and `can_also`, while editors may write `seasons`, `episodes`, `names`, `facts`, `board` and `source`.

## Consequences and trade-offs

- Projects work offline from the moment they are created, and syncing one project never downloads another project's board, names or facts.
- Every replica computes the same index document ID without a server round trip, and the project index lives in the project's own SQLite file alongside its scripts.
- Because all project-wide maps share one CRDT document, map-level access control runs in the server's write path by inspecting which root maps a push changed, and server-maintained episode summaries (stage, page counts, open comment counts and lock state) write into the same document as authority writes.

## Revisit when

A single project's index document grows large enough that loading it delays opening a script, or a project needs fine-grained per-card permissions that map-level checks cannot express.
