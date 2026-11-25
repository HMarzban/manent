// The viewer path: the script as blocks and patches by block id, never a CRDT document.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  loadDoc,
  readRundown,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Storage } from "@manent/storage";
import type { Message } from "@manent/sync-protocol";
import {
  encodeRundownView,
  rundownViewPatch,
  rundownViewSnapshot,
} from "../view/rundown-view.ts";
import { encodeView, viewPatch, viewSnapshot } from "../view/view.ts";
import type { ViewSnapshot } from "../view/view.ts";
import type { Room } from "./rooms.ts";
import type { Committed } from "./write-path-ports.ts";

/**
 * How many documents keep their latest cached snapshot answer: 512 so every document of
 * W5's six rundowns of 80 stories (486) keeps its latest answer.
 */
const CACHED_ANSWERS = 512;

interface CachedAnswer {
  generation: number;
  headSeq: number;
  answer: Message;
}

/** The document the log holds, read without quarantining anything: a corrupt row is skipped. */
function readDoc(storage: Storage, room: Room): { doc: CrdtDoc; seq: number } {
  const { log, checkpoints } = storage.open(room.home);
  const { generation } = room.row;
  const checkpoint = checkpoints.newest(room.docId, generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  try {
    const from = checkpoint?.seq ?? 0;
    const { rows } = log.tail(room.docId, generation, from, {
      quarantine: false,
    });
    for (const { update } of rows) doc.applyUpdate(update, ORIGIN_LOAD);
    discardPending(doc);
    return { doc, seq: rows.at(-1)?.seq ?? from };
  } catch (error) {
    doc.destroy();
    throw error;
  }
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
  try {
    return {
      snapshot: viewSnapshot(scriptBody(doc).materialize()),
      viewSeq: seq,
    };
  } finally {
    doc.destroy();
  }
}

/** The rundown snapshot bytes and server sequence for a rundown room without loading an unloaded room. */
function materializeRundownContent(
  storage: Storage,
  room: Room,
): { content: Uint8Array; viewSeq: number } {
  if (room.doc !== null)
    return {
      content: encodeRundownView(rundownViewSnapshot(readRundown(room.doc))),
      viewSeq: room.row.headSeq,
    };
  const { doc, seq } = readDoc(storage, room);
  try {
    return {
      content: encodeRundownView(rundownViewSnapshot(readRundown(doc))),
      viewSeq: seq,
    };
  } finally {
    doc.destroy();
  }
}

/**
 * A viewer's VIEW_SNAPSHOT for a room; each document keeps its latest answer while its head stays
 * where it was, bounded to CACHED_ANSWERS documents by least-recent use.
 */
export function createSnapshotAnswers(
  storage: Storage,
): (room: Room) => Message {
  const answers = new Map<string, CachedAnswer>();
  return (room) => {
    const { docId } = room;
    const { generation, headSeq } = room.row;
    const cached = answers.get(docId);
    if (
      cached !== undefined &&
      cached.generation === generation &&
      cached.headSeq === headSeq
    ) {
      answers.delete(docId);
      answers.set(docId, cached);
      return cached.answer;
    }
    const answer: Message =
      room.kind === "rundown"
        ? {
            type: "VIEW_SNAPSHOT",
            docId,
            generation,
            ...materializeRundownContent(storage, room),
          }
        : (() => {
            const { snapshot, viewSeq } = materializeForView(storage, room);
            return {
              type: "VIEW_SNAPSHOT",
              docId,
              generation,
              viewSeq,
              content: encodeView(snapshot),
            };
          })();
    answers.delete(docId);
    answers.set(docId, { generation, headSeq, answer });
    if (answers.size > CACHED_ANSWERS) {
      const oldest = answers.keys().next().value;
      if (oldest !== undefined) answers.delete(oldest);
    }
    return answer;
  };
}

/** The VIEW_PATCH for a committed push or authority write; null when nothing a viewer sees changed. */
export function viewPatchOf(committed: Committed): Message | null {
  const { room, seq, update, report } = committed;
  if (room.kind === "rundown") {
    if (room.doc === null) return null;
    const patch = rundownViewPatch(room.doc, update);
    if (patch === null) return null;
    return {
      type: "VIEW_PATCH",
      docId: room.docId,
      generation: room.row.generation,
      viewSeq: seq,
      patch: encodeRundownView(patch),
    };
  }
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
