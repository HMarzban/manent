// The viewer path: the script as blocks and patches by block id, never a CRDT document.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  loadDoc,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Storage } from "@manent/storage";
import type { Message } from "@manent/sync-protocol";
import { encodeView, viewPatch, viewSnapshot } from "../view/view.ts";
import type { ViewSnapshot } from "../view/view.ts";
import type { Room } from "./rooms.ts";
import type { Committed } from "./write-path-ports.ts";

/** How many snapshot answers are kept, by document and head sequence. */
const CACHED_ANSWERS = 16;

/** The document the log holds, read without quarantining anything: a corrupt row is skipped. */
function readDoc(storage: Storage, room: Room): { doc: CrdtDoc; seq: number } {
  const { log, checkpoints } = storage.open(room.home);
  const { generation } = room.row;
  const checkpoint = checkpoints.newest(room.docId, generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const from = checkpoint?.seq ?? 0;
  const { rows } = log.tail(room.docId, generation, from, {
    quarantine: false,
  });
  for (const { update } of rows) doc.applyUpdate(update, ORIGIN_LOAD);
  discardPending(doc);
  return { doc, seq: rows.at(-1)?.seq ?? from };
}

/**
 * The script body as a viewer sees it, and the server sequence it reflects: from the live document
 * when the room is loaded, otherwise from the checkpoint and the tail, in a document kept by nobody.
 */
export function materializeForView(
  storage: Storage,
  room: Room,
): { snapshot: ViewSnapshot; viewSeq: number } {
  if (room.doc !== null)
    return {
      snapshot: viewSnapshot(scriptBody(room.doc).materialize()),
      viewSeq: room.row.headSeq,
    };
  const { doc, seq } = readDoc(storage, room);
  const snapshot = viewSnapshot(scriptBody(doc).materialize());
  doc.destroy();
  return { snapshot, viewSeq: seq };
}

/** A viewer's VIEW_SNAPSHOT for a room; the last answers are reused while the head stays where it was. */
export function createSnapshotAnswers(
  storage: Storage,
): (room: Room) => Message {
  const answers = new Map<string, Message>();
  return (room) => {
    const key = `${room.docId}:${room.row.generation}:${room.row.headSeq}`;
    const cached = answers.get(key);
    if (cached !== undefined) return cached;
    const { snapshot, viewSeq } = materializeForView(storage, room);
    const answer: Message = {
      type: "VIEW_SNAPSHOT",
      docId: room.docId,
      generation: room.row.generation,
      viewSeq,
      content: encodeView(snapshot),
    };
    answers.set(key, answer);
    const oldest = answers.keys().next().value;
    if (answers.size > CACHED_ANSWERS && oldest !== undefined)
      answers.delete(oldest);
    return answer;
  };
}

/** The VIEW_PATCH for a committed push; null when nothing a viewer sees changed, or for a setting. */
export function viewPatchOf(committed: Committed): Message | null {
  const { room, seq, report } = committed;
  if (report === null) return null;
  const { inserted, changed, removed } = report;
  const patch = viewPatch({ inserted, changed, removed });
  if (patch === null) return null;
  return {
    type: "VIEW_PATCH",
    docId: room.docId,
    generation: room.row.generation,
    viewSeq: seq,
    patch: encodeView(patch),
  };
}
