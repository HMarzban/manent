// Comments session for a signed-in draft reader: opens ONLY the comments CRDT document, never the live script CRDT or writers' notes.
import {
  jsonMap,
  readCommentFlags,
  readCommentItems,
  readCommentRounds,
  readCommentThreads,
  reopenThread,
  replyToThread,
  resolveThread,
  startThread,
} from "@manent/crdt";
import type {
  CommentFlag,
  CommentItem,
  CommentOutcome,
  CommentRound,
  CommentThread,
  CrdtDoc,
} from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { COMMENTS_WORDS } from "@manent/ui";
import { firstNameFor } from "../comments/comments-format.ts";
import { fetchDocPeople } from "../comments/people-request.ts";
import type { CommentPerson } from "../comments/people-request.ts";
import type { PersonServices } from "../services/ports.ts";

export interface ReaderCommentsState {
  readonly canComment: boolean;
  readonly loading: boolean;
  readonly threads: Readonly<Record<string, CommentThread>>;
  readonly items: Readonly<Record<string, CommentItem>>;
  readonly rounds: Readonly<Record<string, CommentRound>>;
  readonly flags: Readonly<Record<string, CommentFlag>>;
  readonly people: readonly CommentPerson[];
  readonly peopleState: "idle" | "loaded" | "offline";
}

export interface ReaderCommentsSession {
  getState(): ReaderCommentsState;
  subscribe(listener: () => void): () => void;
  loadPeople(): Promise<void>;
  startComment(input: {
    anchor: TextAnchor | null;
    body: string;
    mentionedUserIds: readonly string[];
  }): string | null;
  reply(input: {
    threadId: string;
    body: string;
    mentionedUserIds: readonly string[];
  }): boolean;
  resolve(input: {
    threadId: string;
    outcome: CommentOutcome | null;
    reason: string | null;
  }): boolean;
  reopen(threadId: string): boolean;
  dispose(): void;
}

const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});
const EMPTY_PEOPLE: readonly CommentPerson[] = Object.freeze([]);
const noop = (): void => {};

const randomId = (): string => crypto.randomUUID();

/**
 * Opens only `commentsDocId(docId)` for a signed-in reader whom the server granted `canComment`.
 * Never opens `services.documents.open(docId)`, never reads writers' notes, alternates or cuts.
 */
