// How the open panels share a window with the page: beside it, one at a time, or over it.

/**
 * `pagePx` is the sheet at 100 % zoom with its desk padding; a panel's width is null while it is closed. "both": every
 * open panel fits beside the page; "one": one does, so opening one panel closes the other; "overlay": not even one
 * does, so the panel is drawn over the page and closes when the person clicks or types in the page or focus returns
 * to it.
 */
export function fitPanels(options: {
  frameWidthPx: number;
  pagePx: number;
  leftPx: number | null;
  sidePx: number | null;
}): "both" | "one" | "overlay" {
  const { frameWidthPx, pagePx } = options;
  const open = [options.leftPx, options.sidePx].filter(
    (widthPx) => widthPx !== null,
  );
  const besides = open.reduce((sum, widthPx) => sum + widthPx, 0);
  if (pagePx + besides <= frameWidthPx) return "both";
  if (pagePx + Math.max(...open) <= frameWidthPx) return "one";
  return "overlay";
}
