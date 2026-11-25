// Reading a .ink file as strict UTF-8 into ink_line blocks; @manent/formats loads at the first read.
import type { ImportedScript } from "@manent/formats";
import type { IdSource } from "@manent/schema";

export async function readInkFile(
  bytes: Uint8Array,
  ids: IdSource,
): Promise<ImportedScript> {
  const { readInkBytes } = await import("@manent/formats");
  const blocks = readInkBytes(bytes, ids);
  return {
    from: "ink",
    title: null,
    paper: null,
    blocks,
    notes: [],
    production: null,
    kept: [],
    coloursMapped: 0,
    unread: [],
  };
}
