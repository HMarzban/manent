// Full-page PDF cover renderer for print and ebook proof exports.
import type { PageGeometry } from "@manent/pagination";
import type { PdfAsset } from "./graphics.ts";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Draws a dedicated full-page cover image before front matter, centred cleanly within the page trim. */
export function drawCoverPage(
  doc: PDFKit.PDFDocument,
  geometry: PageGeometry,
  cover: PdfAsset,
): void {
  doc.addPage({ size: [geometry.widthPt, geometry.heightPt], margin: 0 });
  doc.save();
  doc.image(toArrayBuffer(cover.bytes), 0, 0, {
    fit: [geometry.widthPt, geometry.heightPt],
    align: "center",
    valign: "center",
  });
  doc.restore();
}
