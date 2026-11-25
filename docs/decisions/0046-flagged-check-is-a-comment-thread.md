# 0046. A flagged Check is a comment thread

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Details and the Send screen run pre-send Checks on a script (such as pages over target length, new character names, near-matches to project names, new proper nouns and overused words). A writer reviewing Checks often wants to flag one for a colleague to address before a draft goes out, and later see whether it has been resolved.

## Options considered

- Add a separate "issues" or "tasks" store in SQLite or the project index for flagged Checks. Rejected: colleagues would have to watch two different queues, replies and mentions would have to be rebuilt a second time, and resolving a flag would behave differently from resolving a comment.
- Store a flag only as a private note inside the script. Rejected: private notes have no thread replies, resolution state, or server-checked authorship for collaborators.
- Represent a flagged Check as a regular comment thread in the script's comments document paired with an entry in the `flags` map naming the thread, the flagged person and the Check key. Chosen.

## Decision

Flagging a Check creates a normal comment thread in the script's comments document (`commentsDocId(scriptId)`) and records a `CommentFlag` (`threadId`, `flaggedUserId`, `checkKey`) in the comments document's `flags` map in the same write. Only editors may write entries to `flags`, and the Check's flagged state follows the lifecycle of its comment thread.

## Consequences and trade-offs

- Flagged Checks automatically appear in the Comments tab, carry mentions, replies and resolution outcomes, sync offline, and count toward open feedback without a second subsystem.
- Because the flag is keyed by `checkKey` inside the comments document, the Checks list can show which Check is already flagged and jump straight to its thread.
- Resolving or reopening the comment thread directly updates the flag's status; no separate workflow engine is needed.

## Revisit when

Production teams need Check sign-off workflows with multi-stage approvals or non-commenter assignees that go beyond a comment thread.
