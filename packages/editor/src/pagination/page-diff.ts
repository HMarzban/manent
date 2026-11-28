// Pure page-equality comparisons used by pagination decorations to detect unchanged trailing pages.
import type { Pagination } from "@manent/pagination";

/** True when page `a` of `p` lies as page `b` of `old` did, its blocks `shift` later. */
export function isPlacedAsBefore(
  p: Pagination,
  a: number,
  old: Pagination,
  b: number,
  shift: number,
): boolean {
  const x = p.pages[a]!;
  const y = old.pages[b]!;
  const above = p.pages[a - 1];
  const wasAbove = old.pages[b - 1];
  const xr = x.right;
  const yr = y.right;
  const sameRight =
    xr === null
      ? yr === null
      : yr !== null &&
        xr.block === yr.block + shift &&
        xr.line === yr.line &&
        xr.offset === yr.offset;
  return (
    sameRight &&
    Boolean(x.blank) === Boolean(y.blank) &&
    x.block === y.block + shift &&
    x.line === y.line &&
    x.offset === y.offset &&
    x.more === y.more &&
    x.topUnits === y.topUnits &&
    x.usedUnits === y.usedUnits &&
    (above === undefined
      ? wasAbove === undefined
      : wasAbove !== undefined &&
        Boolean(above.blank) === Boolean(wasAbove.blank) &&
        above.usedUnits === wasAbove.usedUnits &&
        above.more === wasAbove.more)
  );
}

/** True when page `a` of `p` draws its break and blocks as page `b` of `old` did, its blocks `shift` later. */
export function isDrawnAsBefore(
  p: Pagination,
  a: number,
  old: Pagination,
  b: number,
  shift: number,
): boolean {
  const x = p.pages[a]!;
  const y = old.pages[b]!;
  return (
    isPlacedAsBefore(p, a, old, b, shift) &&
    x.label === y.label &&
    x.contd === y.contd &&
    x.contdRight === y.contdRight &&
    x.sceneContinued === y.sceneContinued
  );
}

/** How many pages at the end of `p` match the corresponding trailing pages of `old` under `isSame`. */
export function sameAtEnd(
  old: Pagination,
  p: Pagination,
  shift: number,
  isSame: typeof isDrawnAsBefore,
): number {
  const len = Math.min(p.pages.length, old.pages.length);
  let tail = 0;
  while (
    tail < len &&
    isSame(
      p,
      p.pages.length - 1 - tail,
      old,
      old.pages.length - 1 - tail,
      shift,
    )
  )
    tail++;
  return tail;
}
