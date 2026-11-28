# 0087. Book authoring Phase 2: craft elements, footnotes, EPUB 3 and opt-in Layout Engine v3

- Date: 2026-11-28
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Phase 1 (ADR 0086) delivered Manent's floating Book Format Bar, Schema v4 opening styles (`flush`, `drop_cap`, `raised_cap`), `sup`/`sub` marks, manuscript single/double line spacing, live word counts and pure-TypeScript Word (`.docx`) export. Three gaps remained for long-form book authors:

1. **Book-native structure & notes:** Manuscripts lacked dedicated `subheading` and `epigraph` elements, per-chapter word-count targets, and collaboration-safe manuscript footnotes/endnotes.
2. **Interoperability & e-book delivery:** Importing a Word `.docx` manuscript dropped inline marks, hyperlinks, opening styles and Book format identity, and Manent offered no offline e-book (`.epub`) export.
3. **Publishing layout:** All scripts remained pinned to fixed-pitch Courier Prime on US Letter or A4 with symmetric margins (Layout Engines 1 and 2). Book authors asked for paperback trim sizes (`5×8`, `5.5×8.5`, `6×9`), mirrored recto/verso margins and proportional book serif typography without disturbing existing v1/v2 scripts or breaking Manent's `screen === print === PDF` invariant (ADR 0067).

## Options considered

- **Store footnotes in a new Yjs root map or reuse private writers-only `NOTES_MAP`.** Rejected: older `rebuildDoc` rejects unknown Yjs root names, `TextAnchor` does not survive copy/paste or atomic sentence deletion, and `NOTES_MAP` is private to editors and leaks into FDX/Fountain editorial notes.
- **Use unbundled system serif fonts (`Georgia`, `Times New Roman`) in Layout Engine v3.** Rejected: system fonts vary across macOS/Windows/Linux and cannot be embedded offline in browser `pdfkit`, breaking deterministic `screen === print === PDF` pagination.
- **Raise `SCHEMA_VERSION` additively to `5` (`subheading`, `epigraph`, `targetWords`, inline `footnote` mark), add round-trip `.docx` import + pure-TS EPUB 3 export, and register an explicit opt-in Layout Engine `3` backed by a bundled SIL OFL static book serif (`@fontsource/source-serif-4`) with build-time FUnit advance tables, paperback trim sizes and sheet-underlay recto/verso mirroring.** Chosen.

## Decision

1. **Schema version 5 (additions-only, ADR 0018):** Append `"subheading"` and `"epigraph"` to `BLOCK_TYPES` and `FORMAT_ELEMENTS.manuscript` (slots `3` and `4` in manuscript `ElementPicker` and `Mod+3`/`Mod+4`), append nullable `targetWords: number | null` to `BlockAttrs` (kept off `LayoutBlock` so editing targets never triggers repagination), and append an inline non-inclusive `footnote` mark (`{ id, text }`) to `MARK_NAMES`. Footnotes render on screen via zero-width, zero-height `.mn-fn-ref` callout widgets on the coalesced outline cadence (zero `drift.ts` impact, zero keystroke-path cost) and export as OOXML `word/footnotes.xml`, EPUB 3 popup `epub:type="noteref"`/`footnote` endnotes, and appended PDF endnotes (preserving v1/v2 page breaks).
2. **DOCX import parity & EPUB 3 export (`@manent/formats`, pure):** Extract `word/_rels/document.xml.rels` under `DOCX_PART_LIMIT_BYTES`, reconstruct inline marks, hyperlinks, alignment, `drop_cap`, `raised_cap`, `flush`, `subheading`, `epigraph`, `break`, `page_break` and footnotes on `readDocx`, detect and preserve `format: "manuscript"` into Book projects on import, and add pure-TS EPUB 3 export (`writeEpub` via `fflate`, uncompressed `mimetype` first, valid XHTML chapters, TOC, inline styles, images and popup footnotes) offered strictly on `manuscript` documents.
3. **Opt-in Layout Engine `3` (ADR 0067):** Keep `ENGINE_VERSION = 1` for new documents and leave Engines `1` and `2` untouched. Register Engine `3` (`packages/pagination/src/engines/v3/`) strictly as an explicit opt-in for Books (`latestEngineForFormat("manuscript") === 3`; other formats stay at `2`), adding paperback trim sizes (`trade_5x8`, `trade_5_5x8_5`, `trade_6x9` alongside `letter` and `a4`), `script.mirrorMargins` (implemented on screen via `.mn-sheet[data-side="verso"]` underlay mirroring so split paragraphs never shift horizontally, in `#mn-print` and PDF via `pageMarginLeftPt` + verso header/footer slot swapping, and in DOCX via `word/settings.xml` `<w:mirrorMargins/>`), and deterministic `10.5 pt / 15 pt` (`14 px / 20 px`) proportional book serif typography using bundled static `@fontsource/source-serif-4` with build-time FUnit advance tables (`kern: 0`, `liga: 0` across pagination, DOM, Print and PDF).

## Consequences and trade-offs

- Existing v1–v4 documents keep identical canonical JSON, `minSchemaVersionOf` floors and Engine v1/v2 pagination hashes; screenplays pay zero bundle, font or runtime cost until a Book explicitly opts into Engine `3`.
- Disabling kerning/ligatures and using ragged-right text in Engine `3` trades micro-typographic justification for exact cross-engine `screen === print === PDF` parity without external network fonts.
- Older builds open Schema v5 manuscripts read-only with `severity: "newer"` preservation rather than dropping content.

## Revisit when

Engine `4` adds per-word justified spacing tables or kerning pair tables, or when multi-column / magazine layouts need non-linear page grids.
