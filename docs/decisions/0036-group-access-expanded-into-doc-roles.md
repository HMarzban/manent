# 0036. Group and workspace access expands into per-member role rows with a source

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

A script can be shared directly with an individual, shared through a workspace, or granted to one or more project groups such as a writers' room or a production group. The server checks access on every HTTP route and WebSocket subscription, so checking whether a person may open, comment on or edit a script must stay fast and predictable even when group membership changes over time.

## Options considered

- Evaluate group membership dynamically on every access check by reading the project index's `groups` map and joining against a group-grants table. Rejected: every route and socket admission would depend on loading or caching the project CRDT document, and revoking or changing a role would not immediately know which active subscriptions to close.
- Copy a group's members into plain `doc_roles` rows at share time and forget the group. Rejected: later members added to the group would never receive access, and removing the group's grant could not tell group-derived rows apart from direct shares.
- Record each group grant on the document and expand group and workspace access into one `doc_roles` row per member tagged with a `source` column (`own`, `workspace`, `group:<id>`). Chosen.

## Decision

Every effective role on a document is stored as a row in `doc_roles` carrying a `source` (`own` for direct grants and link joins, `workspace` for workspace grants, and `group:<id>` for group grants), while each granted group is also recorded in a group-grants table so members added to the group later automatically receive its role. Direct access (`own`) always wins over group access, the highest role wins when a person belongs to several granted groups, and removing a group's grant removes only rows whose `source` belongs to that group (or recomputes the member's next-best group).

## Consequences and trade-offs

- Access checks on every route and socket frame remain a single indexed lookup in `control.sqlite` with no CRDT read on the hot path.
- Expanding a group change immediately produces the exact list of people whose effective role changed, so the server notifies only those people and closes any subscriptions their new role no longer permits.
- Group expansion only grants members present in the directory who share a workspace with the script's owner, reporting any skipped members in the response; a failed expansion is retried until storage and project groups agree.
- Writing one row per member means very large groups incur proportional write work when granted or edited, which is well within the scale of writing rooms and studio teams.

## Revisit when

Groups routinely hold thousands of members and expanding membership edits into per-member rows becomes a measurable bottleneck on `control.sqlite`.
