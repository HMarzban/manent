export const BROWSER_ENGINES = ["chromium", "firefox", "webkit"] as const;
export type BrowserEngine = (typeof BROWSER_ENGINES)[number];
/** Page view draws the sheets; Reflow view wraps the text to the window, each page's start a thin labelled rule. */
export const LAYOUT_VIEWS = ["page", "reflow"] as const;
export type LayoutView = (typeof LAYOUT_VIEWS)[number];
export const BREAK_STYLES = ["inline", "before_block"] as const;
export type BreakStyle = (typeof BREAK_STYLES)[number];
/**
 * Whether sections are given `content-visibility: auto`, per browser engine; off keeps the section and drops the rule.
 * Off in every engine: Chromium moved the caret differently from a flat page, and every engine sizes a section it
 * skips at the height it last drew it at, not at its intrinsic size, so others typing in a section scrolled past moved
 * the line being read.
 */
export const CONTAINMENT: Readonly<Record<BrowserEngine, boolean>> = {
  chromium: false,
  firefox: false,
  webkit: false,
};
/** How a page break inside a block is drawn, per browser engine: at its offset, or before the whole block (the engine keeps the split either way). */
export const MID_BLOCK_BREAKS: Readonly<Record<BrowserEngine, BreakStyle>> = {
  chromium: "inline",
  firefox: "inline",
  webkit: "inline",
};
/** The most blocks an edit left behind that one idle pass draws. */
export const BEHIND_BLOCKS_PER_PASS = 500;
/** Sections kept rendered on each side of the one holding the selection. */
export const KEEP_NEIGHBOURS = 1;
/** Spellcheck is off in a script with more blocks than this. */
export const SPELLCHECK_MAX_BLOCKS = 7_500;
/** The drift monitor: whether it runs, the idle time before a pass, the most blocks it keeps a forced line start in, the most blocks one pass checks. */
export const DRIFT = {
  enabled: true,
  idleMs: 200,
  maxForcedBlocks: 500,
  maxBlocksPerPass: 400,
} as const;
/** Sheets drawn beyond the pages in view, on each side. */
export const SHEET_NEIGHBOURS = 1;
/** The desk shown between two sheets. */
export const PAGE_GAP_PX = 24;
/** How long the page waits for the script font before it is drawn without it. */
export const FONT_WAIT_MS = 3_000;
/** Zoom limits, in percent. */
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 300;
