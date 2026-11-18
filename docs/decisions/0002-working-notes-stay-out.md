# 0002. Working notes stay out of the repository, and the public tree is an allow-list

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Working on the project produces drafts, research notes and tool configuration. They hold unfinished thinking and material that is not meant for publication, while the repository itself is public. Something had to make sure such files are never tracked by accident, without the repository pointing at them.

## Options considered

- A deny-list in a tracked file, such as `.gitignore` or a check that refuses named folders. Rejected: the list would publish the very names it exists to hide.
- Care at commit time. Rejected: one `git add` of a whole folder undoes it, and nothing would notice.
- An allow-list of the public tree, checked by the gate. Chosen.

## Decision

Notes and drafts stay on the maintainers' machines, kept out of git by each machine's local exclude file. `tools/check-tracked.ts` lists the folders and files that may be tracked, and `bun run tracked`, a step of `bun run verify`, stops the gate when git tracks anything else.

## Consequences and trade-offs

- A new top-level folder or file has to be added to the allow-list in the same change. That friction is deliberate.
- Public records cannot be the notes themselves. Each one is written separately, in neutral terms (decision 0001).
- What one machine knows to be private, its exclude file and a local list of terms, is read from that machine's git directory. On a fresh clone only the public rules run, so the check is weaker there.
- The allow-list knows paths, not contents. A private sentence pasted into a public file passes it; review has to catch that.

## Revisit when

The allow-list is edited so often that nobody reads the change, or a file has to be tracked for a reason the list cannot express.
