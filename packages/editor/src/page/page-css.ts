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
.mn-zoom:not(.mn-reflow) {
  position: relative;
}
.mn-zoom:not(.mn-reflow) > .mn-pages {
  position: absolute;
  left: 0;
}
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
.mn-sheet[data-side="verso"] {
  left: var(--geo-mirror-delta, 0pt);
}
.mn-page-view {
  font: var(--geo-font-size, 12pt)/var(--geo-line, 12pt) "Courier Prime", monospace;
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
.mn-pages[data-typography="book_serif"] .mn-page-view {
  font-family: "Source Serif 4", Georgia, serif;
  font-feature-settings: "kern" 0, "liga" 0, "clig" 0, "dlig" 0, "calt" 0;
}
.mn-pages[data-typography="book_serif"] p.el,
.mn-pages[data-typography="book_serif"] del.el {
  margin-left: calc(var(--el-indent) * var(--geo-cell));
  width: calc(var(--el-width) * var(--geo-cell));
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
del.el {
  display: block;
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
p.el.el-body[data-first-line="flush"],
p.el.el-body[data-first-line="drop_cap"],
p.el.el-body[data-first-line="raised_cap"] {
  text-indent: 0;
}
p.el.el-body[data-first-line="drop_cap"] {
  min-height: calc(2 * var(--el-spacing) * var(--geo-line));
}
p.el.el-body[data-first-line="drop_cap"]::first-letter {
  float: left;
  font-size: calc((var(--el-spacing) + 1) * 1em);
  line-height: 0.9;
  padding-inline-end: var(--geo-cell);
  margin-top: 0.08em;
  font-weight: 700;
}
p.el.el-body[data-first-line="raised_cap"]::first-letter {
  font-size: 2em;
  line-height: 0;
  font-weight: 700;
}
.mn-page-view sup,
.mn-page-view sub {
  font-size: 0.72em;
  letter-spacing: calc(0.28 * var(--geo-cell));
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}
.mn-page-view sup {
  top: -0.45em;
}
.mn-page-view sub {
  bottom: -0.2em;
}
.pb {
  display: block;
  clear: both;
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
  height: max(0px, calc(max(0, var(--fill)) * var(--geo-unit) - var(--fill-trim, 0px)));
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
.el[data-scene][data-scene-sides="left"]::after {
  content: none;
}
.el[data-scene][data-scene-sides="right"]::before {
  content: none;
}
.el[data-scene][data-scene-sides="none"]::before,
.el[data-scene][data-scene-sides="none"]::after {
  content: none;
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
p.el.el-hidden, .mn-omitted-orig, p.el[data-omitted] > br.ProseMirror-trailingBreak {
  display: none;
}
.mn-omitted {
  user-select: none;
}
mn-offfont {
  text-decoration: underline dotted;
}
.caps {
  text-transform: uppercase;
}
.el-subheading {
  font-weight: 700;
}
.el-epigraph {
  font-style: italic;
}
.mn-footnote {
  text-decoration: underline dotted var(--focus);
  text-underline-offset: 2px;
}
.mn-fn-ref {
  display: inline-block;
  width: 0;
  height: 0;
  line-height: 0;
  overflow: visible;
  position: relative;
  vertical-align: baseline;
  user-select: none;
}
.mn-fn-ref::after {
  content: attr(data-n);
  position: absolute;
  top: -0.7em;
  left: 0.06em;
  font-size: 0.65em;
  line-height: 1;
  font-weight: 700;
  color: var(--focus);
  pointer-events: none;
}
.mn-mark {
  position: absolute;
}
.mn-mark::before {
  content: attr(data-text);
}
.mn-pages[data-hide-page_number] .pb-head[data-text]::before,
.mn-pages[data-hide-scene_continued_foot] .pb-foot[data-text]::before,
.mn-pages[data-hide-scene_continued] .pb-continued[data-text]::before,
.mn-pages[data-hide-more] .pb-more[data-text]::before,
.mn-pages[data-hide-contd] .pb-contd[data-text]::before,
.mn-pages[data-hide-scene_number] .el[data-scene]::before,
.mn-pages[data-hide-scene_number] .el[data-scene]::after,
.mn-pages[data-hide-speech_number] .el[data-speech]::before {
  content: none;
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
.mn-reflow del.el {
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
