// The styles of the pages before page 1: sheets as the body's, each field a box on the page's grid in the script face;
// in Reflow view, no sheets, each page after a labelled rule as the body's pages are.

export const FRONT_CSS = `
.mn-front {
  position: absolute;
  left: 0;
  width: var(--geo-page-w);
}
.mn-front-sheet {
  position: absolute;
  left: 0;
  width: var(--geo-page-w);
  background: var(--page-paper);
  outline: var(--page-edge-w) solid var(--page-edge);
  box-shadow: var(--elev-page);
  font: 12pt/12pt "Courier Prime", monospace;
  font-synthesis: none;
  text-rendering: geometricPrecision;
  font-kerning: none;
  font-variant-ligatures: none;
  letter-spacing: 0;
  color: var(--page-ink);
}
.mn-front-number {
  position: absolute;
  left: var(--geo-left);
  width: calc(var(--geo-column) * var(--geo-cell));
  text-align: right;
  user-select: none;
}
.mn-front-field {
  position: absolute;
  min-height: var(--geo-line);
  line-height: var(--geo-line);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  outline: none;
}
.mn-front-field:empty::before {
  content: attr(data-placeholder);
  font-style: italic;
  color: var(--page-ink-muted);
  pointer-events: none;
}
.mn-reflow .mn-front-sheet {
  position: static;
  width: auto;
  padding: 0 var(--geo-right) var(--geo-line) var(--geo-left);
  background: none;
  outline: none;
  box-shadow: none;
}
.mn-reflow .mn-front-field {
  position: static;
  margin-top: var(--geo-line);
}
.mn-book-front {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 44px var(--geo-right) 36px var(--geo-left);
  box-sizing: border-box;
}
.mn-book-front[data-book-serif="1"] {
  font-family: var(--book-font, "Source Serif 4", Georgia, serif);
}
.mn-book-cover {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.mn-book-cover-img {
  max-height: 150px;
  max-width: 110px;
  object-fit: contain;
  border-radius: 3px;
  box-shadow: var(--elev-page);
}
.mn-book-cover-actions,
.mn-book-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.mn-book-chip {
  font: 11px/1.2 var(--font-ui, system-ui, sans-serif);
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--page-edge);
  background: transparent;
  color: var(--page-ink-muted);
  cursor: pointer;
}
.mn-book-chip:hover {
  color: var(--page-ink);
  border-color: var(--page-ink-muted);
}
.mn-book-core {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  text-align: center;
}
.mn-book-field {
  width: 100%;
  min-height: 1.4em;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  outline: none;
}
.mn-book-field:empty::before {
  content: attr(data-placeholder);
  font-style: italic;
  color: var(--page-ink-muted);
  pointer-events: none;
}
.mn-book-title {
  font-size: 20pt;
  font-weight: 700;
}
.mn-book-subtitle {
  font-size: 13pt;
  font-style: italic;
}
.mn-book-author {
  font-size: 12pt;
  margin-top: 10px;
}
.mn-book-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
}
.mn-book-matter-group {
  border-top: 1px solid var(--page-edge);
  padding-top: 10px;
}
.mn-book-matter-label {
  font: 10px/1.2 var(--font-ui, system-ui, sans-serif);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--page-ink-muted);
  margin-bottom: 4px;
}
.mn-book-isbn-label {
  margin-top: 8px;
}
.mn-book-dedication {
  font-style: italic;
  text-align: center;
}
.mn-book-matter-body,
.mn-book-isbn {
  font-size: 10.5pt;
}
`;
