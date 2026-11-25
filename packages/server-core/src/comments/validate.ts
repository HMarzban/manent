// What a push to a comments document may write: entries of its four maps, each of its shape, by the roles allowed to.
import { COMMENTS_DOC_MAPS, readCommentsPush } from "@manent/crdt";
import type {
  CommentFlag,
  CommentItem,
  CommentRound,
  CommentThread,
  CommentsWrite,
  CrdtDoc,
  ThreadState,
  TransactionReport,
} from "@manent/crdt";
import { isTextAnchor } from "@manent/schema";
import type { Issue, TextAnchor } from "@manent/schema";
import { isWriterRole } from "../sync/admission.ts";
import type { PushValidator } from "../sync/validate.ts";

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
      value.outcome === "addressed" ||
      value.outcome === "declined") &&
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

/** The pusher, and whether their role is Can edit or owner. */
interface Pusher {
  userId: string;
  editor: boolean;
}

/** Why a resolve to `state` is refused; null allows it. It names its resolver, and only an editor or the thread's author records an outcome or reason. */
function resolveRefusal(
  key: string,
  state: Extract<ThreadState, { kind: "resolved" }>,
  authorUserId: string,
  pusher: Pusher,
): string | null {
  if (state.byUserId !== pusher.userId)
    return `the thread ${key} names ${state.byUserId} as its resolver, not the pusher`;
  const settled = state.outcome !== null || state.reason !== null;
  return settled && !pusher.editor && authorUserId !== pusher.userId
    ? `only an editor or its author records an outcome or reason on the thread ${key}`
    : null;
}

const isSameAnchor = (a: TextAnchor | null, b: TextAnchor | null): boolean =>
  a === null || b === null
    ? a === b
    : a.blockId === b.blockId &&
      a.start === b.start &&
      a.end === b.end &&
      a.quote === b.quote &&
      a.prefix === b.prefix &&
      a.suffix === b.suffix;

const isSameState = (a: ThreadState, b: ThreadState): boolean =>
  a.kind === "open" || b.kind === "open"
    ? a.kind === b.kind
    : a.byUserId === b.byUserId &&
      a.at === b.at &&
      a.outcome === b.outcome &&
      a.reason === b.reason;

/**
 * Why a change to the stored thread is refused; null allows it. Its author and time never change; only an editor
 * moves it to another anchor or round; a resolve or reopen is judged only when the state changes, and a reopen is
 * for an editor, the thread's author or whoever resolved it.
 */
function changeRefusal(
  key: string,
  stored: CommentThread,
  pushed: CommentThread,
  pusher: Pusher,
): string | null {
  if (
    pushed.authorUserId !== stored.authorUserId ||
    pushed.createdAt !== stored.createdAt
  )
    return `a push changed the author or the time of the thread ${key}`;
  const moved =
    pushed.roundId !== stored.roundId ||
    !isSameAnchor(pushed.anchor, stored.anchor);
  if (moved && !pusher.editor)
    return `only an editor moves the thread ${key} to another anchor or round`;
  if (isSameState(pushed.state, stored.state)) return null;
  if (pushed.state.kind === "resolved")
    return resolveRefusal(key, pushed.state, stored.authorUserId, pusher);
  const reopener =
    pusher.editor ||
    stored.authorUserId === pusher.userId ||
    (stored.state.kind === "resolved" &&
      stored.state.byUserId === pusher.userId);
  return reopener
    ? null
    : `only an editor, its author or its resolver reopens the thread ${key}`;
}

/** Why a thread write is refused; null allows it. A new thread is the pusher's; a replaced one is judged against the thread stored before the push. */
function threadRefusal(
  { key, value, previous, replaced }: CommentsWrite,
  pusher: Pusher,
): string | null {
  if (value === null) return `a push deleted the thread ${key}`;
  if (!isThread(value)) return `the thread ${key} is not a thread`;
  if (replaced || previous !== null)
    return isThread(previous)
      ? changeRefusal(key, previous, value, pusher)
      : `the thread ${key} replaced an entry that is not a thread`;
  if (value.authorUserId !== pusher.userId)
    return `the new thread ${key} names ${value.authorUserId} as its author, not the pusher`;
  return value.state.kind === "open"
    ? null
    : resolveRefusal(key, value.state, value.authorUserId, pusher);
}

/** Why an item write is refused; null allows it. An item is written once, by its author. */
function itemRefusal(
  { key, value, replaced }: CommentsWrite,
  pusher: Pusher,
): string | null {
  if (replaced) return `a push overwrote or deleted the item ${key}`;
  if (!isItem(value)) return `the item ${key} is not an item`;
  return value.authorUserId === pusher.userId
    ? null
    : `the new item ${key} names ${value.authorUserId} as its author, not the pusher`;
}

/** Why a round write is refused; null allows it. Only the authority starts a round; an editor renames one, and changes nothing else. */
function roundRefusal(
  { key, value, previous, replaced }: CommentsWrite,
  pusher: Pusher,
): string | null {
  if (!replaced && previous === null)
    return `a push started the round ${key}, which only the authority starts`;
  if (!isRound(value)) return `the round ${key} is not a round`;
  if (!isRound(previous))
    return `the round ${key} replaced an entry that is not a round`;
  if (!pusher.editor) return `only an editor renames the round ${key}`;
  return value.versionId === previous.versionId &&
    value.createdAt === previous.createdAt
    ? null
    : `a push changed more than the name of the round ${key}`;
}

