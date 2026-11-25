// The seed driver's writers' material: notes, alternates, cuts and scene assignments over the socket seam.
import {
  CUTS_MAP,
  NOTES_MAP,
  ORIGIN_MATERIAL,
  ORIGIN_REMOTE,
  addAlternate,
  createDoc,
  jsonMap,
  mergeUpdates,
  moveToCuts,
  scriptBody,
  writeSceneProgress,
} from "@manent/crdt";
import type { CrdtDoc, Cut } from "@manent/crdt";
import { SeedDriverError } from "@manent/demo";
import type { SeedWritersMaterial } from "@manent/demo";
import { canonicalBlock } from "@manent/schema";
import type { ScriptNote } from "@manent/schema";
import type { Driving } from "./driving.ts";

/** 12 bytes in base64url yields 16 URL-safe characters matching `isBlockId`. */
const BLOCK_ID_BYTES = 12;

const nextBlockId = (d: Driving): string =>
  Buffer.from(d.bytes(BLOCK_ID_BYTES)).toString("base64url");

/** Subscribes `userId` to `docId`, runs `fn`, pushes its CRDT update, and unsubscribes. */
async function pushScript<T>(
  d: Driving,
  userId: string,
  docId: string,
  fn: (doc: CrdtDoc) => T,
): Promise<T> {
  const link = await d.link(userId);
  const doc = createDoc({ clientId: d.clientId() });
  const { state } = await link.subscribe(docId, doc.clientId);
  try {
    doc.applyUpdate(state, ORIGIN_REMOTE);
    const made: Uint8Array[] = [];
    const stop = doc.subscribe((update) => made.push(update));
    let result: T;
    try {
      result = fn(doc);
    } finally {
      stop();
    }
    if (made.length > 0) await link.push(docId, mergeUpdates(made));
    return result;
  } finally {
    await link.unsubscribe(docId);
    doc.destroy();
    await d.runDue();
  }
}

/** Writers' material driver: pushes Notes, alternates, cuts and scene assignments to scripts. */
export function createWritersMaterialDriver(d: Driving): SeedWritersMaterial {
  const now = (): number => d.target.clock.now();
  const ids = (): string => nextBlockId(d);
  return {
    addNotes(userId, docId, notes) {
      return pushScript(d, userId, docId, (doc) => {
        const map = jsonMap(doc, NOTES_MAP);
        const created: string[] = [];
        for (const input of notes) {
          const noteId = ids();
          const entry: ScriptNote = {
            v: 1,
            anchor: input.anchor,
            text: input.text,
            writerName: input.writerName,
            at: now(),
          };
          map.set(noteId, entry);
          created.push(noteId);
        }
        return created;
      });
    },
    addAlternate(userId, docId, alternate) {
      return pushScript(d, userId, docId, (doc) => {
        const result = addAlternate(doc, {
          blockId: alternate.blockId,
          text: alternate.text,
          authorUserId: userId,
          pitched: alternate.pitched,
          now,
          ids,
        });
        if (!result.ok)
          throw new SeedDriverError(
            "refused",
            `dialogue block ${alternate.blockId} not found in ${docId}`,
          );
        return { alternateId: result.alternateId };
      });
    },
    moveToCuts(userId, docId, blockIds) {
      return pushScript(d, userId, docId, (doc) => {
        const result = moveToCuts(doc, {
          blockIds,
          authorUserId: userId,
          now,
          ids,
        });
        if (!result.ok)
          throw new SeedDriverError(
            "refused",
            `blocks not found for cut in ${docId}`,
          );
        return { cutId: result.cutId };
      });
    },
    addCut(userId, docId, cut) {
      return pushScript(d, userId, docId, (doc) => {
        const cutId = ids();
        const entry: Cut = {
          v: 1,
          blocks: cut.blocks.map((block) => canonicalBlock(block)),
          origin: {
            afterBlockId: cut.afterBlockId,
            sceneHeadingId: cut.sceneHeadingId,
          },
          authorUserId: userId,
          createdAt: now(),
        };
        jsonMap(doc, CUTS_MAP).set(cutId, entry);
        return { cutId };
      });
    },
    async setSceneAssignments(userId, docId, assignments) {
      await pushScript(d, userId, docId, (doc) => {
        const writerUpdates = assignments.filter(
          (entry) => entry.writerUserId !== undefined,
        );
        if (writerUpdates.length > 0) {
          scriptBody(doc).write((writer) => {
            for (const entry of writerUpdates) {
              writer.setBlockAttrs(entry.headingId, {
                writerUserId: entry.writerUserId ?? null,
              });
            }
          }, ORIGIN_MATERIAL);
        }
        for (const entry of assignments) {
          if (entry.progress !== undefined)
            writeSceneProgress(
              doc,
              entry.headingId,
              entry.progress,
              ORIGIN_MATERIAL,
            );
        }
      });
    },
  };
}
