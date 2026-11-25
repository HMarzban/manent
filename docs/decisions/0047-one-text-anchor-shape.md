# 0047. Every text-attached feature shares one text-anchor shape

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Private notes, comment threads and future text-attached annotations all point to a span of text inside a script block that other writers keep editing, splitting, joining or deleting. If each feature invented its own offset or quote format, anchor relocation after edits would diverge and every editor underline layer would duplicate matching logic.

## Options considered

- Use Yjs relative positions (`Y.RelativePosition`) directly in stored notes and comments. Rejected: Yjs-internal types would leak across the `@manent/crdt` seam, break across document rebuilds and CRDT changes, and fail to match cleanly across imported or copied snapshots.
- Let notes and comments each define their own anchor structure and matching heuristic. Rejected: two anchor matchers would drift on edge cases such as surrogate pairs, adjacent block moves and removed text.
- Define one plain-data `TextAnchor` shape in `@manent/schema` and one `resolveAnchor` function in `@manent/revisions` shared by every text-attached feature. Chosen.

## Decision

Every feature that attaches to script text uses `@manent/schema`'s `TextAnchor` (`blockId`, `start`, `end`, `quote`, `prefix` and `suffix`, with up to 16 UTF-16 context units that never split a surrogate pair) and resolves it through `@manent/revisions`'s `resolveAnchor`. Resolution tries the stored offset in the block first, then elsewhere in the block, then neighbouring blocks, preferring matches whose prefix and suffix agree, and reports the text as removed when no match remains.

## Consequences and trade-offs

- Anchors survive CRDT rebuilds, snapshots, imports and any future change of CRDT library because they depend only on Manent's stable block IDs and plain UTF-16 text.
- One shared anchor resolver keeps gutter markers, underlines and removed-text handling consistent across notes and comments, and lets the editor render both from one unified layer.
- Because resolution is heuristic when text is heavily rewritten, a short common word rewritten far away from its original block can report as removed rather than jumping to an unrelated match.

## Revisit when

A feature needs anchors that span across multiple blocks rather than a range inside a single block.
