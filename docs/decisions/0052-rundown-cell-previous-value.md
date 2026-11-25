# 0052. A rundown cell carries its previous value with its writer and time

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Producers and coordinators edit rundown cells concurrently—renaming segments, reassigning writers or presenters, changing story types and entering manual duration overrides. Rundowns do not keep full version History in this release, yet overwriting another person's cell during broadcast preparation must be immediately visible and reversible in one step.

## Options considered

- Store plain scalar values in each cell and build full version History for rundowns now. Rejected: whole-rundown versioning and comparison add substantial surface area and still take more steps mid-show than restoring a single cell in place.
- Store plain last-writer-wins scalars with no previous-value metadata. Rejected: silent overwrites during fast broadcast changes leave producers unable to see who changed a cell or recover the replaced value.
- Store each cell as `{ value, userId, setAt, previous: { value, userId, setAt } | null }`, updated atomically on every write and restore. Chosen.

## Decision

Each stored rundown cell (`segment`, `story`, `writer`, `presenter`, `type` and `dur`) records its current `{ value, userId, setAt }` together with a `previous` record holding the value, writer and timestamp it replaced. The server verifies that `userId` matches the pusher, and `restoreCell` restores `previous` in one transaction while moving the displaced value into `previous`.

## Consequences and trade-offs

- A cell changed by someone else within the last minute displays a corner mark whose popover shows Previous value with writer, time and a one-step Restore action, providing fast recovery without full rundown History.
- Restoring a cell is itself reversible in one step because the displaced value becomes the new `previous`.
- Only one prior value is retained per cell: two consecutive edits overwrite the earlier `previous` record, and cell maps carry more bytes than bare scalar values.

## Revisit when

Productions require multi-step cell audit logs, named rundown versions or side-by-side comparison of whole rundowns across a show day.
