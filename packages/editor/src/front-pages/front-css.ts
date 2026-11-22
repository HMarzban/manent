// The styles of the pages before page 1: sheets as the body's, each field a box on the page's grid in the script face.
import { CELL_PT, LINE_PT, UNIT_PT } from "@manent/pagination";

export const FRONT_CSS = `
.mn-zoom {
  position: relative;
}
.mn-front {
  --geo-cell: ${CELL_PT}pt;
  --geo-line: ${LINE_PT}pt;
  --geo-unit: ${UNIT_PT}pt;
  position: absolute;
  top: 0;
  left: 0;
  width: var(--geo-page-w);
  transform-origin: 0 0;
}
.mn-front-sheet {
  position: absolute;
  left: 0;
  width: var(--geo-page-w);
  background: var(--page-paper);
  box-shadow: 0 0 0 1px var(--page-edge);
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
`;
