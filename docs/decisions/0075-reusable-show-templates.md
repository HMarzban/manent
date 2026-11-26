# 0075. Reusable Show and News templates live in the workspace and project indexes

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Extending the project index document (decision 0035), fresh-ID document copying (decision 0038), and workspace index maps (decision 0063), Show and News teams build recurring episodes and bulletins from standard rundown and script layouts. They need both a project-level default and templates shared across Show and News projects in a workspace, available offline and clean of stale IDs, marks, timings, and cell history when instantiated.

## Options considered

- Keep templates as ordinary documents in a hidden Library folder and duplicate them with standard copy. Rejected: leaks template documents into search, archive, and trash flows, leaves revision marks, previous cell values, and broadcast timings behind unless scrubbed per caller, and muddles workspace-wide sharing with per-project defaults.
- Store templates in a dedicated server database table accessed only over HTTP. Rejected: breaks offline template creation and instantiation on devices that already hold synced workspace and project index documents.
- Store workspace-shared templates in a new `"templates"` map appended to `WORKSPACE_INDEX_MAPS` and project defaults (`project.scriptSkeleton` and `project.rundownSkeleton`) in the existing owners-only `"template"` map of `PROJECT_INDEX_MAPS`, with pure strip and mint routines in `@manent/crdt`. Chosen.

## Decision

Show and News projects save reusable script and rundown templates either at workspace scope in a new `"templates"` map appended to `WORKSPACE_INDEX_MAPS` (writable by workspace owners and editors) or as project defaults (`project.scriptSkeleton` and `project.rundownSkeleton`) in the existing owners-only `"template"` map of `PROJECT_INDEX_MAPS`. Saving strips block and row IDs, suggestion and revision marks, `from`/`num`/`omitted` provenance, cell `previous` records, and server-only `durationMs` and `prompter` fields; instantiating mints fresh IDs and evenly spaced base-62 order keys and sets `createdFromTemplate: true` so `isUntouched()` never removes a freshly instantiated document.

## Consequences and trade-offs

- Templates synchronise offline through the existing workspace and project index channels with no new wire message types, and every instantiated script or rundown starts with clean identities and timings.
- Embedding skeletons in index maps keeps typical Show and News templates fast and self-contained, though very large scripts saved as templates would grow the index document.

## Revisit when

Other project kinds adopt reusable document templates, or workspace template libraries grow large enough to warrant standalone documents outside the workspace index.
