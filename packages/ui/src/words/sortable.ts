// What a screen reader hears while an item of a sortable list is picked up, moved and dropped.

import { formatPosition } from "./format.ts";

export const SORTABLE_WORDS = {
  /** Read when an item takes focus. */
  instructions:
    "To pick up an item, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, and Esc to put it back.",
  /** Positions count from 1. */
  pickedUp: (label: string, position: number, count: number): string =>
    `Picked up ${label}, at position ${formatPosition(position, count)}.`,
  moved: (label: string, position: number, count: number): string =>
    `Moved ${label} to position ${formatPosition(position, count)}.`,
  dropped: (label: string, position: number, count: number): string =>
    `Dropped ${label} at position ${formatPosition(position, count)}.`,
  cancelled: (label: string, position: number, count: number): string =>
    `Put ${label} back at position ${formatPosition(position, count)}.`,
} as const;
