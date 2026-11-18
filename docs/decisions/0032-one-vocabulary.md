# 0032. Tool and interface text never says "error" or "failed"

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

A message is where a writer decides whether their work is safe. One that says only that something went wrong leaves them guessing what happened to their words and what to do next. Words such as "conflict" or "rebuild" describe the system's insides, not the writer's situation.

## Options considered

- Keep these words out of messages about merging only. Not enough: the same habits show up in every message.
- Keep them out of all interface and terminal text. Chosen.

## Decision

Every message says what happened and what to do next. The words "error", "failed", "conflict", "rebuild" and "generation" stay out of text a person reads in the interface or the terminal; identifiers and wire values are exempt. For a server that does not start, the terminal prints "The server could not start." and the status line shows "Couldn't start the server. See the terminal." Every sentence the web app shows lives in one file, `apps/web/src/text.ts`, and `apps/web/test/text.test.ts` pins each one.

## Consequences and trade-offs

- Messages take more care to write, and some read longer than a one-word status would.
- Engineers lose a familiar shorthand in terminal output.
- The gate does not enforce the rule yet: the sentences are pinned, but nothing checks the words themselves.

## Revisit when

A check in the gate enforces the vocabulary, which removes the last limit above.
