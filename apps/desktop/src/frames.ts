// Where a window reopens: its saved frame, unless the system would not leave it there.

/** In the system's points; the height includes the title bar. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Its `x` and `y` are ignored: the shell centres this frame. */
export const DEFAULT_FRAME: Frame = Object.freeze({
  x: 0,
  y: 0,
  width: 1280,
  height: 800,
});

/**
 * The saved frame, when `readBack` (set it, then read it back) leaves it unchanged; null when
 * nothing is saved or the system moved it, as it does with a frame off every display.
 */
export function frameToRestore(
  saved: Frame | null,
  readBack: (frame: Frame) => Frame,
): Frame | null {
  if (saved === null) return null;
  const placed = readBack(saved);
  const kept =
    placed.x === saved.x &&
    placed.y === saved.y &&
    placed.width === saved.width &&
    placed.height === saved.height;
  return kept ? saved : null;
}
