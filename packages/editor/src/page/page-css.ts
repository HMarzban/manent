// The page's styles that hold for every profile. Lengths are physical, so the layout at 100 % is the engine's.
// Colours come only from the theme's page tokens; nothing that holds text draws a background.

import {
  BLOCK_SLACK_CELLS,
  CELL_PT,
  LINE_PT,
  UNIT_PT,
  WRAP_MODE,
} from "@manent/pagination";

// the image ProseMirror adds after a widget that ends a line, such as another person's caret, is inline as in
// ProseMirror's own styles, since the reset makes images blocks and one would put an empty line under that line;
// geometricPrecision turns subpixel positioning on, without which Chromium on Linux rounds each advance to a whole pixel
export const PAGE_CSS = `
.mn-pages {
  --geo-cell: ${CELL_PT}pt;
  --geo-line: ${LINE_PT}pt;
  --geo-unit: ${UNIT_PT}pt;
  position: relative;
  width: var(--geo-page-w);
  transform-origin: 0 0;
}
.mn-sheet {
  position: absolute;
  left: 0;
  width: var(--geo-page-w);
  height: var(--geo-page-h);
  background: var(--page-paper);
  box-shadow: 0 0 0 1px var(--page-edge);
}
.mn-page-view {
  font: 12pt/12pt "Courier Prime", monospace;
  font-synthesis: none;
  text-rendering: geometricPrecision;
  font-kerning: none;
  font-variant-ligatures: none;
  letter-spacing: 0;
  hyphens: none;
  tab-size: 1;
  white-space: ${WRAP_MODE};
  overflow-wrap: break-word;
  position: relative;
  background: transparent;
  color: var(--page-ink);
  outline: none;
}
.mn-pages.fonts-loading .mn-page-view {
  visibility: hidden;
}
.section {
  display: flow-root;
  content-visibility: auto;
  padding-left: var(--geo-left);
  padding-right: var(--geo-right);
}
.section.keep {
  content-visibility: visible;
}
.no-cv .section {
  content-visibility: visible;
}
p.el {
  margin: 0;
  clear: both;
  padding-top: calc(var(--el-before) * var(--geo-line));
  margin-left: calc((var(--el-indent) - var(--el-slack-left)) * var(--geo-cell));
  width: calc((var(--el-width) + ${BLOCK_SLACK_CELLS}) * var(--geo-cell));
  line-height: calc(var(--el-spacing) * var(--geo-line));
  text-indent: calc(var(--el-first) * var(--geo-cell));
}
p.el.pg-first {
  padding-top: calc(var(--el-drop, 0) * var(--geo-line));
}
.pb {
  display: block;
  user-select: none;
  margin-left: calc(-1 * var(--geo-left));
  width: var(--geo-page-w);
  text-transform: none;
  text-indent: 0;
  text-align: left;
  font-weight: normal;
  font-style: normal;
  line-height: var(--geo-line);
}
.pb-mid, .pb-col {
  margin-left: calc(-1 * (var(--geo-left) + (var(--el-indent) - var(--el-slack-left)) * var(--geo-cell)));
}
.pb > * {
  display: block;
}
.pb [data-text]::before {
  content: attr(data-text);
}
.pb-more, .pb-contd {
  height: var(--geo-line);
  padding-left: calc(var(--geo-left) + var(--geo-cue-indent) * var(--geo-cell));
}
.pb-fill {
  height: calc(max(0, var(--fill)) * var(--geo-unit));
}
.pb-foot {
  height: calc(var(--geo-bottom) + min(0, var(--fill)) * var(--geo-unit));
  padding-right: var(--geo-right);
  text-align: right;
}
.pb-gap {
  height: var(--geo-gap);
}
.pb-head {
  box-sizing: border-box;
  height: var(--geo-top);
  padding-top: 36pt;
  padding-right: var(--geo-right);
  text-align: right;
}
.pb-continued {
  height: calc(2 * var(--geo-line));
  padding-left: var(--geo-left);
}
.pb-col > :not(.pb-more):not(.pb-contd) {
  visibility: hidden;
}
.lb {
  display: block;
  height: 0;
}
.lb-forced {
  white-space: pre;
}
.el[data-contd]::after {
  content: attr(data-contd);
}
.el[data-open]::before {
  content: attr(data-open);
}
.el[data-close]::after {
  content: attr(data-close);
}
.el[data-close] > br.ProseMirror-trailingBreak {
  display: none;
}
img.ProseMirror-separator {
  display: inline;
}
.el[data-mark]::before {
  content: attr(data-mark);
}
.el[data-scene] {
  position: relative;
}
.el[data-scene]::before, .el[data-scene]::after {
  content: attr(data-scene);
  position: absolute;
  top: 0;
  padding-top: inherit;
  text-indent: 0;
}
.el[data-scene]::before {
  right: calc(100% + (var(--el-indent) - var(--el-slack-left) + 2) * var(--geo-cell));
}
.el[data-scene]::after {
  left: calc((var(--geo-column) + 2 - var(--el-indent) + var(--el-slack-left)) * var(--geo-cell));
}
.el[data-speech] {
  position: relative;
}
.el[data-speech]::before {
  content: attr(data-speech);
  position: absolute;
  top: 0;
  padding-top: inherit;
  text-indent: 0;
  right: calc(100% + (var(--el-indent) - var(--el-slack-left) + 2) * var(--geo-cell));
}
.el.dual-r[data-speech]::before {
  right: auto;
  left: calc((var(--geo-column) + 2 - var(--el-indent) + var(--el-slack-left)) * var(--geo-cell));
}
.mn-cast {
  display: block;
  text-indent: 0;
  user-select: none;
}
.mn-cast::before {
  content: attr(data-text);
}
.el.dual-l {
  float: left;
  clear: left;
}
.el.dual-r {
  clear: none;
}
p.el.el-group {
  height: 0;
  padding: 0;
  overflow: visible;
  white-space: nowrap;
  width: calc(12 * var(--geo-cell));
  margin-left: calc(-1 * var(--geo-left));
}
p.el.el-page_break {
  height: 0;
  padding: 0;
  font-size: 0;
  position: relative;
}
p.el.el-page_break::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: calc(var(--geo-column) * var(--geo-cell));
  border-top: 1px dashed var(--page-edge);
}
mn-offfont {
  text-decoration: underline dotted;
}
.mn-mark {
  position: absolute;
}
.mn-mark::before {
  content: attr(data-text);
}
`;

/**
 * Reflow view, after PAGE_CSS: one paper as wide as the desk in place of the sheets, each element at its indent with no
 * width of its own but a dual column's, and each page's start a thin rule labelled in interface type.
 */
export const REFLOW_CSS = `
.mn-reflow .mn-pages {
  width: auto;
  background: var(--page-paper);
}
.mn-reflow .mn-front {
  position: static;
  width: auto;
}
.mn-reflow p.el:not(.dual-l, .dual-r, .el-group) {
  width: auto;
}
.pb.pb-rule {
  width: auto;
  margin: var(--geo-line) calc(-1 * var(--geo-right)) var(--geo-line) calc(-1 * var(--geo-left));
  padding: 2px var(--geo-right) 0 var(--geo-left);
  border-top: var(--page-line) solid var(--page-edge);
  font: var(--type-meta) / 1.5 var(--face-ui);
  color: var(--page-ink-muted);
  text-align: right;
}
.pb-rule::before {
  content: attr(data-label);
}
`;
