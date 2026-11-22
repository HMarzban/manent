// The copies the server found of a passage after this person's push, filed under To review with both wordings.
import { isInstant, isRecord, isText } from "../../history/bodies.ts";
import type { PersonSync } from "./create-sync.ts";
import type { PrivateIndex } from "./private-index.ts";
import { readEntry } from "./review-entries.ts";

/** The frame's data as JSON; null for data that is not JSON. */
function readJson(data: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    // a frame that is not JSON files nothing
    return null;
  }
}

/**
 * Files each copy a `copies_kept` frame names for this person as an overlap of the kept block, once per script and
 * copy, so that every tab may file it; `moved` is told each entry written. The returned function stops.
 */
export function createReviewCopies(options: {
  privateIndex: PrivateIndex;
  sync: PersonSync;
  moved: (docId: string) => void;
}): () => void {
  const { privateIndex, sync, moved } = options;
  const { review } = privateIndex;
  return sync.onControl((docId, kind, data) => {
    if (kind !== "copies_kept") return;
    const body = readJson(data);
    if (!isRecord(body) || body.userId !== sync.userId) return;
    const { at, copies } = body;
    if (!isInstant(at) || !Array.isArray(copies)) return;
    for (const copy of copies) {
      if (!isRecord(copy) || !isText(copy.copyId)) continue;
      const id = `copies:${docId}:${copy.copyId}`;
      if (review.get(id) !== null) continue;
      const { blockId, copyId, mine, theirs, otherUserIds } = copy;
      const entry = readEntry({
        kind: "overlap",
        docId,
        blockId,
        mine,
        theirs,
        otherUserIds,
        at,
        settled: false,
        before: null,
        nearBlockId: null,
        copyId,
      });
      if (entry === null) continue;
      review.set(id, entry);
      moved(docId);
    }
  });
}
