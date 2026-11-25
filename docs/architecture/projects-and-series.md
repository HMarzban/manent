# Projects and series

How Manent organises multi-script projects, shared styles, page furniture, series, names and facts, room documents, copies and the series Board on top of [overview.md](overview.md).

## The project index

Every project has its own CRDT index document (`kind: "index"`), created on the device when the project is created and addressed deterministically by `indexDocId("project", projectId)` ([decision 0035](../decisions/0035-project-index-document.md)). It lives in the project's SQLite file alongside the project's scripts and holds eleven append-only root maps (`packages/crdt/src/index-maps.ts`):

| Root map   | What it holds                                                              | Who may push to it              |
| ---------- | -------------------------------------------------------------------------- | ------------------------------- |
| `template` | Project kind, format defaults, Act structure, Target length, template data | Owners and revision issuers     |
| `style`    | Shared Element style overrides, Header and footer, date format             | Owners and revision issuers     |
| `groups`   | Project groups (`name`, `role`, `memberUserIds`, `watermark`)              | Owners and revision issuers     |
| `ladder`   | Ordered draft-name ladder labels                                           | Owners and revision issuers     |
| `can_also` | Extra project capabilities granted to non-owners                           | Owners and revision issuers     |
| `seasons`  | Season entries (`id`, `number`, `title`)                                   | Editors                         |
| `episodes` | Episode entries (number, title, writer, stage, due date, counts, doc IDs)  | Editors (summaries also server) |
| `names`    | Project Characters, Sets and Terms                                         | Editors                         |
| `facts`    | Pinned continuity facts linked to script blocks                            | Editors                         |
| `board`    | Series Board Storylines and cards with scene links                         | Editors                         |
| `source`   | Provenance records for copies (`docId`, `versionId`, `copiedAt`, chapters) | Editors                         |

In the server's write path (`packages/server-core/src/project/validate.ts`), every push to a project index is checked map by map against the pusher's role so non-owners cannot alter template, style, group, ladder or capability settings while editors can still maintain episodes, names, facts and the Board.

## Style, page furniture and script material

Settings (`@manent/settings`) include a project scope alongside user and script scopes, supporting text, number and structured values.

- **Following project style:** an unlocked episode or script follows its project's shared `style` and Element style live. When a script locks for production, its active Element style freezes onto the script so later project-wide tweaks never disturb locked pages. The Ruler can adjust one block or apply its margins to every block of that element.
- **Header and footer:** left, centre and right slots with presets (page number, page of total, date, title, section, running time, revision label or custom text), first-page visibility and an optional hairline rule draw inside the existing top and bottom page margins on screen, in print and in PDFs (`packages/editor/src/page/furniture/header-footer.ts`, `packages/formats`) without altering body layout or bumping the pagination engine version ([decision 0041](../decisions/0041-headers-and-footers-in-page-margins.md)). Watermarks sit below the footer margin.
- **Draft ladder:** each project defines an ordered list of draft labels (Drama, Single-camera, Multi-camera and Custom share one default ladder; Animation adds three labels). Name this draft… proposes the next label after the furthest one used.
- **Script material and Scenes tab:** beside the script body, each script's CRDT holds `alternates` (alternate speeches swapped in one undo step and optionally printed underneath), `cuts` (trimmed passages restored back after the block they followed) and `sceneProgress` (manual Writer and Progress per scene). The Scenes tab switches between List and Cards views and reorders scenes, acts and settings lists through `@manent/ui`'s single shared sortable component ([decision 0048](../decisions/0048-one-sortable-component-for-every-reorder.md)).
- **Running time:** `@manent/pagination` computes scene-by-scene and whole-script Running time from dialogue word counts at the project's read rate combined with explicit `T=m:ss` bracket timings.

## Series, episodes and room documents

A series project organises work into seasons and numbered episodes (such as `101`, `201`) in the Library's Series view. Each `EpisodeEntry` links up to three companion documents (`docIds.script`, `docIds.outline`, `docIds.roomLog`).

- **Server-maintained summaries:** `packages/server-core/src/project/episode-writes.ts` updates each episode's stage, last-draft page count, open comment count in the newest round and lock state as authority writes whenever a draft is named, a revision is issued, a lock changes or comments change.
- **Outlines:** an outline (`kind: "outline"`) opens beside the script and uses Manent's existing block schema—General blocks for prose and scene headings with synopses for Beats ([decision 0045](../decisions/0045-outline-elements.md))—so Start script from outline copies beats directly into scenes.
- **Room logs:** a series episode's room log (`kind: "room_log"`) opens beside the script as a collaborative room document for notes, pitches and breaking sessions without touching the script's pages.

## Names, facts and Checks

Each project index maintains shared story knowledge that assists writers as they type and before a draft goes out:

- **Names (Characters, Sets, Terms):** autocomplete suggests the project's Characters on character cues and Sets on scene headings. While spelling checks are on, words differing from a listed Character, Set or Term by case, spacing or one to two letters get a dotted near-match underline (`@manent/revisions`, `@manent/editor`), with Use the project's spelling and Add to names commands in the palette.
- **Facts:** writers can pin a single-block passage as a continuity fact in the project index and review pinned facts in Project settings.
- **Pre-send Checks:** `@manent/revisions` computes Checks (pages over Target length, new character names, near-matches to project names, new proper nouns and overused words) shown in Details and at the top of Send forms. Any Check can be flagged for a colleague as a comment thread linked through the comments document's `flags` map ([decision 0046](../decisions/0046-flagged-check-is-a-comment-thread.md)).

## The series Board

The Board screen (`apps/web/src/screens/board/`) reads and writes the project index's `board` map for a series's active season. Storylines form horizontal lanes across episodes, cards represent Beats that reorder within and across lists through `@manent/ui`'s sortable component ([decision 0048](../decisions/0048-one-sortable-component-for-every-reorder.md)), and cards can link directly to scenes in episode scripts. Access follows the server's role on the project index so read-only members inspect the Board without mutating it.

## Copies, imports and archives

- **Copies and Start from:** Duplicate (on a working script or a History version), Try it on a copy first (in the Lock dialog) and Start a … from this… create a brand-new CRDT document with fresh block IDs and record its origin in the project index's `source` map so the source can be opened beside the new document ([decision 0038](../decisions/0038-copies-have-new-block-ids-and-record-their-source.md)).
- **Browser-side imports:** in addition to Final Draft (`.fdx`) and Fountain, `@manent/formats` reads text-based PDFs with lazily loaded `pdfjs-dist`, Word `.docx` files with bounded selective `fflate` extraction, and plain text directly in the browser and offline ([decision 0042](../decisions/0042-pdf-and-docx-import-in-the-browser.md)).
- **Project archive:** exporting a project builds one zip on the device (`packages/formats/src/archive/write.ts`, using `fflate`) containing a folder per document with its `.fdx`, `.fountain`, and `drafts/{draft name}.json` files alongside a top-level `manifest.json` ([decision 0043](../decisions/0043-project-archive-zip-format.md)).
