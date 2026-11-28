// Source Serif 4 faces for Layout Engine 3 book PDFs: lazily fetched once and cached for offline exports.
import latin400Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff";
import latin400Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff";
import latin700Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-700-italic.woff";
import latin700Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff";
import latinExt400Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-italic.woff";
import latinExt400Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-normal.woff";
import latinExt700Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-700-italic.woff";
import latinExt700Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-700-normal.woff";
import type { ScriptFontFiles } from "@manent/formats";

let loaded: Promise<ScriptFontFiles> | null = null;

async function fetchBookFaces(
  fetchBytes: (url: string) => Promise<Uint8Array>,
): Promise<ScriptFontFiles> {
  const [
    latin400NormalBytes,
    latin400ItalicBytes,
    latin700NormalBytes,
    latin700ItalicBytes,
    latinExt400NormalBytes,
    latinExt400ItalicBytes,
    latinExt700NormalBytes,
    latinExt700ItalicBytes,
  ] = await Promise.all([
    fetchBytes(latin400Normal),
    fetchBytes(latin400Italic),
    fetchBytes(latin700Normal),
    fetchBytes(latin700Italic),
    fetchBytes(latinExt400Normal),
    fetchBytes(latinExt400Italic),
    fetchBytes(latinExt700Normal),
    fetchBytes(latinExt700Italic),
  ]);
  return Object.freeze({
    "latin-400-normal": latin400NormalBytes,
    "latin-400-italic": latin400ItalicBytes,
    "latin-700-normal": latin700NormalBytes,
    "latin-700-italic": latin700ItalicBytes,
    "latin-ext-400-normal": latinExt400NormalBytes,
    "latin-ext-400-italic": latinExt400ItalicBytes,
    "latin-ext-700-normal": latinExt700NormalBytes,
    "latin-ext-700-italic": latinExt700ItalicBytes,
  });
}

/** Fetches Source Serif 4 faces once for Engine 3 PDFs; retries on the next call if a fetch rejects. */
export function loadBookPdfFonts(
  fetchBytes: (url: string) => Promise<Uint8Array>,
): Promise<ScriptFontFiles> {
  loaded ??= fetchBookFaces(fetchBytes).catch((err: unknown) => {
    loaded = null;
    throw err;
  });
  return loaded;
}
