// The issued files this server draws, in the script font's faces, which the bundler copies beside the
// server and a compiled binary carries inside it.
import latin400Italic from "@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff";
import latin400Normal from "@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff";
import latin700Italic from "@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff";
import latin700Normal from "@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff";
import latinExt400Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-italic.woff";
import latinExt400Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-normal.woff";
import latinExt700Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-italic.woff";
import latinExt700Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-normal.woff";
import { resolve } from "node:path";
import type { FontFaceKey } from "@manent/pagination";
import { createPacketRenderPdf, readScriptFonts } from "@manent/server-core";
import type { RenderPdf } from "@manent/server-core";

const FACES: Readonly<Record<FontFaceKey, string>> = Object.freeze({
  "latin-400-normal": latin400Normal,
  "latin-400-italic": latin400Italic,
  "latin-700-normal": latin700Normal,
  "latin-700-italic": latin700Italic,
  "latin-ext-400-normal": latinExt400Normal,
  "latin-ext-400-italic": latinExt400Italic,
  "latin-ext-700-normal": latinExt700Normal,
  "latin-ext-700-italic": latinExt700Italic,
});

export async function readServerRenderPdf(): Promise<RenderPdf> {
  // a bundle names each face relative to itself, not to the directory the server was started in
  return createPacketRenderPdf(
    await readScriptFonts((key) => resolve(import.meta.dir, FACES[key])),
  );
}
