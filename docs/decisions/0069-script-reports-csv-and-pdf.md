# 0069. Character, scene and location reports export in both CSV and PDF

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Writers, line producers and assistant directors read script breakdowns in two distinct ways: importing tabular counts into scheduling and budgeting spreadsheets, and printing or emailing clean breakdown summaries for table reads and production meetings.

## Options considered

- Export reports as CSV only. Rejected: forces producers to format spreadsheets manually before sharing a readable breakdown in a meeting.
- Export reports as PDF only. Rejected: prevents line producers and scheduling assistants from importing counts into spreadsheets.
- Export all three breakdown reports—Character report, Scene report and Location report—in both RFC 4180 CSV and Courier Prime PDF on the script's paper size. Chosen.

## Decision

Export offers Character report, Scene report and Location report in both CSV and PDF (`packages/revisions/src/numbers/` and `packages/formats/src/reports/`), using RFC 4180 UTF-8 CRLF for CSV and `pdfkit` tables in Courier Prime on the script's paper size (Letter or A4) with repeated column headings across pages for PDF. All report writers load lazily when exporting so they stay out of the editor's entry bundle.

## Consequences and trade-offs

- Producers can hand out clean PDF breakdowns directly and feed identical counts into spreadsheets from CSV without maintaining two separate calculation paths.
- Adding six report entries to Export alongside Clean PDF, FDX, Fountain and Sides increases the number of choices in the Export `As` row; keeping the writers behind dynamic imports preserves bundle-split budgets (`apps/web/test/build.test.ts`).

## Revisit when

Additional breakdown reports are added and the Export `As` selector benefits from grouped categories or a compact select control.
