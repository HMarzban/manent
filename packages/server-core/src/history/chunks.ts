// The chunks a snapshot is stored as: its blocks cut before each scene heading, and each chunk
// stored deflated under the SHA-256 of its JSON text.
import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { isSceneHeading } from "@manent/revisions";
import type { BlockJSON } from "@manent/schema";
import type { DocFile } from "@manent/storage";

const HASH_HEX = /^[0-9a-f]{64}$/;

/** StorageError("corrupt") by name, as `isStorageError` tells it: this package may import only the storage package's types. */
export function corruptError(cause?: unknown): Error {
  const error = new Error("corrupt", { cause });
  error.name = "StorageError";
  return Object.assign(error, { code: "corrupt" as const });
}

/** The blocks cut before each scene heading; a heading that opens the script makes no empty chunk. */
export function sceneChunks(blocks: readonly BlockJSON[]): BlockJSON[][] {
  const chunks: BlockJSON[][] = [];
  for (const block of blocks) {
    const last = chunks.at(-1);
    if (last === undefined || isSceneHeading(block)) chunks.push([block]);
    else last.push(block);
  }
  return chunks;
}

/** Stores the JSON text of `value` and returns its hash, in lower-case hex. */
export function writeChunk(file: DocFile, value: unknown): string {
  const text = Buffer.from(JSON.stringify(value));
  const hash = createHash("sha256").update(text).digest();
  file.history.putChunk(hash, deflateRawSync(text));
  return hash.toString("hex");
}

/** The bytes deflated as `body`; throws `corruptError` for bytes that are not a deflated stream. */
function inflated(body: Uint8Array): Buffer {
  try {
    return inflateRawSync(body);
  } catch (error) {
    throw corruptError(error);
  }
}

/** The JSON text's value; throws `corruptError` for text that is not JSON. */
function parsed(text: Buffer): unknown {
  try {
    return JSON.parse(text.toString());
  } catch (error) {
    throw corruptError(error);
  }
}

/**
 * The chunk stored under `hash`, through `read`. Throws `corruptError` when it is missing, its
 * hash does not verify, or `read` refuses it.
 */
export function readChunk<T>(
  file: DocFile,
  hash: string,
  read: (value: unknown) => T | null,
): T {
  if (!HASH_HEX.test(hash)) throw corruptError();
  const body = file.history.chunk(Uint8Array.fromHex(hash));
  if (body === null) throw corruptError();
  const text = inflated(body);
  if (createHash("sha256").update(text).digest("hex") !== hash)
    throw corruptError();
  const value = read(parsed(text));
  if (value === null) throw corruptError();
  return value;
}
