// The issued files this server draws: the script font read from its package, and the packet written in it.
import { writePacket } from "@manent/formats";
import type { ScriptFontFiles } from "@manent/formats";
import type { FontFaceKey } from "@manent/pagination";
import type { RenderPdf } from "@manent/server-core";

const readFace = (key: FontFaceKey): Promise<Uint8Array> =>
  Bun.file(
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      import.meta.dir,
    ),
  ).bytes();

/** The script font's eight `.woff` faces, as the PDF embeds them. */
export async function readScriptFonts(): Promise<ScriptFontFiles> {
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
    readFace("latin-400-normal"),
    readFace("latin-400-italic"),
    readFace("latin-700-normal"),
    readFace("latin-700-italic"),
    readFace("latin-ext-400-normal"),
    readFace("latin-ext-400-italic"),
    readFace("latin-ext-700-normal"),
    readFace("latin-ext-700-italic"),
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
export function createServerRenderPdf(fonts: ScriptFontFiles): RenderPdf {
  return (input) => writePacket(input, fonts);
}
