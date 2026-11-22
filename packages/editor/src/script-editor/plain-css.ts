// The styles of a script without pages (Ink): plain source in the script face, every ligature off so "->" stays as
// typed, and a gutter numbering every line, drawn from a counter and never stored.

/** The class the plain view's own element carries. */
export const PLAIN_VIEW_CLASS = "mn-plain";

// the sections carry no containment here: style containment would start the count again in each one
export const PLAIN_CSS = `
.mn-plain {
  font: 12pt/1.5 var(--face-page);
  font-synthesis: none;
  font-kerning: none;
  font-variant-ligatures: none;
  white-space: pre-wrap;
  color: var(--page-ink);
  counter-reset: mn-line;
  padding-left: 6ch;
  outline: none;
}
.mn-plain .el {
  position: relative;
  margin: 0;
  counter-increment: mn-line;
}
.mn-plain .el::after {
  content: counter(mn-line);
  position: absolute;
  top: 0;
  right: calc(100% + 1ch);
  color: var(--page-ink-muted);
  font-style: normal;
  font-weight: normal;
  user-select: none;
}
`;
