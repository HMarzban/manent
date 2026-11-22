// The styles of source lines: each kind and range in its role's colour, from the theme's page tokens, with a cue
// that is not colour (knots and stitches bold, comments italic, an Ink choice or gather indented by its depth).
export const SOURCE_CSS = `
.src-knot, .src-stitch {
  color: var(--page-src-knot);
  font-weight: bold;
}
.src-choice, .src-gather {
  color: var(--page-src-choice);
  padding-left: calc(var(--depth, 0) * 2ch);
}
.src-logic, .src-variable, .src-condition {
  color: var(--page-src-logic);
}
.src-divert {
  color: var(--page-src-divert);
}
.src-tag {
  color: var(--page-src-tag);
}
.src-comment {
  color: var(--page-src-comment);
  font-style: italic;
}
`;
