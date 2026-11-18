// The script font as the PDF embeds it.
import type { FontFaceKey } from "@manent/pagination";

/** The script font's `.woff` file for each face; pdfkit cannot embed the `.woff2` files. */
export type ScriptFontFiles = Readonly<Record<FontFaceKey, Uint8Array>>;
