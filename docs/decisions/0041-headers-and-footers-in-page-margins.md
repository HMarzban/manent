# 0041. Headers and footers draw in the page margins with no pagination engine change

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Scripts need configurable headers and footers—page numbers, page counts, titles, dates, section names, running time, revision labels and custom text—with presets and an optional hairline rule, drawn identically on screen, in print and in exported PDFs. At the same time, pagination engines are versioned contracts so existing scripts and locked production drafts never shift a line break.

## Options considered

- Feed header and footer settings into the pagination engine and bump the engine version so body height shrinks when a header or footer is enabled. Rejected: turning a footer on or off would move page breaks across an entire script, break locked pages and force a second pagination engine version to maintain.
- Draw headers and footers only in PDF export and omit them on screen. Rejected: Manent's pages on screen must match what prints and exports.
- Represent headers and footers as left, centre and right slots with presets, drawn in the existing top and bottom page margins as page furniture on screen, in print and in PDF with no pagination engine version change. Chosen.

## Decision

Header and footer settings store left, centre and right slots (plus first-page visibility and an optional hairline rule) with built-in presets, and are drawn inside the page's existing top and bottom margins by the editor's page furniture layer (`packages/editor`), print sheets and PDF writer (`packages/formats`). Because they never intrude on the body text area, no page break changes and the pagination engine stays on its current version.

## Consequences and trade-offs

- Writers can switch header and footer presets, change date formats, or show and hide rules without shifting a single line or invalidating locked production pages.
- Screen, print and PDF share the same slot resolution and margin geometry, keeping watermarks below the footer margin so they never collide.
- Headers and footers are constrained to one line per band inside the fixed top and bottom margins; multi-line running heads are not supported without a new page profile.

## Revisit when

A format requires multi-line headers or footers that must reduce the number of body lines per page, which would belong in a new page profile or pagination engine version.
