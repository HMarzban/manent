# 0054. Editing a rundown requires edit access and the edit-rundowns capability

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

In a late-night show or newsroom, writers hold edit access so they can draft and revise segments and stories, while producers and showrunners control the order, timing and structure of the broadcast. Letting every writer reorder or delete rundown rows risks accidental changes to the show, whereas denying writers access to the rundown would prevent them from opening stories Beside it and tracking live timing.

## Options considered

- Allow anyone with the `edit` role on a rundown to edit its rows and cells. Rejected: gives every writer the ability to reorder or remove broadcast rows, blurring the line between writing stories and producing the show.
- Require `edit` (or `owner`) role plus the `edit_rundowns` capability to edit a rundown, while editing a story linked from the rundown requires only `edit` role on that story. Chosen.

## Decision

Pushing any change to a rundown document requires both a writer role (`owner` or `edit`) and the `edit_rundowns` capability, enforced on the server by `validateRundownPush`. Editing a story script linked from a rundown row requires only `edit` access on the story document.

## Consequences and trade-offs

- Producers and showrunners govern row order, air time, target length and rundown cells while writers can read the rundown, open their stories Beside it and write freely.
- Because the server writes story durations via authority updates, a writer's story edits still update the rundown's `Dur` column without granting that writer `edit_rundowns`.
- A Can-view reader path for rundowns is not yet served; people without `edit_rundowns` who hold an edit role inspect the rundown read-only while the server refuses any push they attempt.
- Teams that want every writer to reorder the rundown must explicitly grant the `edit_rundowns` capability.

## Revisit when

Newsrooms or shows need a dedicated Can-view rundown viewer path or per-column permissions that let writers update specific cells without moving rows.
