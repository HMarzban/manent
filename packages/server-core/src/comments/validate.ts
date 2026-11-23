// What a push to a comments document may write: entries of its four maps, each of its shape, by the roles allowed to.
import { COMMENTS_DOC_MAPS, readCommentsPush } from "@manent/crdt";
import type {
  CommentFlag,
  CommentItem,
  CommentRound,
  CommentThread,
  CommentsWrite,
  ThreadState,
} from "@manent/crdt";
import { isTextAnchor } from "@manent/schema";
import type { Issue } from "@manent/schema";
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

/** Why a thread write is refused; null allows it. A resolve names its resolver, and only an editor or the author records an outcome or reason. */
function threadRefusal(
  { key, value, replaced }: CommentsWrite,
  pusher: Pusher,
): string | null {
  if (value === null) return `a push deleted the thread ${key}`;
  if (!isThread(value)) return `the thread ${key} is not a thread`;
  const { authorUserId, state } = value;
  if (!replaced && authorUserId !== pusher.userId)
    return `the new thread ${key} names ${authorUserId} as its author, not the pusher`;
  if (state.kind === "open") return null;
  if (state.byUserId !== pusher.userId)
    return `the thread ${key} names ${state.byUserId} as its resolver, not the pusher`;
  const settled = state.outcome !== null || state.reason !== null;
  return settled && !pusher.editor && authorUserId !== pusher.userId
    ? `only an editor or its author records an outcome or reason on the thread ${key}`
    : null;
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

/** Why a round write is refused; null allows it. Only the authority starts a round; an editor renames one. */
function roundRefusal(
  { key, value, replaced }: CommentsWrite,
  pusher: Pusher,
): string | null {
  if (!replaced)
    return `a push started the round ${key}, which only the authority starts`;
  if (!isRound(value)) return `the round ${key} is not a round`;
  return pusher.editor ? null : `only an editor renames the round ${key}`;
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
  // the write path applies a push to the room's document first: a room without one is refused, never judged empty
  if (room.doc === null)
    return [...issues, refused("", `the room of ${room.docId} is not loaded`)];
  const pusher = { userId: peer.userId, editor: isWriterRole(access.role) };
  for (const write of readCommentsPush(room.doc, report)) {
    const message = REFUSALS[write.map](write, pusher);
    if (message !== null)
      issues.push(refused(`${write.map}.${write.key}`, message));
  }
  return issues;
};
