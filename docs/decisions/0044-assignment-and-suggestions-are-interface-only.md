# 0044. Scene assignment and suggestion-only editing are interface conventions, not server locks

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

In a shared script, teams want to mark which writer owns a scene (and its progress: Not started, Drafting, Handed in) and let editors switch into writing As suggestions so colleagues can review proposed edits before accepting them. Enforcing either rule as a hard server write lock would collide with how writers' rooms actually work when a showrunner or co-writer steps in to fix a typo or cut a line during a table read.

## Options considered

- Enforce per-scene write locks and suggestion-only mode on the server, rejecting plain edits outside a writer's assigned scenes or from a user flagged as suggesting-only. Rejected: rooms regularly cross-edit scenes during rewrites and offline edits could be rejected unexpectedly on reconnect, while adding complex per-block server ACLs to every push.
- Hide scene assignment and suggestion mode until full per-scene permissions exist. Rejected: writers want visibility into who is working on each scene and a low-friction suggestion mode immediately.
- Treat scene assignment and suggestion acceptance as interface conventions, using the state bar's sentence as the clear safeguard while still enforcing suggestion authorship on the server. Chosen.

## Decision

Scene assignment, scene progress and writing As suggestions (including accepting or declining suggestions) are interface-only conventions for anyone with edit access: nothing blocks typing into another writer's scene, and the state bar's sentence naming who is writing the current scene—or that the writer is working as suggestions—serves as the safeguard. The server still enforces that a pushed suggestion mark or attribute names the pusher as its author unless the room already held it under that author.

## Consequences and trade-offs

- Writers' rooms keep fluid collaboration without lock-stealing dialogs or rejected offline edits, and every scene assignment or progress change stays a simple CRDT write with single-step undo.
- A person with `comment` or `view` access remains strictly barred from editing the script by the server's document role checks; only people who already hold `edit` access can type directly or accept suggestions.
- Because enforcement is social rather than server-gated, a rogue editor could bypass suggestion mode or edit another person's assigned scene; version history and authorship attribution record who made every change.

## Revisit when

Studios or newsrooms require a distinct server-enforced "suggest-only" role separate from `edit` and `comment`.
