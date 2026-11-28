# 0088. Book Phase 3: front/back matter, cover, Engine 3 spreads, Markdown, book checks and multi-part compile

- Status: Accepted
- Date: 2026-11-28
- Decided by: project owner and engineering lead

## Context

Phases 1 and 2 (ADRs 0086 and 0087) gave Manent a floating Book Format Bar, Schema v5 book craft (`subheading`, `epigraph`, chapter `targetWords`, inline `footnote`, openings and `sup`/`sub`), full Word (`.docx`) round-trip parity, pure-TypeScript EPUB 3 export, PDF endnotes, and opt-in Layout Engine 3 (bundled Source Serif 4, five paperback/manuscript trims, and mirrored recto/verso margins).

To make Manent genuinely print- and store-ready for long-form book authors without adding UI clutter or a learning curve, five remaining gaps must be closed cohesively across the existing surfaces:

1. **Book cover and front/back matter:** Books currently share screenplay title-page fields (`Credit`, `Source`, `Contact`, `Draft`) and have no dedicated cover image, subtitle, ISBN, copyright, dedication, acknowledgements, or about-the-author matter, nor an auto-generated Table of Contents.
2. **Engine 3 print typography polish:** Real print books suppress running headers on chapter-opening pages, alternate Book Title (left/verso) and Chapter Title (right/recto) running heads, optionally start chapters on right-hand (recto) pages with blind-folio blank left pages, and let authors inspect two-up facing spreads before exporting.
3. **Whole-book footnote review and pre-export book checks:** Authors need a single ordered Footnotes list inside `Details` (with click-to-jump, inline edit, and undoable removal) and manuscript-specific pre-export checks (empty footnotes, missing figure descriptions, chapters under word target, unbalanced quotes) without adding a fourth side-panel tab.
4. **Lossless Markdown round-trip and multi-part book compile:** Many book authors exchange manuscripts in Markdown (`.md`) or organise long books into multiple part documents within one `book` project, needing one-click whole-book compilation into PDF, EPUB 3, Word, or Markdown.
5. **Cohesion and plain vocabulary:** Every new capability must reuse Manent's existing surfaces (in-editor front sheets, floating Book Format Bar, `Details`, `Send → Export`, Library row menu / import) with plain, jargon-free English labels (`Left and right margins`, `Start chapters on right pages`, `Book and chapter`, `Single | Spread`, `Whole book`) and zero chrome or subscriptions on non-Book formats.

## Options considered

1. **Store book front/back matter in a new Y.Map or `settings` bag vs. extending `TITLE_PAGE_MAP`:** Adding a new root map would require a schema migration, server rebuild changes and separate undo tracking; storing prose in the settings bag would mix long-form text into layout preferences. Extending `TITLE_PAGE_MAP` via a dedicated `bookMatter(doc)` helper keeps `SCHEMA_VERSION = 5`, preserves the nine classic title-page fields unchanged, reuses `ORIGIN_TITLE_PAGE` undo/redo, and replays cleanly on the server.
2. **Add a fourth side-panel tab for Footnotes and a modal dialog for Book Matter vs. reusing existing surfaces:** A fourth tab and modal dialogs would increase chrome and learning curve across the interface. Rendering Book Matter directly on the in-editor front sheet (with progressive-disclosure chips), Footnotes as a Book-only section inside `Details → Book`, and facing spreads as a `Single | Spread` toggle inside `Send → Export` keeps zero learning curve and zero chrome on non-Book formats.
3. **Compute TOC page numbers in a second pagination pass vs. Roman-numeral front matter after body pagination:** Numbering front matter in lowercase Roman numerals (`i, ii, iii…`) while body pages begin at Arabic `1` lets body pages paginate once and `buildBookToc` resolve exact Arabic labels with zero circular dependencies.

## Decision

### 1. Additive CRDT Book Matter on `TITLE_PAGE_MAP` (Zero Schema Bump)

- Keep `SCHEMA_VERSION = 5` and the nine classic `TITLE_PAGE_FIELDS` untouched.
- Define `BOOK_MATTER_FIELDS` (`subtitle`, `isbn`, `copyright`, `dedication`, `acknowledgments`, `aboutAuthor`, `coverAssetId`) in `packages/schema/src/title-page.ts`, and export `isAssetId` from `packages/schema/src/block-attr-checks.ts`.
- Store book matter on the existing `TITLE_PAGE_MAP = "titlePage"` Y.Map via `bookMatter(doc)` in `packages/crdt/src/book-matter.ts`, using `ORIGIN_TITLE_PAGE` so undo/redo works automatically and server rebuild replay (`replay-base.ts`, `replay.ts`) preserves every key.
- `coverAssetId` holds only a 64-character lowercase SHA-256 hex asset identifier pointing into the existing project-scoped offline asset store (never raw bytes or URLs).

### 2. Shared Running-Header Rules & Optional Engine 3 Recto Chapter Openings

