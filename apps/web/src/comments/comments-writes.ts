// Permission-checked CRDT mutations for comments, rounds and writer-only notes.
import {
  NOTES_MAP,
  jsonMap,
  renameRound as renameCrdtRound,
  reopenThread,
  replyToThread,
  resolveThread,
  startThread,
} from "@manent/crdt";
import type { CommentOutcome, CrdtDoc } from "@manent/crdt";
import type { ScriptNote, TextAnchor } from "@manent/schema";
import { COMMENTS_WORDS } from "@manent/ui";
import { liveEditor } from "../editor-host/live-editor.ts";
import type { PersonServices } from "../services/ports.ts";
import { firstNameFor } from "./comments-format.ts";
import type { ScriptCommentsState } from "./comments-types.ts";

export interface CommentsWriteTarget {
  readonly docId: string;
  readonly closed: boolean;
  readonly state: ScriptCommentsState;
  readonly doc: CrdtDoc | null;
}

const randomId = (): string => crypto.randomUUID();

export function writeNewComment(
  target: CommentsWriteTarget,
  services: PersonServices,
  input: {
    anchor: TextAnchor | null;
    roundId: string | null;
    body: string;
    mentionedUserIds: readonly string[];
  },
  now: () => number,
): string | null {
  if (!target.state.canComment || target.doc === null) return null;
  const threadId = randomId();
  startThread(
    target.doc,
    {
      threadId,
      itemId: randomId(),
      anchor: input.anchor,
      roundId: input.roundId,
      authorUserId: services.userId,
      body: input.body,
      mentionedUserIds: input.mentionedUserIds,
    },
    now,
  );
  return threadId;
}

export function writeReply(
  target: CommentsWriteTarget,
  services: PersonServices,
  input: {
    threadId: string;
    body: string;
    mentionedUserIds: readonly string[];
  },
  now: () => number,
): boolean {
  if (!target.state.canComment || target.doc === null) return false;
  if (target.state.threads[input.threadId] === undefined) return false;
  replyToThread(
    target.doc,
    {
      itemId: randomId(),
      threadId: input.threadId,
      authorUserId: services.userId,
      body: input.body,
      mentionedUserIds: input.mentionedUserIds,
    },
    now,
  );
  return true;
}

export function writeResolve(
  target: CommentsWriteTarget,
  getCurrent: () => CommentsWriteTarget,
  services: PersonServices,
  input: {
    threadId: string;
    outcome: CommentOutcome | null;
    reason: string | null;
  },
  now: () => number,
): boolean {
  if (!target.state.canComment || target.doc === null) return false;
  const thread = target.state.threads[input.threadId];
  if (thread === undefined) return false;
  const maySetOutcome =
    thread.roundId !== null &&
    (target.state.canEdit || thread.authorUserId === services.userId);
  const outcome = maySetOutcome ? input.outcome : null;
  const reason =
    maySetOutcome && input.reason !== null && input.reason.trim() !== ""
      ? input.reason.trim()
      : null;
  resolveThread(
    target.doc,
    {
      threadId: input.threadId,
      byUserId: services.userId,
      outcome,
      reason,
    },
    now,
  );
  services.reverses.set("comment_resolved", () => {
    const latest = getCurrent();
    if (latest.closed || !latest.state.canComment || latest.doc === null)
      return;
    reopenThread(latest.doc, input.threadId);
  });
  const authorFirst =
    thread.authorUserId === services.userId
      ? null
      : firstNameFor(thread.authorUserId, target.state.people);
  services.messages.push({
    id: "comment_resolved",
    text: COMMENTS_WORDS.resolvedMessage(authorFirst, outcome),
    actions: [{ label: COMMENTS_WORDS.undo, commandId: "settings.undo" }],
    lifetime: "reverse",
    ownWork: false,
  });
  return true;
}

export function writeReopen(
  target: CommentsWriteTarget,
  services: PersonServices,
  threadId: string,
): boolean {
  if (!target.state.canComment || target.doc === null) return false;
  const thread = target.state.threads[threadId];
  if (thread === undefined) return false;
  reopenThread(target.doc, threadId);
  const authorFirst =
    thread.authorUserId === services.userId
      ? null
      : firstNameFor(thread.authorUserId, target.state.people);
  services.messages.push({
    id: "comment_reopened",
    text: COMMENTS_WORDS.reopenedMessage(authorFirst),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
  return true;
}

export function writeRenameRound(
  target: CommentsWriteTarget,
  services: PersonServices,
  roundId: string,
  name: string,
): boolean {
  if (!target.state.canEdit || target.doc === null) return false;
  const trimmed = name.trim();
  if (trimmed === "" || target.state.rounds[roundId] === undefined)
    return false;
  renameCrdtRound(target.doc, roundId, trimmed);
  services.messages.push({
    id: "round_renamed",
    text: COMMENTS_WORDS.roundRenamedMessage(trimmed),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
  return true;
}

export function writeScriptNote(
  target: CommentsWriteTarget,
  writerName: string,
  input: { anchor: TextAnchor; text: string },
  now: () => number,
): string | null {
  const editor = liveEditor(target.docId);
  if (!target.state.canEdit || editor === null || !editor.editable) return null;
  const noteId = randomId();
  const note: ScriptNote = {
    v: 1,
    anchor: input.anchor,
    text: input.text,
    writerName,
    at: now(),
  };
  jsonMap(editor.doc, NOTES_MAP).set(noteId, note);
  return noteId;
}
