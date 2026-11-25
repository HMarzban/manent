# Rundowns and timing

How Manent times Variety and Podcast scripts, models collaborative show and news rundowns, maintains authoritative durations and computes air windows on top of [overview.md](overview.md). Prompter sends and the live feed are covered in [prompter.md](prompter.md).

## Variety and Podcast timing

All script and rundown timing lives in `packages/pagination/src/timing/`, a pure module reachable from the editor, page furniture, exports and the server without new boundary edges ([decision 0049](../decisions/0049-timing-in-pagination.md)).

- **Read-rate timing:** `timeBlock` and `timeScript` sum UTF-16 dialogue characters and well-formed bracket durations into rate-independent `{ dialogueChars, bracketMs }` totals, both for the whole script and per slug. `durationMs` turns any collection of totals into whole milliseconds at the project's Read rate (default 11.25 characters per second, rounded once over the sum), so changing a project's Read rate re-times every Variety and Podcast script live without re-reading text.
- **Bracket durations:** `findBracketTimes` scans each Bracket block for `T=m:ss` and `T=mm:ss` tokens (seconds `00`–`59`). Only the first well-formed form in a bracket adds media time; earlier invalid forms are marked `malformed` and later ones `repeated`, underlined in the editor and listed in Checks.
- **Exclude from timing:** setting `noTiming` on blocks (via Exclude from timing / Include in timing on the selection toolbar) zeroes their contribution to dialogue and bracket totals in one undo step, synced to collaborators, while keeping bracket checks intact.
- **Podcast scripts:** Podcast projects run on the Variety format with Segment and Cue labels and use the same Running time readout, Scenes breakdown and Cue `T=` checks.

## The rundown model

A show day or newscast is a syncing CRDT document (`kind: "rundown"`) backed by three root structures defined in `packages/schema/src/rundown.ts` and mutated through `packages/crdt/src/rundown/`:

| Root      | What it holds                                                                   | Who may write it                     |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| `rundown` | Broadcast fields: `airDate` (`YYYY-MM-DD`), `airAt`, `windowLeadMs`, `targetMs` | Writers with `edit_rundowns`         |
| `columns` | Ordered column list for the rundown's kind (Show or News)                       | Writers with `edit_rundowns`         |
| `rows`    | Map of row ID to row map (`order`, `kind`, `cells`, `docId`, `blockId`, flags)  | Writers with `edit_rundowns` (cells) |

- **Fixed column sets:** Show rundowns display `#`, `Segment`, `Writer`, `Dur`, `Cume`, `Start`, `Back` and `Prompter`; News rundowns display `#`, `Story`, `Presenter`, `Type`, `Dur`, `Cume`, `Start`, `Back` and `Prompter`. Each person's hidden columns and column widths live in their private index rather than the shared rundown.
- **Row order and kinds:** rows are ordered by base-62 fractional keys (`packages/crdt/src/rundown/rundown-order.ts`), breaking ties by row ID, so concurrent moves of the same row converge without duplicating it. Each row has kind `header` (unnumbered section divider), `item` (standalone timed row) or `script` (linked to a story document via `docId`, and optionally to one slug via `blockId`).
- **Cell previous value:** every stored cell (`segment`, `story`, `writer`, `presenter`, `type`, `dur`) holds `{ value, userId, setAt, previous }` ([decision 0052](../decisions/0052-rundown-cell-previous-value.md)). Replacing a cell moves the prior value into `previous`, and `restoreCell` swaps it back in one transaction.
- **Server validation:** `validateRundownPush` (`packages/server-core/src/rundown/validate.ts`) requires both a writer role (`owner` or `edit`) and the `edit_rundowns` capability ([decision 0054](../decisions/0054-edit-rundowns-capability.md)), rejects writes to script body or unknown roots, checks that every written cell names the pusher as `userId`, and refuses any client push that touches the server-only row keys `durationMs` or `prompter`.

## Server durations and the rundown clock

Writers editing stories linked from a rundown need only `edit` access to each story, never `edit_rundowns`. Keeping the rundown's durations consistent across collaborators is the server's job:

