// Other people's carets and selections. A caret takes no width and its bar and name tab are placed absolutely, so
// no line moves when one is drawn; colours come only from the collaborator tokens.

// The caret and the selection of collaborator n take the token --collab-n.
const colourRule = (n: number): string =>
  `.mn-cursor[data-collab="${n}"], mn-remote-sel[data-collab="${n}"] { --mn-collab: var(--collab-${n}); }`;

const colourRules = Array.from({ length: 10 }, (_, i) =>
  colourRule(i + 1),
).join("\n");

export const CURSOR_CSS = `
.mn-cursor {
  position: relative;
  display: inline;
  z-index: 1;
  pointer-events: none;
  user-select: none;
}
.mn-cursor[data-active] {
  z-index: 3;
}
.mn-cursor-bar {
  position: absolute;
  top: -1px;
  bottom: -1px;
  left: -1px;
  width: 2px;
  border-radius: 1px;
  background: var(--mn-collab);
}
.mn-cursor-tab {
  position: absolute;
  bottom: 100%;
  left: -1px;
  padding: 0 4px;
  border-radius: 2px 2px 2px 0;
  font: 600 var(--type-micro) / var(--lh-micro) var(--face-ui);
  white-space: nowrap;
  color: var(--collab-on);
  background: var(--mn-collab);
  opacity: 0.94;
}
.mn-cursor[data-idle] .mn-cursor-tab {
  opacity: 0.74;
}
mn-remote-sel {
  box-shadow: inset 0 -2px 0 var(--mn-collab);
}
${colourRules}
[data-cursors="off"] .mn-cursor {
  display: none;
}
[data-cursors="off"] mn-remote-sel {
  display: contents;
}
`;
