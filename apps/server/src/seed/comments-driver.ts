// The seed driver's comments: rounds, threads, replies, resolutions and flags over the server's real sync seam.
import {
  flagThread,
  readCommentRounds,
  reopenThread,
  replyToThread,
  resolveThread,
  startRound,
  startThread,
} from "@manent/crdt";
import { SeedDriverError } from "@manent/demo";
import type { SeedComments } from "@manent/demo";
import { commentsDocId, docIdV7 } from "@manent/sync-protocol";
import { pushDoc } from "./driving.ts";
import type { Driving } from "./driving.ts";

const V7_RANDOM_BYTES = 10;

const nextId = (d: Driving): string =>
  docIdV7(d.target.clock.now(), d.bytes(V7_RANDOM_BYTES));

/** Ensures the script's comments document exists on the server, returning its docId. */
async function ensureCommentsDoc(
  d: Driving,
  userId: string,
  scriptDocId: string,
): Promise<string> {
  const place = d.target.storage.directory.placeOf(scriptDocId);
  if (place === null)
    throw new SeedDriverError(
      "unavailable",
      `script ${scriptDocId} is not placed`,
    );
  const docId = commentsDocId(scriptDocId);
  if (d.target.storage.directory.placeOf(docId) === null) {
    await d.call(userId, {
      method: "POST",
      path: "/api/docs",
      body: {
        docId,
        kind: "comments",
        home: `${place.home.kind}:${place.home.id}`,
        scriptDocId,
      },
    });
  }
  return docId;
}

/** Comments driver over `/api/docs`, authority round creation, and WebSocket pushes. */
export function createCommentsDriver(d: Driving): SeedComments {
  const now = (): number => d.target.clock.now();
  return {
    async startRound(userId, scriptDocId, round) {
      const docId = await ensureCommentsDoc(d, userId, scriptDocId);
      const roundId = nextId(d);
      const written = await d.target.sync.authorityWrite(docId, {
        userId,
        origin: "system",
        edit(doc) {
          startRound(
            doc,
            { roundId, name: round.name, versionId: round.versionId },
            now,
          );
          return { ok: true };
        },
        inTransaction() {},
      });
      if (!written.ok)
        throw new SeedDriverError(
          "refused",
          `startRound on ${scriptDocId}: ${written.code === "refused" ? written.reason : written.code}`,
        );
      await d.runDue();
      return { roundId };
    },
    async rounds(userId, scriptDocId) {
      const docId = commentsDocId(scriptDocId);
      if (d.target.storage.directory.placeOf(docId) === null) return [];
      return pushDoc(d, userId, docId, (doc) =>
        Object.entries(readCommentRounds(doc)).map(([roundId, entry]) => ({
          roundId,
          name: entry.name,
          versionId: entry.versionId,
          createdAt: entry.createdAt,
        })),
      );
    },
    async startThread(userId, scriptDocId, thread) {
      const docId = await ensureCommentsDoc(d, userId, scriptDocId);
      const threadId = nextId(d);
      const itemId = nextId(d);
      await pushDoc(d, userId, docId, (doc) => {
        startThread(
          doc,
          {
            threadId,
            itemId,
            anchor: thread.anchor,
            roundId: thread.roundId,
            authorUserId: userId,
            body: thread.body,
            mentionedUserIds: thread.mentionedUserIds ?? [],
          },
          now,
        );
      });
      return { threadId, itemId };
    },
    async reply(userId, scriptDocId, reply) {
      const docId = await ensureCommentsDoc(d, userId, scriptDocId);
      const itemId = nextId(d);
      await pushDoc(d, userId, docId, (doc) => {
        replyToThread(
          doc,
          {
            itemId,
            threadId: reply.threadId,
            authorUserId: userId,
            body: reply.body,
            mentionedUserIds: reply.mentionedUserIds ?? [],
          },
          now,
        );
      });
      return { itemId };
    },
    async resolve(userId, scriptDocId, resolve) {
      const docId = await ensureCommentsDoc(d, userId, scriptDocId);
      await pushDoc(d, userId, docId, (doc) => {
        resolveThread(
          doc,
          {
            threadId: resolve.threadId,
            byUserId: userId,
            outcome: resolve.outcome,
            reason: resolve.reason,
          },
          now,
        );
      });
    },
    async reopen(userId, scriptDocId, threadId) {
      const docId = await ensureCommentsDoc(d, userId, scriptDocId);
      await pushDoc(d, userId, docId, (doc) => {
        reopenThread(doc, threadId);
      });
    },
    async flag(userId, scriptDocId, flag) {
      const docId = await ensureCommentsDoc(d, userId, scriptDocId);
      const flagId = nextId(d);
      await pushDoc(d, userId, docId, (doc) => {
        flagThread(doc, {
          flagId,
          threadId: flag.threadId,
          flaggedUserId: flag.flaggedUserId,
          checkKey: flag.checkKey,
        });
      });
      return { flagId };
    },
  };
}
