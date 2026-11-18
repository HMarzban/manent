# Decisions

One short record per decision that constrains later work. A record says what was decided, what else was considered, what it costs and what would make us look again.

## Rules

- A record is written before the code that depends on it merges.
- Numbers are four digits, in the order the records were written, with no gaps. If `main` took your number first, take the next one.
- A record is not rewritten after it merges, except to fix a typo or to change its status. A decision that turns out wrong gets a new record, and the old one's status becomes `Superseded by NNNN`.
- `Decided by` names a role, never a person: `project owner`, `engineering lead`, or `project owner and engineering lead`.
- Evidence is stated with its conditions (machine, data, number of runs) and with what was not measured.
- Every record is listed in the index below, in order, as `- [NNNN. Title](file)`; a superseded one ends ` — superseded by NNNN`.

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
