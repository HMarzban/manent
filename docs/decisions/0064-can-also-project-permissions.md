# 0064. Per-project "Can also" capabilities live in the project index

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Within a project, owners need to delegate specific operational powers—issuing revisions and locking page numbers, editing rundowns, sending to the prompter, and moving scripts to Trash—to trusted coordinators or producers without making them workspace owners or updating every script's `doc_roles` row by hand.

## Options considered

- Store and edit capabilities solely as per-document `doc_roles` rows in `control.sqlite`. Rejected: adding a new episode or rundown to a project would miss capabilities unless every document creation path copied them and every toggle fanned out across all documents in the project.
- Introduce custom role names per workspace. Rejected: complicates the simple Owner / Can edit / Can comment / Can view access model that writers understand immediately.
- Keep a `can_also` map inside each project's syncing index document and resolve effective capabilities on the server through `capabilitiesOf`. Chosen.

## Decision

Each project index carries a `can_also` map storing sorted, deduplicated `{ userIds, groupIds }` grants per capability (`issue_revisions`, `lock_page_numbers`, `edit_rundowns`, `send_to_prompter`, `delete`). Server services resolve effective capabilities through `capabilitiesOf` (`packages/server-core/src/permissions/capabilities.ts`), replacing legacy `doc_roles` capabilities for keys covered by `can_also`, and `can-also-rule.ts` permits writes to `can_also` only from owners or people holding `issue_revisions`.

## Consequences and trade-offs

- Toggling a "Can also" tick in Share or Project settings applies immediately across every document in the project, syncs live to open clients, and supports single-step Undo.
- Pairing `issue_revisions` and `lock_page_numbers` in the UI keeps production locking and issuing consistent for coordinators while keeping the underlying capability keys distinct on the server.
- Group-level ticks are supported in the stored `{ userIds, groupIds }` shape and server resolver, while the Share and Project settings UI currently exposes person rows first.

## Revisit when

Productions need per-script overrides that differ from the project's "Can also" grants, or group-level capability ticks are added to the People interface.
