# 0086. Book formatting toolbar and manuscript authoring chrome

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Manent's Book (`manuscript`) format shares the single paged-document frame with screenplays, stage plays, variety shows and news stories. Unlike screenwriters who rely on `Tab`/`Enter` muscle memory and `INT.`/`EXT.` auto-detection, book authors expect immediate visible controls to format text, switch block styles (Chapter, Body, Quote, Break), insert figures and page breaks, inspect word counts, and shape page layout (paper size, lines per page, running headers and white paper).

Previously, web documents carried no persistent formatting toolbar and no `Format` menu, so inline styles, links, figure insertion and page breaks were hidden behind mouse-only selections or the Command Palette. At the same time, manuscript documents exposed screenplay-only settings (`Mores and Continueds`, `Scene numbers`, `Revisions`), screenplay-only commands (`Dual dialogue`, `Rename character`, `Reports…`, `Alternates`), screenplay-only exports (`FDX`, `Fountain`, character/scene/location reports), zero word-count telemetry, a `BlankCard` flow that inserted untitled chapters hidden from the Chapters outline, and running headers whose `Section` slot ignored `chapter` headings.

Three hard constraints apply:

- **ADR 0031 (Off the keystroke path):** A persistent toolbar must never re-render React on normal prose keystrokes or write stores during ProseMirror transactions.
- **ADR 0011 (2,000-page performance):** Word counts and inline mark state must stay bounded without walking the full document on every keystroke.
- **ADR 0067 (Explicit layout engine pinning):** Existing pagination engines (`v1`, `v2`) remain bit-for-bit unchanged; book chrome and DOCX export must not silently alter page breaks.

## Options considered

- **Show a permanent word-processor ribbon on every script format.** Rejected: adds vertical chrome and visual clutter to screenplay, stage play, variety and Ink workflows where keyboard-first writing is expected.
- **Keep formatting strictly inside the mouse-triggered selection bubble and Command Palette.** Rejected: leaves keyboard-only writers and book authors without visible block styling, figure insertion, link editing, spacing controls or quick page layout.
- **Mount a contextual Book Formatting & Layout Bar strictly for `manuscript` documents (toggleable via `View ▾ → Formatting bar`, on by default for Books), backed by O(1) primitive mark facts and cached per-section word counts, alongside format-accurate Book settings, metrics, chapters and DOCX export.** Chosen.

## Decision

When editing a `manuscript` document, the document frame floats a compact, single-row WAI-ARIA `role="toolbar"` **Book Format Bar** (`.mn-book-pill`) top-centre over the page column (`gridArea: "page"`, zero stacked bars, zero pixels and zero subscriptions on all other formats, toggleable via `view.formattingBar`, settling onto calm chrome elevation while actively writing without dropping WCAG 2.2 AA text contrast). Active inline marks (`marksMask`, `markColor`, `markHighlight`, `markLink`), `blockType` and `blockFirstLine` publish as O(1) primitives from `bridge-plugin` (observing `state.storedMarks` without walking the document), while `wordCount` is cached per `LayoutBlock` over `Pagination.blocks` (zero ProseMirror document walks) and published off the keystroke path on the coalesced outline cadence.

Schema version 4 appends an additive nullable `firstLine: "flush" | "drop_cap" | "raised_cap" | null` attribute to `BlockAttrs` plus `sup` and `sub` inline marks (omitted from canonical JSON when `null`/absent, preserving v1–v3 hashes and Engine v1/v2 page breaks), styled in `PAGE_CSS` via `data-first-line` (skipped by `drift.ts`) and zero-height-inflation `sup`/`sub`, and exported as real OOXML drop caps, raised caps, flush openings, superscripts, subscripts, text colours and highlights in Word (`.docx`). A manuscript-only `script.lineSpacing` (`"double" | "single"`, default `"double"`) setting lets authors switch between submission double-spacing and compact single-spaced drafts without altering non-manuscript profiles.

In parallel, manuscript documents hide screenplay-only settings, commands and exports, resolve `chapter` headings in the running-header `section` slot across screen, print and PDF, expose Book-native counts (`Pages`, `Chapters`, `Words` and reading time), let authors add titled chapters directly from the Chapters panel, wire the dormant `link` mark and `clear_formatting` action, and offer pure-TypeScript Word (`.docx`) export via `fflate`.

## Consequences and trade-offs

- Book authors get an immediately actionable, calm archival floating bar covering Element picker, Bold/Italic/Underline, a dedicated Colour & Highlight picker (with live tint bar, highlight dot and theme-token swatches), More text styles (Strikethrough, All-caps, Superscript, Subscript, Link and Clear style), direct Alignment picker, 1-click Drop cap, Space & indent (Indent / Flush left / Drop cap / Raised cap, multi-step Space before, Indent/Width steppers, Ruler and Reset layout), Insert (New chapter, Quote, Break, Page break, Figure), and Page layout (US Letter / A4, Single / Double line spacing, Lines per page, Running header presets, White page and canonical links) — without adding a single pixel or React subscription to screenplay mode.
- Leaf toolbar buttons subscribe only to their own primitive fact via `useEditorFact`, preserving zero keystroke-path renders under `DispatchGuard`.
- Publishing-grade proportional serif typography, custom paperback trim sizes and recto/verso margins remain intentionally deferred to a future opt-in Layout Engine v3 (ADR 0067) so existing `v1`/`v2` documents stay layout-invariant.

## Revisit when

Layout Engine v3 introduces proportional serif book typography and publishing trim sizes, or when another prose-first format requires the contextual formatting bar.
