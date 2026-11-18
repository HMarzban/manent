# 0001. Keep public project records, checked by the gate

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

The repository is public and is worked on by several people and AI agents, often in parallel and with no shared memory. Decisions and their reasons lived in working notes that are not published. A reader could see what the code does but not why, and a mistake found in one review could be made again by the next contributor.

## Options considered

1. Publish the working notes as they are. Rejected: they are drafts, they hold things that are private, and nobody keeps drafts current.
2. Rely on commit messages and code comments. Rejected: a commit says what changed, not which alternatives were weighed or what was learned, and comments drift from the code.
3. Keep a small set of public records with fixed formats, and check them in the gate. Chosen.

## Decision

The repository keeps `CHANGELOG.md` (what changed), `docs/decisions/` (one record per decision that constrains later work), `docs/memory/lessons.md` (mistakes, near-misses and the rule each one produced) and `AGENTS.md` (the standing rules). `tools/check-records.ts` checks them as part of `bun run verify`.

## Consequences and trade-offs

- Every change costs a changelog entry, and some cost a decision record or a lesson. That friction is deliberate.
- Records are written for the public: rewritten from working notes in neutral terms, never copied, and citing nothing a reader cannot open. The check enforces the part of that which a program can see. What only one machine's owner knows to be private is read from a list kept on that machine, so the check is weaker on a fresh clone.
- Records are not rewritten to hide a mistake, so a wrong turn stays visible. A wrong decision is superseded by a new record.
- A format check cannot tell whether a record is true or complete. Review still has to.

## Revisit when

The records are regularly out of date at merge time, or the check stops honest writing more often than it catches a real problem.