```text
  story commit ──► createStoryLinks ──► 500 ms coalesce per story
                                                 │
                                                 ▼
                                 timeScript() + project Read rate
                                                 │
                                                 ▼
                          authorityWrite(rundownId) ──► writeDurations()
                                                 │
                                                 ▼
                              timeRundown() ──► Dur, Cume, Start, Back, Over
```

- **Coalesced authority writes:** `createRundownDurations` (`packages/server-core/src/rundown/durations.ts`) listens to committed story and rundown updates via `createStoryLinks`, coalesces commits per story over 500 ms (`DURATION_COALESCE_MS`), computes whole-story and per-slug durations rounded to whole seconds at the project's Read rate, and writes changed `durationMs` values into every linked rundown through `authorityWrite` with `ORIGIN_SYSTEM` ([decision 0051](../decisions/0051-coalesced-server-durations.md)). Rooms running in `relay` mode do not write durations locally.
- **Front and back timing:** `timeRundown` (`packages/pagination/src/timing/rundown-clock.ts`) derives row numbers (skipping `header` and `unnumbered` rows), effective `durMs` (a producer's typed `dur` cell overrides `durationMs` until cleared), cumulative time (`cumeMs`), front-timed `startAt`, back-timed `backAt` and overall `overMs` (`totalMs - targetMs`), preserving `startAt - backAt === overMs` on every timed row. While a writer edits a story open Beside the rundown, the grid shows a live local duration indicator immediately alongside the authoritative server column.

## The air window

`timeRundown` computes each rundown's air window from its `airAt`, `windowLeadMs` (default 60 minutes, editable from 0 to 240 minutes in Details → Rundown) and `Math.max(targetMs ?? 0, totalMs)` ([decision 0056](../decisions/0056-air-window-bounds.md)). `createAirWindows` (`packages/server-core/src/rundown/air-window.ts`) caches each rundown's window on commit and projects it onto every linked story (preferring an active window, then the soonest upcoming window).

Inside an active air window:

1. `SUBSCRIBED.airWindow` delivers the window bounds to clients so the state bar announces the air-window status.
2. Automatic prompter sends pause; only explicit manual Send updates what appears on the prompter ([prompter.md](prompter.md)).
3. Automatic server document reorganisations (`packages/server-core/src/rebuild/rebuilder.ts`) postpone until the air window closes.

## Frame, stories and export

A rundown opens at `/s/$docId` inside the shared document frame via `DOCUMENT_BODIES`, `DetailsScope` (`rundown`) and `STATUS_READOUTS` ([decision 0053](../decisions/0053-rundown-in-one-document-frame.md)).

- **One document per segment or story:** creating a Show or News project starts its first rundown dated today; New rundown picks today or the first later unused day and creates fresh story documents rather than reusing an earlier broadcast's scripts. The Library groups rundowns by date with their stories nested under them.
- **Beside and script import:** opening a row puts its story Beside the rundown (jumping to `blockId` when split by slug) and returns focus to the row on close. Dropping a script onto a rundown creates one row with an offer to split by slug; Import rows from script turns acts into Header rows and slugs into linked rows in one undo step.
- **Rundown export and print:** `packages/formats/src/rundown/` builds six rundown outputs offered on the Send screen—Rundown PDF (with selectable columns), All scripts as one PDF (each story paginated with its own engine), Two-column PDF (brackets left at 40 %, spoken text right at 60 %), Prompter text, Brackets list and Rundown JSON—working offline for stories cached on the device while naming any story that is missing locally.

## Known limits

- A rundown document is created and synced, but is never reorganised on the server.
- A Can-view reader of a rundown itself is not served; read-only inspection relies on holding an edit role without `edit_rundowns`.
- Viewers are not shown as a count in the interface.
- Rundowns do not yet have full version History; single-step cell recovery uses each cell's `previous` value.
- Daily-show and newsroom timing, duration-write and 300-row scroll benchmarks have not yet been measured.
