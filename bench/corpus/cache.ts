// Documents that are slow to build, kept on disk under the corpus version, so that a changed
// generator never reads a document an older one built.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { CORPUS_VERSION } from "./version.ts";

/** A file-name stem: no directory, and never hidden. */
const KEY = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * The document cached under `key` for this corpus version, else what `build` returns, written to the
 * cache first. The file is `<key>-v<CORPUS_VERSION>.bin` in `dir` and holds the document's
 * encodeState(); a loaded document takes a random client id. RangeError for a key that is not a
 * file-name stem of letters, digits, `.`, `_` and `-`.
 */
export function cached(
  key: string,
  build: () => CrdtDoc,
  dir: string = join(import.meta.dir, "cache"),
): CrdtDoc {
  if (!KEY.test(key))
    throw new RangeError(`a cache key must be a plain file name, not "${key}"`);
  const file = join(dir, `${key}-v${CORPUS_VERSION}.bin`);
  if (existsSync(file)) return loadDoc(readFileSync(file));
  const doc = build();
  mkdirSync(dir, { recursive: true });
  // written whole, then renamed, so that a run stopped mid-write never leaves a partial document
  const partial = `${file}.partial`;
  writeFileSync(partial, doc.encodeState());
  renameSync(partial, file);
  return doc;
}
