// A script's comments document: the entries of its four maps, one reader per map and one writer per act.
import { isTextAnchor } from "@manent/schema";
import type { TextAnchor } from "@manent/schema";
import { yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import { jsonMap } from "../json-map.ts";
import type { CommentsMap } from "./push.ts";

export { readCommentsPush } from "./push.ts";
export type { CommentsWrite } from "./push.ts";

/** The origin of every write to a comments document. No undo history is kept for it. */
export const ORIGIN_COMMENTS = "comments";

const COMMENT_OUTCOMES = Object.freeze(["addressed", "declined"] as const);

/** What resolving a comment in a round records. */
export type CommentOutcome = (typeof COMMENT_OUTCOMES)[number];

/** Resolved by `byUserId` at `at`, milliseconds since the epoch; `outcome` and `reason` are null outside a round. */
export type ThreadState =
  | { kind: "open" }
  | {
      kind: "resolved";
      byUserId: string;
      at: number;
      outcome: CommentOutcome | null;
      reason: string | null;
    };

/**
 * A comment's thread. A null anchor is the whole script; an empty range on a scene heading is the scene. Its first
 * item is its comment.
 */
export interface CommentThread {
  v: 1;
  anchor: TextAnchor | null;
  roundId: string | null;
  authorUserId: string;
  createdAt: number;
  state: ThreadState;
}

/** A comment or a reply, written once and never changed or deleted. */
export interface CommentItem {
  v: 1;
  threadId: string;
  authorUserId: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: number;
}

/** A named set of comments on the version `versionId`. */
export interface CommentRound {
  v: 1;
  name: string;
  versionId: string;
  createdAt: number;
}

/** A thread flagged for `flaggedUserId` from the Check whose key is `checkKey`. */
export interface CommentFlag {
  v: 1;
  threadId: string;
  flaggedUserId: string;
  checkKey: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isInstant = (value: unknown): value is number => Number.isInteger(value);
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || isString(value);

function isThreadState(value: unknown): value is ThreadState {
  if (!isObject(value)) return false;
  if (value.kind === "open") return true;
  return (
    value.kind === "resolved" &&
    isString(value.byUserId) &&
    isInstant(value.at) &&
    (value.outcome === null ||
      COMMENT_OUTCOMES.some((outcome) => outcome === value.outcome)) &&
    isStringOrNull(value.reason)
  );
}

function isThread(value: unknown): value is CommentThread {
  return (
    isObject(value) &&
    value.v === 1 &&
    (value.anchor === null || isTextAnchor(value.anchor)) &&
    isStringOrNull(value.roundId) &&
    isString(value.authorUserId) &&
    isInstant(value.createdAt) &&
    isThreadState(value.state)
  );
}

function isItem(value: unknown): value is CommentItem {
  return (
    isObject(value) &&
    value.v === 1 &&
    isString(value.threadId) &&
    isString(value.authorUserId) &&
    isString(value.body) &&
    Array.isArray(value.mentionedUserIds) &&
    value.mentionedUserIds.every(isString) &&
    isInstant(value.createdAt)
  );
}

function isRound(value: unknown): value is CommentRound {
  return (
    isObject(value) &&
    value.v === 1 &&
    isString(value.name) &&
    isString(value.versionId) &&
    isInstant(value.createdAt)
  );
}

function isFlag(value: unknown): value is CommentFlag {
  return (
    isObject(value) &&
    value.v === 1 &&
    isString(value.threadId) &&
    isString(value.flaggedUserId) &&
    isString(value.checkKey)
  );
}

/** The entries of `name` that `isEntry` accepts, keys ascending. */
function readEntries<T>(
  doc: CrdtDoc,
  name: CommentsMap,
  isEntry: (value: unknown) => value is T,
): Readonly<Record<string, T>> {
  const entries: [string, T][] = [];
  for (const [key, value] of Object.entries(jsonMap(doc, name).entries()))
    if (isEntry(value)) entries.push([key, value]);
  return Object.fromEntries(entries);
}

/** Every thread by id; an entry of another version, or not a thread, is skipped. */
export function readCommentThreads(
  doc: CrdtDoc,
): Readonly<Record<string, CommentThread>> {
  return readEntries(doc, "threads", isThread);
}

/** Every item by id; an entry of another version, or not an item, is skipped. */
export function readCommentItems(
  doc: CrdtDoc,
): Readonly<Record<string, CommentItem>> {
  return readEntries(doc, "items", isItem);
}

/** Every round by id; an entry of another version, or not a round, is skipped. */
export function readCommentRounds(
  doc: CrdtDoc,
): Readonly<Record<string, CommentRound>> {
  return readEntries(doc, "rounds", isRound);
}

/** Every flag by id; an entry of another version, or not a flag, is skipped. */
export function readCommentFlags(
  doc: CrdtDoc,
): Readonly<Record<string, CommentFlag>> {
  return readEntries(doc, "flags", isFlag);
}

/** Writes each `[map, key, value]` in one transaction with origin ORIGIN_COMMENTS; jsonMap's TypeErrors pass through. */
function write(
  doc: CrdtDoc,
  entries: readonly [CommentsMap, string, unknown][],
): void {
  yDocOf(doc).transact(() => {
    for (const [name, key, value] of entries)
      jsonMap(doc, name).set(key, value);
  }, ORIGIN_COMMENTS);
}

/** The stored thread `threadId` of this version; a RangeError when there is none. */
function storedThread(doc: CrdtDoc, threadId: string): CommentThread {
  const stored = jsonMap(doc, "threads").get(threadId);
  if (isThread(stored)) return stored;
  throw new RangeError(`there is no thread ${threadId} to change`);
}

/** Writes the thread `threadId`, open, and its comment, the item `itemId`. */
export function startThread(
  doc: CrdtDoc,
  thread: {
    threadId: string;
    itemId: string;
    anchor: TextAnchor | null;
    roundId: string | null;
    authorUserId: string;
    body: string;
    mentionedUserIds: readonly string[];
  },
  now: () => number,
): void {
  const createdAt = now();
  const { threadId, itemId, anchor, roundId, authorUserId } = thread;
  const item: CommentItem = {
    v: 1,
    threadId,
    authorUserId,
    body: thread.body,
    mentionedUserIds: [...thread.mentionedUserIds],
    createdAt,
  };
  const entry: CommentThread = {
    v: 1,
    anchor,
    roundId,
    authorUserId,
    createdAt,
    state: { kind: "open" },
  };
  // the item first: a value jsonMap refuses then leaves no thread without its comment
  write(doc, [
    ["items", itemId, item],
    ["threads", threadId, entry],
  ]);
}

/** Writes the reply `itemId` to the thread `threadId`. */
export function replyToThread(
  doc: CrdtDoc,
  reply: {
    itemId: string;
    threadId: string;
    authorUserId: string;
    body: string;
    mentionedUserIds: readonly string[];
  },
  now: () => number,
): void {
  const item: CommentItem = {
    v: 1,
    threadId: reply.threadId,
    authorUserId: reply.authorUserId,
    body: reply.body,
    mentionedUserIds: [...reply.mentionedUserIds],
    createdAt: now(),
  };
  write(doc, [["items", reply.itemId, item]]);
}

/** Resolves the thread `threadId`, keeping the rest of it. Throws a RangeError when the document holds no such thread. */
export function resolveThread(
  doc: CrdtDoc,
  resolve: {
    threadId: string;
    byUserId: string;
    outcome: CommentOutcome | null;
    reason: string | null;
  },
  now: () => number,
): void {
  const { threadId, byUserId, outcome, reason } = resolve;
  const thread = storedThread(doc, threadId);
  const state: ThreadState = {
    kind: "resolved",
    byUserId,
    at: now(),
    outcome,
    reason,
  };
  write(doc, [["threads", threadId, { ...thread, state }]]);
}

/** Opens the thread `threadId` again, keeping the rest of it. Throws a RangeError when the document holds no such thread. */
export function reopenThread(doc: CrdtDoc, threadId: string): void {
  const thread = storedThread(doc, threadId);
  const state: ThreadState = { kind: "open" };
  write(doc, [["threads", threadId, { ...thread, state }]]);
}

/** Writes the round `roundId` on the version `versionId`. */
export function startRound(
  doc: CrdtDoc,
  round: { roundId: string; name: string; versionId: string },
  now: () => number,
): void {
  const entry: CommentRound = {
    v: 1,
    name: round.name,
    versionId: round.versionId,
    createdAt: now(),
  };
  write(doc, [["rounds", round.roundId, entry]]);
}

/** Names the round `roundId` `name`, keeping the rest of it. Throws a RangeError when the document holds no such round. */
export function renameRound(doc: CrdtDoc, roundId: string, name: string): void {
  const round = jsonMap(doc, "rounds").get(roundId);
  if (!isRound(round))
    throw new RangeError(`there is no round ${roundId} to rename`);
  write(doc, [["rounds", roundId, { ...round, name }]]);
}

/** Writes the flag `flagId`, which flags the thread `threadId` for `flaggedUserId` from the Check `checkKey`. */
export function flagThread(
  doc: CrdtDoc,
  flag: {
    flagId: string;
    threadId: string;
    flaggedUserId: string;
    checkKey: string;
  },
): void {
  const { flagId, threadId, flaggedUserId, checkKey } = flag;
  const entry: CommentFlag = { v: 1, threadId, flaggedUserId, checkKey };
  write(doc, [["flags", flagId, entry]]);
}