- Consolidate running-header resolution (`pageRunningContext`, `isChapterOpeningPage`, `resolveBarSlots`) into a single pure module `packages/pagination/src/running-header.ts` consumed by both `@manent/editor` and `@manent/formats`, guaranteeing zero screen/print/PDF drift.
- Add `"verso_title_recto_chapter"` to `HEADER_SLOT_KINDS` and optional `suppressChapterOpenings?: boolean` to `HeaderSlots` (omitted when undefined so existing stored JSON is unchanged). On Engine 3 (`book_serif`), running headers suppress automatically on chapter-opening pages unless opted back in; v1/v2 remain unchanged.
- Add manuscript-only settings `script.rectoChapters`, `script.includeToc`, and `script.tocSubheadings` in `packages/settings/src/definitions/script-layout.ts`.
- When `rectoChapters` is enabled on Engine 3, `paginateV3`/`repaginateV3` insert first-class `blank?: true` verso `Page` entries before even-indexed chapters. Blank verso pages advance the folio count silently (no header, footer, or page number), render with `side: -2` break ordering in the editor so blank breaks always precede chapter breaks at the same block offset, and are skipped by `pageOf` and `firstsOnPages`.

### 3. Roman-Numeral Front Matter, Auto-Generated TOC & Facing-Page Spread Preview

- Add pure `buildBookToc` and `romanNumeral` (`packages/pagination/src/book-toc.ts`) and `layoutBookFrontPages` (`packages/pagination/src/engines/v3/front-pages.ts`). Body pages paginate first so `buildBookToc` resolves exact Arabic page labels without circular dependencies; front matter and Contents pages take lowercase Roman numerals (`i, ii, iii…`) and pad a blank verso page when `rectoChapters` is on so Arabic Page 1 lands on a right-hand sheet.
- Render optional Cover, Front Matter, TOC, and Back Matter across PDF (`packages/formats/src/pdf/{cover,back-matter}.ts`), Word (`packages/formats/src/docx/book-matter.ts` with Roman/Arabic sections, TOC field + static entries, and `oddPage` chapter breaks), and EPUB 3 (`packages/formats/src/epub/matter.ts` with `properties="cover-image"`, `cover.xhtml`, semantic `epub:type` front/back pages, and nested `nav.xhtml` + optional spine TOC).
- Add a `Single | Spread` segmented toggle inside `Send → Export` (`PageTiles`) strictly for Engine 3 paged manuscript exports, defaulting to `Spread` when mirrored margins are on.

### 4. Footnotes Section, Book Checks, Lossless Markdown & Multi-Part Compile

- Register `FootnotesSection` in `Details → Book` (capped at 8 with `Show all`, click-to-jump, active-caret highlight, inline edit, undoable remove; returns `null` on non-Books).
- Add four manuscript-only checks in `packages/revisions/src/checks/book-checks.ts` (`empty_footnote`, `figure_missing_alt`, `chapter_under_target`, `unbalanced_quotes` with multi-paragraph dialogue exemption) wired into the existing `Details → Checks` and `Send → Checks` pipeline.
- Add pure-TypeScript lossless Markdown (`packages/formats/src/markdown/`) supporting YAML front matter, chapters, subheadings, quotes/epigraphs, breaks, openings, inline marks/links, and `[^n]` footnotes, appending `"markdown"` to `SOURCE_FORMATS`, Export `As`, and Library Import (auto-creating a `book` project).
- Add `combineBookParts` (`packages/formats/src/book/compile.ts`) and `book-compile.ts` (`apps/web/src/send/`) surfaced through `Add part` in Book project menus and a `Whole book` option in `Send → Export`'s `What` row when a Book project has two or more manuscripts.

## Consequences and trade-offs

- **Positive:** Single-document and multi-part books gain complete print-on-demand and e-book publishing fidelity (cover, front/back matter, TOC, recto chapter starts, spread proofing, Markdown, checks) with zero schema migration, zero v1/v2 regressions, and zero added chrome on non-Book formats.
- **Trade-offs:** Blank verso pages in Engine 3 add a `blank?: true` branch in break-spec ordering (`side: -2`), `page-labels.ts`, and `decorations.ts`; adding `"markdown"` to `SOURCE_FORMATS` touches exhaustive import tables in `apps/web` and `packages/ui`.
- **Verification:** Covered by pure unit tests (`book-matter`, `v3-publishing-polish`, `book-publishing-export`, `markdown`, `book-compile`, `book-checks`), DOM tests, Tour scenario `write-book-publishing`, and three-browser Playwright E2E (`chromium`, `firefox`, `webkit`) with WCAG 2.2 AA scans.

## Revisit when

- Book authors need rich multi-page cover design or full-bleed print jacket wraps (front, spine and back cover computed from paper stock and page count).
- Multi-part books require explicit custom drag-and-drop part reordering or per-part front/back matter overrides beyond Library creation order.
- A future layout engine introduces bottom-of-page inline footnotes in addition to endnotes and EPUB 3 popup notes.
