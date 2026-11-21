// Who last wrote each block of a version: carried from the version before it, per block.
import { idOf } from "@manent/revisions";
import type { BlockJSON } from "@manent/schema";
import type { VersionAuthor, VersionContent } from "@manent/sync-protocol";

/**
 * The authors of `blocks` (canonical): `previous`'s author for each block whose canonical content
 * it holds unchanged, and `author` for each block it lacks or holds otherwise. A null `author`
 * leaves those blocks out: who wrote them is not known.
 */
export function carryAuthors(
  previous: VersionContent | null,
  blocks: readonly BlockJSON[],
  author: VersionAuthor | null,
): Record<string, VersionAuthor> {
  const before = new Map<string, string>();
  for (const block of previous?.blocks ?? []) {
    const id = idOf(block);
    if (id !== null && !before.has(id)) before.set(id, JSON.stringify(block));
  }
  const known = previous?.authors ?? {};
  // a Map, then own entries: a block id may be "__proto__"
  const authors = new Map<string, VersionAuthor>();
  for (const block of blocks) {
    const id = idOf(block);
    if (id === null || authors.has(id)) continue;
    const unchanged = before.get(id) === JSON.stringify(block);
    if (unchanged && Object.hasOwn(known, id)) authors.set(id, known[id]!);
    if (!unchanged && author !== null) authors.set(id, author);
  }
  return Object.fromEntries(authors);
}
