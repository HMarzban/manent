// The issued files this server draws, in the script font read from its package.
import { dirname, join } from "node:path";
import { createPacketRenderPdf, readScriptFonts } from "@manent/server-core";
import type { RenderPdf } from "@manent/server-core";

/** Issued files drawn in the script font, found beside this server: in the workspace, or where the bundled server's lookup finds it. */
export async function readServerRenderPdf(): Promise<RenderPdf> {
  const font = Bun.resolveSync(
    "@fontsource/courier-prime/package.json",
    import.meta.dir,
  );
  return createPacketRenderPdf(
    await readScriptFonts(join(dirname(font), "files")),
  );
}
