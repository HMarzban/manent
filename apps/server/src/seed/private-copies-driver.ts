// The seed driver's private copies: create, writing position and hand-in through the server's real routes.
import { ORIGIN_REMOTE, createDoc, jsonMap, mergeUpdates } from "@manent/crdt";
import { SeedDriverError } from "@manent/demo";
import type { SeedPrivateCopies } from "@manent/demo";
import { indexDocId } from "@manent/sync-protocol";
import type { Driving } from "./driving.ts";
import { isFields } from "./link.ts";

/** Ensures `userId`'s private index document exists on the server, returning its docId. */
async function ensurePrivateIndex(d: Driving, userId: string): Promise<string> {
  const docId = indexDocId("user", userId);
  if (d.target.storage.directory.placeOf(docId) === null) {
    await d.call(userId, {
      method: "POST",
      path: "/api/docs",
      body: { docId, kind: "index", home: "user" },
    });
  }
  return docId;
}

/** Private-copies driver over `/api/private/*` and the person's private index `writing` map. */
export function createPrivateCopiesDriver(d: Driving): SeedPrivateCopies {
  return {
    async create(userId, docId) {
      const answer = await d.call(userId, {
        method: "POST",
        path: "/api/private/create",
        body: { docId },
      });
      await d.runDue();
      if (!isFields(answer) || typeof answer.privateDocId !== "string")
        throw new SeedDriverError(
          "unavailable",
          "/api/private/create gave no privateDocId",
        );
      return { privateDocId: answer.privateDocId };
    },
    async setPosition(userId, docId, position) {
      const indexId = await ensurePrivateIndex(d, userId);
      const link = await d.link(userId);
      const doc = createDoc({ clientId: d.clientId() });
      const { state } = await link.subscribe(indexId, doc.clientId);
      try {
        doc.applyUpdate(state, ORIGIN_REMOTE);
        const made: Uint8Array[] = [];
        const stop = doc.subscribe((update) => made.push(update));
        try {
          jsonMap(doc, "writing").set(docId, {
            position,
            at: d.target.clock.now(),
          });
        } finally {
          stop();
        }
        if (made.length > 0) await link.push(indexId, mergeUpdates(made));
      } finally {
        await link.unsubscribe(indexId);
        doc.destroy();
        await d.runDue();
      }
    },
    async handIn(userId, docId) {
      const answer = await d.call(userId, {
        method: "POST",
        path: "/api/private/handin",
        body: { docId, key: d.key() },
      });
      await d.runDue();
      if (
        !isFields(answer) ||
        typeof answer.versionId !== "string" ||
        typeof answer.scenes !== "number" ||
        !Array.isArray(answer.overlaps) ||
        !Array.isArray(answer.setAside)
      )
        throw new SeedDriverError(
          "unavailable",
          "/api/private/handin gave invalid response",
        );
      return {
        versionId: answer.versionId,
        scenes: answer.scenes,
        overlapCount: answer.overlaps.length,
        setAsideCount: answer.setAside.length,
      };
    },
  };
}
