// Where a window reopens: its saved frame, unless the system would not leave it there.

/** In the system's points; the height includes the title bar. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ideal first-launch studio frame: fits Choose without scrolling, Library + Tour side-by-side, and a full page comfortably. */
export const DEFAULT_FRAME: Frame = Object.freeze({
  x: 0,
  y: 0,
  width: 1440,
  height: 940,
});

/** Minimum comfortable studio floor when clamping to a smaller display's work area. */
export const MIN_FRAME: Readonly<{ width: number; height: number }> =
  Object.freeze({
    width: 960,
    height: 640,
  });

/** Total breathing margin left around the centred first-launch window inside the display's work area. */
export const WORK_AREA_MARGIN = 48;

const fitAxis = (target: number, min: number, available: number): number => {
  if (!Number.isFinite(available) || available <= 0) return target;
  const comfortable = Math.max(
    Math.min(min, available),
    available - WORK_AREA_MARGIN,
  );
  return Math.min(target, Math.floor(comfortable));
};

/**
 * First-launch dimensions fitted to `workArea`: opens at `DEFAULT_FRAME` on spacious displays
 * and shrinks smoothly with breathing margins on compact laptops, never exceeding the display.
 */
export function initialFrame(
  workArea: Pick<Frame, "width" | "height"> | null,
): { width: number; height: number } {
  if (workArea === null) {
    return { width: DEFAULT_FRAME.width, height: DEFAULT_FRAME.height };
  }
  return {
    width: fitAxis(DEFAULT_FRAME.width, MIN_FRAME.width, workArea.width),
    height: fitAxis(DEFAULT_FRAME.height, MIN_FRAME.height, workArea.height),
  };
}

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
