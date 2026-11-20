// The script font's files as the PDF embeds them: the eight .woff files, fetched once by their built URLs and
// kept for the tab, so that a later export needs no connection.
import latin400Italic from "@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff";
import latin400Normal from "@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff";
import latin700Italic from "@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff";
import latin700Normal from "@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff";
import latinExt400Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-italic.woff";
import latinExt400Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-normal.woff";
import latinExt700Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-italic.woff";
import latinExt700Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-normal.woff";
import type { ScriptFontFiles } from "@manent/formats";

let loaded: Promise<ScriptFontFiles> | null = null;

async function fetchFaces(
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

/** The fonts, fetched by the first call and kept; a fetch that fails is tried again by the next call. */
export function loadPdfFonts(
  fetchBytes: (url: string) => Promise<Uint8Array>,
): Promise<ScriptFontFiles> {
  loaded ??= fetchFaces(fetchBytes).catch((error: unknown) => {
    loaded = null;
    throw error;
  });
  return loaded;
}
