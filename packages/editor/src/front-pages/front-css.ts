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
`;