/** Why a flag write is refused; null allows it. An editor writes or deletes a flag. */
function flagRefusal(
  { key, value, replaced }: CommentsWrite,
  pusher: Pusher,
): string | null {
  if (!pusher.editor) return `only an editor writes the flag ${key}`;
  if (value === null && replaced) return null;
  return isFlag(value) ? null : `the flag ${key} is not a flag`;
}

/** Why a write to one map is refused; null allows it. */
type Refusal = (write: CommentsWrite, pusher: Pusher) => string | null;

const REFUSALS: Readonly<Record<CommentsWrite["map"], Refusal>> = Object.freeze(
  {
    threads: threadRefusal,
    items: itemRefusal,
    rounds: roundRefusal,
    flags: flagRefusal,
  },
);

const refused = (path: string, message: string): Issue => ({
  path,
  code: "unknown_node",
  severity: "reject",
  message,
});

function reportStructureIssues(report: TransactionReport): Issue[] {
  const issues = report.maps
    .filter((name) => !COMMENTS_DOC_MAPS.some((held) => held === name))
    .map((name) =>
      refused(
        `maps.${name}`,
        `a push wrote the ${name} map, which a comments document does not hold`,
      ),
    );
  const body =
    report.inserted.length > 0 ||
    report.changed.length > 0 ||
    report.removed.length > 0 ||
    report.touched().length > 0;
  if (body)
    issues.push(
      refused("body", "a push wrote a script body into a comments document"),
    );
  return issues;
}

function structuralIssues(
  doc: CrdtDoc,
  report: TransactionReport,
): { issues: Issue[]; writes: CommentsWrite[] } {
  const issues = reportStructureIssues(report);
  try {
    return { issues, writes: readCommentsPush(doc, report) };
  } catch (error) {
    return {
      issues: [
        ...issues,
        refused(
          "",
          error instanceof Error ? error.message : "invalid comments write",
        ),
      ],
      writes: [],
    };
  }
}

/**
 * One issue for each root the push wrote outside the four comments maps, one for a script body, and one for each
 * entry the pusher may not write; a pusher who can only view is refused whatever the push wrote.
 */
export const validateCommentsPush: PushValidator = ({
  report,
  room,
  subscription,
}) => {
  const { peer, access } = subscription;
  if (access.role === "view")
    return [refused("", `${peer.userId} can only view ${room.docId}`)];
  // the write path applies a push to the room's document first: a room without one is refused, never judged empty
  if (room.doc === null)
    return [
      ...reportStructureIssues(report),
      refused("", `the room of ${room.docId} is not loaded`),
    ];
  const pusher = { userId: peer.userId, editor: isWriterRole(access.role) };
  const { issues, writes } = structuralIssues(room.doc, report);
  for (const write of writes) {
    const message = REFUSALS[write.map](write, pusher);
    if (message !== null)
      issues.push(refused(`${write.map}.${write.key}`, message));
  }
  return issues;
};

type StateRefusal = (write: CommentsWrite, userId: string) => string | null;

function stateThreadRefusal(
  { key, value }: CommentsWrite,
  userId: string,
): string | null {
  if (!isThread(value)) return `the thread ${key} is not a thread`;
  if (value.authorUserId !== userId)
    return `the thread ${key} names ${value.authorUserId} as its author, not the adopter`;
  if (value.state.kind !== "open" && value.state.byUserId !== userId)
    return `the thread ${key} names ${value.state.byUserId} as its resolver, not the adopter`;
  return null;
}

function stateItemRefusal(
  { key, value }: CommentsWrite,
  userId: string,
): string | null {
  if (!isItem(value)) return `the item ${key} is not an item`;
  return value.authorUserId === userId
    ? null
    : `the item ${key} names ${value.authorUserId} as its author, not the adopter`;
}

const STATE_REFUSALS: Readonly<Record<CommentsWrite["map"], StateRefusal>> =
  Object.freeze({
    threads: stateThreadRefusal,
    items: stateItemRefusal,
    rounds: ({ key, value }) =>
      isRound(value) ? null : `the round ${key} is not a round`,
    flags: ({ key, value }) =>
      isFlag(value) ? null : `the flag ${key} is not a flag`,
  });

/**
 * Validates an adopted comments document's state: only the four comments maps, no script body,
 * well-formed entries, and threads/items authored or resolved only by `userId` (local rounds allowed).
 */
export function validateCommentsState(
  doc: CrdtDoc,
  report: TransactionReport | null,
  userId: string,
): Issue[] {
  if (report === null) return [];
  const { issues, writes } = structuralIssues(doc, report);
  for (const write of writes) {
    const message = STATE_REFUSALS[write.map](write, userId);
    if (message !== null)
      issues.push(refused(`${write.map}.${write.key}`, message));
  }
  return issues;
}
