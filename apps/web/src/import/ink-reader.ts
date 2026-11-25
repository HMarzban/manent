import type { ImportedScript } from "@manent/formats";
import type { IdSource } from "@manent/schema";

export async function readInkFile(
  _bytes: Uint8Array,
  _ids: IdSource,
): Promise<ImportedScript> {
  const { FormatError } = await import("@manent/formats");
  throw new FormatError("unsupported", "ink import is not available yet");
}
