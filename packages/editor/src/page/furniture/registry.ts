// The sheets' furniture: every entry draws on every sheet in view, in this order, one entry per line.
import type { PageFurniture } from "./page-furniture.ts";
import { revisionHeader } from "./revision-header.ts";
import { watermark } from "./watermark.ts";

export const PAGE_FURNITURE: readonly PageFurniture[] = Object.freeze([
  revisionHeader,
  watermark,
]);
