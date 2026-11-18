# 0020. What can be derived is not stored

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

Some things a script shows depend on the rest of the document: the continuation marker when a character speaks again after an interruption, page headers and numbers, and the marks that show which lines changed in a production revision. A stored copy of such a value goes stale when someone edits around it, and in a CRDT two stored copies can merge into nonsense.

## Options considered

- Store them in the document as text or marks. Rejected: they go stale, a paste or a binding rewrite carries them where they do not belong, and they become shared state that everyone writes.
- Store revision marks as a block attribute. Rejected: the same staleness, and typing a word and then deleting it would leave a mark behind.
- Derive them from the document. Chosen.

## Decision

Continuation markers, page furniture and production revision marks are computed, not stored. Revision marks come from comparing the current document with the revision's baseline, block by block through their IDs (decision 0016), so the marks depend only on the resulting text, never on the edits that produced it. A manual override, marking or clearing a block by hand, is the one stored piece, kept in a map of its own.

## Consequences and trade-offs

- These values cannot go stale, and every client shows the same ones.
- Edits made offline are marked in whichever revision is active when they arrive.
- A retyped or copied block carries a new ID and so is marked as a whole, even when its text barely changed.
- The comparison costs work on each change, limited to the blocks that change touched.

## Revisit when

Writers find whole-block marks on retyped blocks misleading in practice, or the comparison grows too slow for long scripts.
