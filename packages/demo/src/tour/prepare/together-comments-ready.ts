// As Leo, ensures thread 1 on 204 The Ferry ("you say it twice") is open with only its three seeded items.
import { readCommentItems, readCommentThreads } from "@manent/crdt";
import { commentsDocId } from "@manent/sync-protocol";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY, USED } from "./seeded-doc.ts";

const THREAD_1_BODY = "Love this. Could we watch him get it wrong once first?";
const SEEDED_ITEMS = 3;

export const TOGETHER_COMMENTS_READY: TourPreparation = {
  id: "together-comments-ready",
  async run(driver) {
    if (driver.comments === null)
      throw new SeedDriverError("unavailable", "the server has no comments");
    const { docId } = seedDoc("medium/harbour-lights/204");
    const session = await driver.open("leo", commentsDocId(docId));
    let threadId: string | null = null;
    let resolved = false;
    let itemCount = 0;
    try {
      const threads = readCommentThreads(session.doc);
      const items = Object.values(readCommentItems(session.doc));
      const starter = items.find((item) => item.body === THREAD_1_BODY);
      if (starter !== undefined) {
        threadId = starter.threadId;
        resolved = threads[threadId]?.state.kind === "resolved";
        itemCount = items.filter((item) => item.threadId === threadId).length;
      }
    } finally {
      await session.close();
    }
    if (threadId === null || itemCount > SEEDED_ITEMS) return USED;
    if (resolved) await driver.comments.reopen("leo", docId, threadId);
    return READY;
  },
};
