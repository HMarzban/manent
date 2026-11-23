// The PDF's furniture: every entry draws on every page, in this order, one entry per line.
import type { PdfFurniture } from "./pdf-furniture.ts";
import { revisionHeader } from "./revision-header.ts";

export const PDF_FURNITURE: readonly PdfFurniture[] = Object.freeze([
  revisionHeader,
]);
