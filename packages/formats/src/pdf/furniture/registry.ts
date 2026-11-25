// The PDF's furniture: every entry draws on every page, in this order, one entry per line.
import { headerFooter } from "./header-footer.ts";
import type { PdfFurniture } from "./pdf-furniture.ts";
import { revisionHeader } from "./revision-header.ts";
import { watermark } from "./watermark.ts";

export const PDF_FURNITURE: readonly PdfFurniture[] = Object.freeze([
  revisionHeader,
  watermark,
  headerFooter,
]);
