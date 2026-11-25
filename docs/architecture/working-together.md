# Working together

How Manent supports comments, sharing, sent drafts, writing modes, private copies and room presentation on top of the core sync engine in [overview.md](overview.md).

## Comments, notes and anchors

Private notes and shared comments point to script text through one plain-data `TextAnchor` shape in `@manent/schema` ([decision 0047](../decisions/0047-one-text-anchor-shape.md)): `blockId`, UTF-16 `start` and `end` offsets, the quoted text, and up to 16 UTF-16 units of `prefix` and `suffix` context that never split a surrogate pair. `@manent/revisions` resolves anchors with `resolveAnchor`, checking the stored offset first, then elsewhere in the same block, then neighbouring blocks, preferring matches whose surrounding text agrees, and reporting removed text once no match remains.

- **Private notes** live inside the script's own `notes` map and are edited by writers like any other script content. Typing `[[` opens a note at the caret, and the editor draws note underlines and gutter markers alongside comments.
- **Comments** live in a companion CRDT document per script (`kind: "comments"`), derived deterministically with `commentsDocId(scriptId)` ([decision 0037](../decisions/0037-comments-in-their-own-document.md)). Its four root maps hold `threads`, `items`, `rounds` and `flags`:
  - `threads`: each thread's anchor (or `null` for the whole script, or an empty range on a scene heading for a scene), optional `roundId`, author, creation time and `open` or `resolved` state (including `addressed` or `declined` outcomes inside a round).
  - `items`: append-only comments and replies carrying `body` and `mentionedUserIds` for Mentions.
  - `rounds`: named review rounds tied to a script version.
  - `flags`: links between a pre-send Check (`checkKey`), a flagged person (`flaggedUserId`) and its comment thread ([decision 0046](../decisions/0046-flagged-check-is-a-comment-thread.md)).

On the server (`packages/server-core/src/comments/`), every push to a comments document is inspected entry by entry against the pusher's role and the stored state. Commenters may start threads, reply, resolve or reopen their own threads (or ones they resolved) without ever holding write access to the script itself. Existing items cannot be overwritten or deleted, nobody may name another person as author or resolver, only editors may start or rename rounds, move threads between anchors or rounds, or write Check flags, and viewers cannot push. After each accepted commit, the server recounts open threads per round so the episode list and Comments tab stay current.

## Sharing, groups and links

Document access is stored in `control.sqlite` (`packages/server-core/src/sharing/`). Every effective permission on a document is a row in `doc_roles` tagged with its `source`: `own` (direct shares and link joins), `workspace` (workspace membership) or `group:<id>` (expanded from a project group) ([decision 0036](../decisions/0036-group-access-expanded-into-doc-roles.md)).

```text
  Project index `groups` map          document group grants
             │                                  │
             └──────────────┬───────────────────┘
                            ▼
                expandGroupGrants()
            (directory + workspace gate)
                            │
                            ▼
        control.sqlite `doc_roles` (source: own | workspace | group:<id>)
                            │
                            ▼
         role-change notifications & closing revoked subscriptions
```

- **Precedence:** a direct `own` role always wins over group-derived roles; among granted groups, the highest role (`edit` > `comment` > `view`) wins; joining via a share link never lowers an existing role.
- **Membership changes:** because group grants are recorded separately, adding a person to a project group grants them access automatically, and removing a group's grant clears only rows sourced from that group (or steps the member down to their next-best granted group).
- **Share links:** owners create expiring or revocable links for a chosen role; tokens are stored only as SHA-256 hashes. Opening `/join/<token>` grants the link's role after identity selection and navigates into the script.
- **Live enforcement:** when a person's effective role changes or is removed, the server notifies only that person's active subscriptions and closes any subscription their new role no longer allows.

## Sent drafts and readers

Sending a draft (`packages/server-core/src/drafts/`) distributes a frozen snapshot of a script—full draft, changed pages, page range or scene range—to people, project groups, or anyone holding a draft link, optionally marked with revision asterisks against the last sent draft and optionally carrying each reader's name as a Watermark in the bottom margin on screen and in PDFs.

- **Reader access:** a draft link opens a dedicated read-only reader frame (`/s/<doc>/draft/<id>` or via link token) without granting live edit access to the working script. When "Ask who they are" is enabled, readers pick their identity so they can comment into the draft's round and have their opening recorded.
- **Opens and last read:** storage tracks every sent draft, its recipients, each reader's opens and last-read position, and History shows editors who received each sent draft and who has opened it.

## Writing modes and private copies

Editors share two collaborative modes inside the live script and one isolated workflow apart from the room:

- **Writing as suggestions:** when the Writing mode is set to As suggestions (and page numbers are not locked), `@manent/editor` marks inserted text, strikes through deletions without removing them, keeps split and joined blocks intact and records replaced element kinds. Margin bars open To review, where editors apply Use this or Keep as it was as single undo steps. Suggestion mode and scene assignment (`Writer` and `Progress`: Not started, Drafting, Handed in) are interface conventions backed by clear state-bar sentences rather than server write locks ([decision 0044](../decisions/0044-assignment-and-suggestions-are-interface-only.md)), while the server still refuses any pushed suggestion forged under another writer's user ID.
- **Private copies and Hand in:** `POST /api/private/create` opens or creates one private CRDT document (`kind: "private"`) per writer and script in the writer's own SQLite file, seeded with the script's blocks, settings and material at a recorded base position. The writer edits privately across devices and offline. At `POST /api/private/handin`, the server locks the private copy read-only before reading it, merges `(base, mine, theirs)` block by block through `packages/revisions/src/merge/` (`mergeByBlock`), applies the resulting block operations and new material to the room, saves a "Before hand-in" version and the idempotent response in one SQLite commit, and returns any overlapping blocks or set-aside passages to To review ([decision 0039](../decisions/0039-private-writing-merges-at-hand-in.md)).

## The room

When several people work live in one script:

- **Presence and Following:** the editor margin shows each collaborator's initials beside the first line of their active element, and Scenes rows show presence dots. Choosing Follow keeps another person's caret in view (on the local device only) until the follower types, interacts with the page, clicks Stop, or the followed person leaves.
- **Room window and driver:** `/s/<doc>/present` opens a bare, read-only Room window with no caret that follows whoever drives the script. The server holds at most one active driver per script in memory (`packages/server-core/src/driver/service.ts`) ([decision 0040](../decisions/0040-room-driver-in-server-memory.md)). Writers claim keys with compare-and-swap against `expectedDriverUserId`; every change broadcasts a `driver_changed` control frame to subscribers, and leaving releases keys automatically unless a document rebuild is moving subscribers. On desktop, `@manent/local-node` manages the driver for local-only scripts and relays requests to the cloud for synced scripts.
- **Pitching lines:** other writers in the room can pitch alternate lines directly into the driver's active speech, landing in the script's `alternates` map where the driver can swap an alternate in as one undo step.