export function createReaderCommentsSession(options: {
  docId: string;
  versionId: string;
  services: PersonServices;
  canComment: boolean;
  now: () => number;
}): ReaderCommentsSession {
  const { docId, versionId, services, now } = options;
  let state: ReaderCommentsState = {
    canComment: options.canComment,
    loading: options.canComment,
    threads: EMPTY_RECORD,
    items: EMPTY_RECORD,
    rounds: EMPTY_RECORD,
    flags: EMPTY_RECORD,
    people: EMPTY_PEOPLE,
    peopleState: "idle",
  };
  const listeners = new Set<() => void>();
  let handle: DocHandle | null = null;
  let closed = false;
  let stopMaps = noop;
  let stopEvents = noop;
  let loadingPeople: Promise<void> | null = null;

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const doc = (): CrdtDoc | null => (closed ? null : (handle?.doc() ?? null));

  const writable = (): boolean =>
    !closed &&
    state.canComment &&
    handle !== null &&
    handle.readOnly.get() === null;

  const attachDoc = (crdtDoc: CrdtDoc): void => {
    stopMaps();
    const refresh = (): void => {
      state = {
        ...state,
        loading: false,
        threads: readCommentThreads(crdtDoc),
        items: readCommentItems(crdtDoc),
        rounds: readCommentRounds(crdtDoc),
        flags: readCommentFlags(crdtDoc),
      };
      emit();
    };
    const stops = [
      jsonMap(crdtDoc, "threads").subscribe(refresh),
      jsonMap(crdtDoc, "items").subscribe(refresh),
      jsonMap(crdtDoc, "rounds").subscribe(refresh),
      jsonMap(crdtDoc, "flags").subscribe(refresh),
    ];
    stopMaps = () => {
      for (const stop of stops) stop();
    };
    refresh();
  };

  const roundForDraft = (): string | null => {
    const matching = Object.entries(state.rounds).filter(
      ([, round]) => round.versionId === versionId,
    );
    return matching.length === 1 ? (matching[0]?.[0] ?? null) : null;
  };

  if (options.canComment) {
    void services
      .openComments(docId, null)
      .then((opened) => {
        if (closed) {
          void opened.close();
          return;
        }
        handle = opened;
        const stopReplaced = opened.on((event) => {
          if (event.type === "replaced") attachDoc(opened.doc());
        });
        const syncReadOnly = (): void => {
          const allowed = options.canComment && opened.readOnly.get() === null;
          if (state.canComment !== allowed) {
            state = { ...state, canComment: allowed };
            emit();
          }
        };
        const stopReadOnly = opened.readOnly.subscribe(syncReadOnly);
        stopEvents = () => {
          stopReplaced();
          stopReadOnly();
        };
        attachDoc(opened.doc());
        syncReadOnly();
      })
      .catch(() => {
        if (!closed) {
          state = { ...state, loading: false, canComment: false };
          emit();
        }
      });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    loadPeople() {
      if (closed || state.peopleState === "loaded") return Promise.resolve();
      if (loadingPeople !== null) return loadingPeople;
      const task = fetchDocPeople(docId, services.userId).then((people) => {
        loadingPeople = null;
        if (closed) return;
        if (people === null) {
          if (state.peopleState === "idle") {
            state = { ...state, peopleState: "offline" };
            emit();
          }
          return;
        }
        state = { ...state, people, peopleState: "loaded" };
        emit();
      });
      loadingPeople = task;
      return task;
    },
    startComment(input) {
      const target = doc();
      if (!writable() || target === null) return null;
      const threadId = randomId();
      startThread(
        target,
        {
          threadId,
          itemId: randomId(),
          anchor: input.anchor,
          roundId: roundForDraft(),
          authorUserId: services.userId,
          body: input.body,
          mentionedUserIds: input.mentionedUserIds,
        },
        now,
      );
      return threadId;
    },
    reply(input) {
      const target = doc();
      if (!writable() || target === null) return false;
      if (state.threads[input.threadId] === undefined) return false;
      replyToThread(
        target,
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
    },
    resolve(input) {
      const target = doc();
      if (!writable() || target === null) return false;
      const thread = state.threads[input.threadId];
      if (thread === undefined) return false;
      const maySetOutcome =
        thread.roundId !== null && thread.authorUserId === services.userId;
      const outcome = maySetOutcome ? input.outcome : null;
      const reason =
        maySetOutcome && input.reason !== null && input.reason.trim() !== ""
          ? input.reason.trim()
          : null;
      resolveThread(
        target,
        {
          threadId: input.threadId,
          byUserId: services.userId,
          outcome,
          reason,
        },
        now,
      );
      const authorFirst =
        thread.authorUserId === services.userId
          ? null
          : firstNameFor(thread.authorUserId, state.people);
      services.messages.push({
        id: "comment_resolved",
        text: COMMENTS_WORDS.resolvedMessage(authorFirst, outcome),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
      return true;
    },
    reopen(threadId) {
      const target = doc();
      if (!writable() || target === null) return false;
      const thread = state.threads[threadId];
      if (thread === undefined) return false;
      reopenThread(target, threadId);
      const authorFirst =
        thread.authorUserId === services.userId
          ? null
          : firstNameFor(thread.authorUserId, state.people);
      services.messages.push({
        id: "comment_reopened",
        text: COMMENTS_WORDS.reopenedMessage(authorFirst),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
      return true;
    },
    dispose() {
      if (closed) return;
      closed = true;
      stopMaps();
      stopMaps = noop;
      stopEvents();
      stopEvents = noop;
      if (handle !== null) {
        void handle.close();
        handle = null;
      }
      listeners.clear();
    },
  };
}
