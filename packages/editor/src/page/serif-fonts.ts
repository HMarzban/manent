// Lazy loader for Source Serif 4 `.woff2` faces used only by opt-in Layout Engine 3 Book documents.
import latin400Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff2";
import latin400Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2";
import latin700Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-700-italic.woff2";
import latin700Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2";
import latinExt400Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-italic.woff2";
import latinExt400Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-normal.woff2";
import latinExt700Italic from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-700-italic.woff2";
import latinExt700Normal from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-700-normal.woff2";
import { FONT_FACE_KEYS, serifRanges } from "@manent/pagination";
import type { FontFaceKey } from "@manent/pagination";
import { toUnicodeRange } from "./fonts.ts";
import type { FontSet, LoadableFace } from "./fonts.ts";

const SERIF_URLS: Readonly<Record<FontFaceKey, string>> = Object.freeze({
  "latin-400-normal": latin400Normal,
  "latin-400-italic": latin400Italic,
  "latin-700-normal": latin700Normal,
  "latin-700-italic": latin700Italic,
  "latin-ext-400-normal": latinExt400Normal,
  "latin-ext-400-italic": latinExt400Italic,
  "latin-ext-700-normal": latinExt700Normal,
  "latin-ext-700-italic": latinExt700Italic,
});

const loadedSets = new WeakSet<FontSet>();

/** Registers and loads Source Serif 4 faces once per `FontSet` when a Layout Engine 3 book opens. Never rejects. */
export async function loadBookSerifFonts(
  fonts: FontSet | undefined,
): Promise<void> {
  if (fonts === undefined || loadedSets.has(fonts)) return;
  if (typeof FontFace !== "function") return;
  loadedSets.add(fonts);
  const latinRange = toUnicodeRange(serifRanges("latin"));
  const extRange = toUnicodeRange(serifRanges("latin-ext"));
  const loads: Promise<unknown>[] = [];
  for (const key of FONT_FACE_KEYS) {
    const face = new FontFace("Source Serif 4", `url(${SERIF_URLS[key]})`, {
      weight: key.includes("-700-") ? "700" : "400",
      style: key.endsWith("-italic") ? "italic" : "normal",
      unicodeRange: key.startsWith("latin-ext-") ? extRange : latinRange,
      display: "swap",
    });
    fonts.add(face as unknown as LoadableFace);
    if (!key.startsWith("latin-ext-")) {
      loads.push(face.load().catch(() => undefined));
    }
  }
  await Promise.all(loads);
}
