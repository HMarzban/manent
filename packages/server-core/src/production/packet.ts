// The issued files drawn by the packet writer, in the script font read from the folder of its faces.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writePacket } from "@manent/formats";
import type { ScriptFontFiles } from "@manent/formats";
import type { FontFaceKey } from "@manent/pagination";
import type { RenderPdf } from "./ports.ts";

/** The script font's eight `.woff` faces, as the PDF embeds them, from `dir`: the `files` folder of `@fontsource/courier-prime`. */
export async function readScriptFonts(dir: string): Promise<ScriptFontFiles> {
  const face = (key: FontFaceKey): Promise<Uint8Array> =>
    readFile(join(dir, `courier-prime-${key}.woff`));
  const [
    latin400Normal,
    latin400Italic,
    latin700Normal,
    latin700Italic,
    latinExt400Normal,
    latinExt400Italic,
    latinExt700Normal,
    latinExt700Italic,
  ] = await Promise.all([
    face("latin-400-normal"),
    face("latin-400-italic"),
    face("latin-700-normal"),
    face("latin-700-italic"),
    face("latin-ext-400-normal"),
    face("latin-ext-400-italic"),
    face("latin-ext-700-normal"),
    face("latin-ext-700-italic"),
  ]);
  return Object.freeze({
    "latin-400-normal": latin400Normal,
    "latin-400-italic": latin400Italic,
    "latin-700-normal": latin700Normal,
    "latin-700-italic": latin700Italic,
    "latin-ext-400-normal": latinExt400Normal,
    "latin-ext-400-italic": latinExt400Italic,
    "latin-ext-700-normal": latinExt700Normal,
    "latin-ext-700-italic": latinExt700Italic,
  });
}

/** Issued files drawn by the packet writer in `fonts`. */
export function createPacketRenderPdf(fonts: ScriptFontFiles): RenderPdf {
  return (input) => writePacket(input, fonts);
}
