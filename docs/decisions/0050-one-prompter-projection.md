# 0050. One prompter projection serves every output

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Multiple parts of Manent extract what a prompter reads from a Variety story: the server building live prompter feed snapshots and patches, the Prompter text export in `@manent/formats`, and desktop Prompter files output. If each output filtered elements or stripped marks independently, the Prompter window could display text that an exported file omits, or accidentally show Bracket directions, Slugs, omitted scenes or unaccepted suggested additions on air.

## Options considered

- Filter blocks separately in `@manent/server-core`, `@manent/formats` and `@manent/local-node`. Rejected: subtle rules—keeping suggested removals while hiding suggested additions, keeping blocks excluded from timing, stripping formatting marks and preserving dual-dialogue attributes—would drift across callers.
- Place the projection in `@manent/formats` or `@manent/server-core`. Rejected: neither package is reachable from every layer without adding cross-package boundary edges, whereas `schema` already owns `BlockJSON` and block attributes.
- Export one pure projection (`prompterBlocks` and `formatPrompterStory`) from `packages/schema/src/prompter.ts`. Chosen.

## Decision

What a prompter shows of a story is defined in one place, `packages/schema/src/prompter.ts`. `prompterBlocks` keeps only `character`, `parenthetical` and `dialogue` blocks that are neither omitted nor suggested additions (retaining suggested removals and blocks excluded from timing), strips all text marks and keeps only `id`, `type` and `dual`; `formatPrompterStory` formats those blocks into plain text with uppercase speaker lines and blank lines between speeches.

## Consequences and trade-offs

- The live prompter feed, the Prompter window, Prompter text exports and future desktop Prompter files are guaranteed to agree on every spoken word and never leak Brackets, Slugs or General notes.
- Because `schema` is a pure kernel package, every layer calls the same projection with no boundary changes.
- `schema` now holds one small piece of broadcast text formatting (`formatPrompterStory`), and any future prompter formatting rule must be updated centrally.

## Revisit when

Different prompter outputs diverge—for example, rich emphasis in the Prompter window beside stripped plain text for external files—so that one projection no longer fits every output.
