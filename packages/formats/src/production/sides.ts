// Sides PDF: only the locked pages carrying the chosen scenes, with surrounding scenes struck through.
import type { Pagination } from "@manent/pagination";
import { selectSides } from "@manent/revisions";
import type { ScriptFontFiles } from "../pdf/fonts.ts";
import { writePdf } from "../pdf/write.ts";

export interface SidesPdfOptions {
  readonly fonts: ScriptFontFiles;
  /** Heading block ids of the chosen scenes. */
  readonly selectedHeadingIds: ReadonlySet<string>;
  readonly title?: string;
  /** Milliseconds since the epoch, written as the creation and modification dates; 0 when absent. */
  readonly createdAt?: number;
}

/**
 * Writes a clean locked sides PDF: locked page labels preserved, surrounding scenes struck through,
 * no title page and no revision header, marks or paper tint. Throws RangeError when no page holds a chosen scene.
 */
export async function writeSidesPdf(
  pagination: Pagination,
  options: SidesPdfOptions,
): Promise<Uint8Array> {
  const { pages, pagination: struck } = selectSides(
    pagination,
    options.selectedHeadingIds,
  );
  if (pages.length === 0)
    throw new RangeError("sides require at least one page");
  return await writePdf(struck, {
    fonts: options.fonts,
    pages,
    title: options.title,
    createdAt: options.createdAt,
  });
}
