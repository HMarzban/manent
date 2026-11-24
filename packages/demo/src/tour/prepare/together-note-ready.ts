// As Dana, ensures item 5 of 203 Undertow's Network round is open again (4 open).
import { readCommentItems, readCommentThreads } from "@manent/crdt";
import { commentsDocId } from "@manent/sync-protocol";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

const ITEM_5_BODY = "Who is driving the safety boat? Name them.";

export const TOGETHER_NOTE_READY: TourPreparation = {
  id: "together-note-ready",
  async run(driver) {
    if (driver.comments === null)
      throw new SeedDriverError("unavailable", "the server has no comments");
    const { docId } = seedDoc("medium/harbour-lights/203");
    const session = await driver.open("dana", commentsDocId(docId));
    let threadId: string | null = null;
    let resolved = false;
    try {
      const threads = readCommentThreads(session.doc);
      const items = Object.values(readCommentItems(session.doc));
      const starter = items.find((item) => item.body === ITEM_5_BODY);
      if (starter !== undefined) {
        threadId = starter.threadId;
        resolved = threads[threadId]?.state.kind === "resolved";
      }
    } finally {
      await session.close();
    }
    if (threadId !== null && resolved)
      await driver.comments.reopen("dana", docId, threadId);
    return READY;
  },
};
