// Central-authority ProseMirror collab replay of plain-text editing traces and offline divergence rebasing.
import { createRng, seededIdSource } from "@manent/demo";
import { schema } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import {
  collab,
  getVersion,
  receiveTransaction,
  sendableSteps,
} from "prosemirror-collab";
import { Fragment, Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { Step } from "prosemirror-transform";
import type { Trace } from "../../corpus/traces.ts";

export interface AuthorityLog {
  version: number;
  steps: Step[];
  clientIDs: (string | number)[];
}

export interface AuthorityReplay {
  readonly clientA: EditorState;
  readonly clientB: EditorState;
  readonly authority: AuthorityLog;
  readonly logBytes: number;
}

export interface OfflineDivergence {
  readonly unconfirmedBefore: number;
  readonly unconfirmedAfter: number;
  readonly dropped: number;
}

const CLIENT_A = "client-a";
const CLIENT_B = "client-b";
const BLOCK_TYPE = "action";

function blockNode(text: string, id: string | null): Node {
  const attrs = id === null ? { type: BLOCK_TYPE } : { id, type: BLOCK_TYPE };
  return schema.nodes.block.create(
    attrs,
    text === "" ? null : schema.text(text),
  );
}

/** Builds a single-section script ProseMirror doc with one `action` block per line. */
export function docFromLines(lines: readonly string[], newId: IdSource): Node {
  const blocks = lines.map((line) => blockNode(line, newId()));
  return schema.nodes.doc.create(null, [
    schema.nodes.section.create(null, blocks),
  ]);
}

/** Plain text of a single-section doc, joining block texts with newlines. */
export function plainTextOf(doc: Node): string {
  const lines: string[] = [];
  doc.forEach((section) => {
    section.forEach((block) => {
      lines.push(block.textContent);
    });
  });
  return lines.join("\n");
}

function locate(
  lineLengths: readonly number[],
  at: number,
): { index: number; offset: number } {
  let left = at;
  for (let index = 0; index < lineLengths.length; index++) {
    const len = lineLengths[index]!;
    if (left <= len) return { index, offset: left };
    left -= len + 1;
  }
  throw new RangeError(`patch offset ${at} lies past the end of the text`);
}

/**
 * Applies one plain-text trace patch `[at, deleted, inserted]` as a single ProseMirror transaction,
 * keeping `lineLengths` synchronized so ProseMirror positions resolve in one scan (`at + 2 + lineIndex`).
 */
export function applyTracePatch(
  state: EditorState,
  lineLengths: number[],
  patch: readonly [number, number, string],
  newId: IdSource,
): EditorState {
  const [at, deleted, inserted] = patch;
  const start = locate(lineLengths, at);
  const pmFrom = at + 2 + start.index;
  const tr = state.tr;

  if (deleted > 0) {
    const end = locate(lineLengths, at + deleted);
    const pmTo = at + deleted + 2 + end.index;
    tr.delete(pmFrom, pmTo);
    const mergedLen = start.offset + (lineLengths[end.index]! - end.offset);
    lineLengths.splice(start.index, end.index - start.index + 1, mergedLen);
  }

  if (inserted !== "") {
    const parts = inserted.split("\n");
    if (parts.length === 1) {
      tr.insertText(inserted, pmFrom);
      lineLengths[start.index] = lineLengths[start.index]! + inserted.length;
    } else {
      const nodes = parts.map((part, i) =>
        blockNode(part, i === 0 ? null : newId()),
      );
      tr.replace(pmFrom, pmFrom, new Slice(Fragment.from(nodes), 1, 1));
      const tailLen = lineLengths[start.index]! - start.offset;
      const addedLens = parts
        .slice(1)
        .map((part, i) =>
          i === parts.length - 2 ? part.length + tailLen : part.length,
        );
      lineLengths[start.index] = start.offset + parts[0]!.length;
      lineLengths.splice(start.index + 1, 0, ...addedLens);
    }
  }

  return tr.docChanged ? state.apply(tr) : state;
}

function createClient(doc: Node, clientID: string): EditorState {
  return EditorState.create({
    schema,
    doc,
    plugins: [collab({ version: 0, clientID })],
  });
}

function acceptFromClient(
  authority: AuthorityLog,
  sender: EditorState,
): {
  sender: EditorState;
  steps: readonly Step[];
  clientIDs: readonly (string | number)[];
} {
  const sendable = sendableSteps(sender);
  if (sendable === null) return { sender, steps: [], clientIDs: [] };
  if (sendable.version !== authority.version)
    throw new Error(
      `authority version mismatch: client at ${sendable.version}, authority at ${authority.version}`,
    );
  const clientIDs = sendable.steps.map(() => sendable.clientID);
  authority.steps.push(...sendable.steps);
  authority.clientIDs.push(...clientIDs);
  authority.version += sendable.steps.length;
  const confirmed = sender.apply(
    receiveTransaction(sender, sendable.steps, clientIDs),
  );
  return { sender: confirmed, steps: sendable.steps, clientIDs };
}

/** Replays `trace` on Client A through a central authority and delivers every committed step to Client B. */
export function replayThroughAuthority(trace: Trace): AuthorityReplay {
  const newId = seededIdSource(createRng(1));
  const initialLines = trace.startContent.split("\n");
  const lineLengths = initialLines.map((line) => line.length);
  const initialDoc = docFromLines(initialLines, newId);
  const authority: AuthorityLog = { version: 0, steps: [], clientIDs: [] };
  let clientA = createClient(initialDoc, CLIENT_A);
  let clientB = createClient(initialDoc, CLIENT_B);

  for (const patch of trace.patches) {
    clientA = applyTracePatch(clientA, lineLengths, patch, newId);
    const committed = acceptFromClient(authority, clientA);
    clientA = committed.sender;
    if (committed.steps.length > 0) {
      clientB = clientB.apply(
        receiveTransaction(clientB, committed.steps, committed.clientIDs),
      );
    }
  }

  const logBytes = Buffer.byteLength(
    JSON.stringify(authority.steps.map((step) => step.toJSON())),
  );
  return { clientA, clientB, authority, logBytes };
}

/**
 * Replays up to the midpoint in sync, then stops syncing Client B while B replays the second half locally
 * and Client A replays the second half shifted by one line onto the authority; on rejoin, rebases B's
 * unconfirmed steps through `prosemirror-collab`'s `receiveTransaction` (`rebaseSteps`) and counts dropped steps.
 */
export function measureOfflineDivergence(trace: Trace): OfflineDivergence {
  const midpoint = Math.floor(trace.patches.length / 2);
  if (trace.patches.length - midpoint === 0)
    return { unconfirmedBefore: 0, unconfirmedAfter: 0, dropped: 0 };

  const idA = seededIdSource(createRng(1));
  const idB = seededIdSource(createRng(2));
  const initialLines = trace.startContent.split("\n");
  const lineLengths = initialLines.map((line) => line.length);
  const initialDoc = docFromLines(initialLines, idA);
  const authority: AuthorityLog = { version: 0, steps: [], clientIDs: [] };
  let clientA = createClient(initialDoc, CLIENT_A);
  let clientB = createClient(initialDoc, CLIENT_B);

  for (let i = 0; i < midpoint; i++) {
    clientA = applyTracePatch(clientA, lineLengths, trace.patches[i]!, idA);
    const committed = acceptFromClient(authority, clientA);
    clientA = committed.sender;
    if (committed.steps.length > 0) {
      clientB = clientB.apply(
        receiveTransaction(clientB, committed.steps, committed.clientIDs),
      );
    }
  }

  const aLengths = [...lineLengths];
  const bLengths = [...lineLengths];
  const authorityStart = authority.steps.length;

  // Shift Client A down by one line so the second half replays shifted by one line onto the authority.
  clientA = applyTracePatch(clientA, aLengths, [0, 0, "\n"], idA);
  clientA = acceptFromClient(authority, clientA).sender;

  for (let i = midpoint; i < trace.patches.length; i++) {
    const [at, deleted, inserted] = trace.patches[i]!;
    clientB = applyTracePatch(clientB, bLengths, [at, deleted, inserted], idB);
    clientA = applyTracePatch(
      clientA,
      aLengths,
      [at + 1, deleted, inserted],
      idA,
    );
    clientA = acceptFromClient(authority, clientA).sender;
  }

  const unconfirmedBefore = sendableSteps(clientB)?.steps.length ?? 0;
  const newSteps = authority.steps.slice(authorityStart);
  const newClientIDs = authority.clientIDs.slice(authorityStart);
  if (getVersion(clientB) !== authorityStart)
    throw new Error("offline client version drifted before rejoin");
  clientB = clientB.apply(receiveTransaction(clientB, newSteps, newClientIDs));
  const unconfirmedAfter = sendableSteps(clientB)?.steps.length ?? 0;
  return {
    unconfirmedBefore,
    unconfirmedAfter,
    dropped: Math.max(0, unconfirmedBefore - unconfirmedAfter),
  };
}
