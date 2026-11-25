# Prompter

How Manent projects Variety stories for live reading, sequences manual and automatic sends, streams the live prompter feed to Prompter windows, scales the viewer path and specifies plain-text prompter file output on top of [overview.md](overview.md) and [rundowns.md](rundowns.md).

## One prompter projection

Every prompter output reads through one pure projection in `packages/schema/src/prompter.ts` ([decision 0050](../decisions/0050-one-prompter-projection.md)):

- `prompterBlocks` keeps only `character`, `parenthetical` and `dialogue` blocks that are neither `omitted` nor suggested additions (`suggest !== "added"`). Suggested removals and blocks marked `noTiming` stay visible, all text marks are stripped, and only `id`, `type` and `dual` survive on each block. No Bracket, Slug or General text ever reaches a prompter.
- `formatPrompterStory` formats projected blocks as plain text with uppercase speaker lines, parentheticals and dialogue on their own lines, and blank lines separating speeches.
- For rows linked to a single slug (`row.blockId !== null`), `slugBlocksOf` (`packages/server-core/src/prompter/projection.ts`) slices the story from that slug to the next before projecting.

## Sends, automatic updates and Send previous

`createPrompterService` (`packages/server-core/src/prompter/service.ts`) sequences every prompter change per rundown through a single per-rundown chain (`inChain`) so concurrent sends never overtake each other:

| Action         | Trigger                                       | Version kept | Script modified | Requires `send_to_prompter` |
| -------------- | --------------------------------------------- | ------------ | --------------- | --------------------------- |
| Manual Send    | `POST /api/prompter/send` (idempotent by key) | `prompter`   | No              | Yes                         |
| Send previous  | `POST /api/prompter/send-previous`            | None         | No              | Yes                         |
| Automatic send | 2 s of story quiet outside the air window     | None         | No              | Server authority            |

- **Manual Send (`send.ts`):** verifies access and `send_to_prompter`, checks the stored idempotency key, writes the row's server-only `prompter` state (`state: "on"`, `versionId`, `sentAt`, `sentByUserId`) via `authorityWrite`, records a `prompter` History version and `PrompterSendRow` in the same SQLite transaction, broadcasts `CONTROL` `sent_to_prompter` and publishes the updated feed.
- **Send previous:** walks back one step along the row's send trail (`send-trail.ts`), restores that earlier sent snapshot onto the prompter without altering the script or creating a version, and sets the row state to `on` or `changed` depending on whether the restored snapshot matches the script's current head.
- **Automatic sends (`auto-send.ts`):** outside the rundown's air window, commits to a linked story arm a 2 s quiet timer (`AUTO_SEND_QUIET_MS = 2_000`) per row ([decision 0055](../decisions/0055-automatic-prompter-sends-wait-two-seconds.md)). When the story stays quiet for two seconds, `sendAutomatic` records the send with `versionId: null` and `senderUserId: null` and publishes the feed. Inside the air window, automatic timers cancel immediately, edits and offline merges mark rows `Changed — not on prompter`, and a window-end timer flushes changed rows automatically once the air window closes.

## The live prompter feed and viewer scale

Prompter windows subscribe over a dedicated read-only path that holds no CRDT document, no state vector and no awareness state:

```text
  Prompter window ──► PrompterFeedClient ──► SUBSCRIBE(mode: "prompter")
                                                      │
                                                      ▼
                                            createPrompterFeedHub
                                     (releases room · sends VIEW_SNAPSHOT)
                                                      │
                            ┌─────────────────────────┴──────────────────────────┐
                            ▼                                                    ▼
              on send or rundown change                                  every 1 s heartbeat
         diffPrompterFeed() → prepareMessage()                       HEARTBEAT_BYTES (empty patch)
                            │                                                    │
                            └───────────────► VIEW_PATCH fan-out ◄───────────────┘
```

- **Server hub (`packages/server-core/src/prompter/subscribe.ts`):** on `SUBSCRIBE` with `mode: "prompter"`, the server validates access, immediately releases the document room so idle rooms stay unloaded, replies with `SUBSCRIBED` (carrying `airWindow`) and an initial `VIEW_SNAPSHOT` containing the rundown's row list and projected sent stories. Whenever a send commits or the rundown changes, `diffPrompterFeed` computes the minimal `PrompterPatch`, encodes it once and fans it out via `prepareMessage` to every eligible subscriber, revoking any subscriber whose access ended. On desktop, `UpstreamPrompterFeed` relays upstream feeds for cloud-synced rundowns.
- **Heartbeat and feed loss:** while a rundown has active prompter subscribers, the hub sends a pre-encoded empty heartbeat `VIEW_PATCH` every 1 s (`HEARTBEAT_MS = 1_000`). On the client (`packages/sync-client/src/prompter/feed.ts`), `PrompterFeedClient` opens its own socket (`socket.ts`) and marks the feed `lost` after 3 s (`FEED_LOSS_MS = 3_000`) without a snapshot or patch, probing the connection and reconnecting automatically with backoff ([decision 0058](../decisions/0058-prompter-heartbeat-and-feed-loss-threshold.md)).
- **Viewer path at scale:** for script readers in `view` mode, `packages/server-core/src/sync/viewers.ts` materialises snapshots from checkpoints and log tails without holding rooms open and caches up to 512 encoded `VIEW_SNAPSHOT` answers (LRU) across concurrent rundowns and stories; `packages/server-core/src/sync/viewer-counts.ts` batches per-document reader counts over `CONTROL` `viewers_counted`.

## The Prompter window

Opening Present on prompter launches `/s/<rundown>/prompter` (`apps/web/src/screens/present/prompter/`):

- Draws only the projected spoken blocks (speaker names, parentheticals and dialogue) in rundown row order, with local view controls for Text size, Dark and Mirror persisted for that window alone rather than in user preferences.
- Stores the last received feed in browser storage (`manent.prompter.feed.<rundownId>`) so a window opened offline or during a drop keeps showing the last received text immediately.
- Displays clear operational states: `Live`, `Nothing has been sent yet`, `Feed lost hh:mm:ss — showing last received` (resuming `Live` automatically without a reload when frames return) and `Link refused`.

## Prompter file output

[Decision 0057](../decisions/0057-plain-text-prompter-files.md) defines the desktop folder output format: `run-order.txt` (tab-separated rows including header rows) plus one `NN-<slug>.txt` file per story in `UTF-8` or `Windows-1252` (with CRLF line endings, no byte-order mark, `?` substitution counts for unencodable characters, and hidden-temporary atomic renames so polling readers never observe partial files).

Implementation of desktop Prompter files output is currently deferred until the web app finishes: `packages/local-node/src/prompter-files/` holds a stub service and routes today, and no desktop folder writer is active yet.

## Known limits

- Desktop Prompter files output is deferred and not yet implemented.
- Once implemented, prompter file output will be verified against Manent's own reader only, not against vendor prompter software, whose formats are not public.
- A Can-view reader of a rundown itself is not served.
- Viewers are not shown as a count in the interface.
- Prompter-feed staleness and 200-viewer fan-out latency have not yet been measured in the benchmark suite.
