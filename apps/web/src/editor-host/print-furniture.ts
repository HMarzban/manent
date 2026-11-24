// Draws `PAGE_FURNITURE` onto browser-printed sheets and lists the engine line kinds they replace.
import { PAGE_FURNITURE } from "@manent/editor";
import type { PageFurnitureInput } from "@manent/editor";
import type { LineKind } from "@manent/pagination";

export const PRINT_REPLACED_KINDS: ReadonlySet<LineKind> = new Set(
  PAGE_FURNITURE.flatMap((entry) => entry.replaces),
);

export function drawPrintFurniture(
  sheet: HTMLElement,
  input: PageFurnitureInput,
): void {
  for (const entry of PAGE_FURNITURE) entry.draw(sheet, input);
}
