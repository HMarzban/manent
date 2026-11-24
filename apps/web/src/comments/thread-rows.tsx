// Thread and writer-note rows rendered inside the Comments tab list.
import { Avatar, COMMENTS_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import {
  anchorPlaceLabel,
  dayTimeLabel,
  flaggedLabel,
  fullNameFor,
  resolvedLineLabel,
} from "./comments-format.ts";
import type { ThreadEntry } from "./comments-filter.ts";
import type { ScriptCommentsState, StoredNote } from "./comments-types.ts";
import { BodyText } from "./thread-body.tsx";

export function ThreadRow(props: {
  entry: ThreadEntry;
  state: ScriptCommentsState;
  currentUserId: string;
  active: boolean;
  now: number;
  onOpen(): void;
}): ReactNode {
  const { entry, state, currentUserId, active, now, onOpen } = props;
  const { id, thread, items, flags } = entry;
  const removed = thread.anchor !== null && state.removedIds.has(id);
  const baseClass = active
    ? "w-full cursor-pointer bg-selected px-3 py-3 text-left transition-colors"
    : "w-full cursor-pointer px-3 py-3 text-left transition-colors hover:bg-subtle";

  if (thread.state.kind === "resolved") {
    return (
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className={baseClass}
      >
        <p className="text-meta text-fg-muted">
          {resolvedLineLabel(thread, state.people, now)}
        </p>
        {thread.state.reason === null || thread.state.reason === "" ? null : (
          <p className="mt-1 text-ui text-fg-muted">{thread.state.reason}</p>
        )}
      </button>
    );
  }

  const [first, ...replies] = items;
  const authorFull = fullNameFor(thread.authorUserId, state.people);
  const place = anchorPlaceLabel(thread.anchor, state.blockScenes);
  const flagText = flaggedLabel(
    flags,
    thread.authorUserId,
    currentUserId,
    state.people,
  );

  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onOpen}
      className={baseClass}
    >
      <div className="flex items-center gap-2">
        <Avatar
          name={authorFull}
          initials={initialsOf(authorFull)}
          colour={null}
          size="sm"
          decorative
        />
        <span className="min-w-0 truncate text-meta text-fg-muted">
          {COMMENTS_WORDS.threadHeader(
            authorFull,
            dayTimeLabel(thread.createdAt, now),
            place,
          )}
        </span>
      </div>
      {flagText === null ? null : (
        <div className="mt-2">
          <span className="mn-tag">{flagText}</span>
        </div>
      )}
      {removed ? (
        <p className="mt-2 text-meta text-fg-muted">
          {COMMENTS_WORDS.textRemoved}
        </p>
      ) : null}
      {thread.anchor !== null && thread.anchor.quote !== "" ? (
        <blockquote className="mt-2 border-l-2 border-line-strong pl-2 text-meta text-fg-muted">
          {thread.anchor.quote}
        </blockquote>
      ) : null}
      {first === undefined ? null : (
        <div className="mt-2">
          <BodyText
            body={first.body}
            mentionedUserIds={first.mentionedUserIds}
            people={state.people}
          />
        </div>
      )}
      {replies.length === 0 ? null : (
        <ul className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
          {replies.map((reply) => (
            <li key={reply.createdAt + reply.authorUserId}>
              <span className="text-meta text-fg-muted">
                {COMMENTS_WORDS.authorMeta(
                  fullNameFor(reply.authorUserId, state.people),
                  dayTimeLabel(reply.createdAt, now),
                )}
              </span>
              <BodyText
                body={reply.body}
                mentionedUserIds={reply.mentionedUserIds}
                people={state.people}
              />
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

export function NoteRow(props: {
  entry: StoredNote;
  removed: boolean;
  active: boolean;
  now: number;
  onOpen(): void;
}): ReactNode {
  const { entry, removed, active, now, onOpen } = props;
  const { note } = entry;
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onOpen}
      className={
        active
          ? "w-full cursor-pointer bg-selected px-3 py-3 text-left transition-colors"
          : "w-full cursor-pointer px-3 py-3 text-left transition-colors hover:bg-subtle"
      }
    >
      <div className="flex items-center gap-2">
        <span className="mn-tag">{COMMENTS_WORDS.writersOnly}</span>
        {note.writerName !== null && note.at !== null ? (
          <span className="min-w-0 truncate text-meta text-fg-muted">
            {COMMENTS_WORDS.authorMeta(
              note.writerName,
              dayTimeLabel(note.at, now),
            )}
          </span>
        ) : null}
      </div>
      {removed ? (
        <p className="mt-2 text-meta text-fg-muted">
          {COMMENTS_WORDS.textRemoved}
        </p>
      ) : null}
      {note.anchor !== null && note.anchor.quote !== "" ? (
        <blockquote className="mt-2 border-l-2 border-line-strong pl-2 text-meta text-fg-muted">
          {note.anchor.quote}
        </blockquote>
      ) : null}
      <p className="mt-2 whitespace-pre-wrap break-words text-ui text-fg">
        {note.text}
      </p>
    </button>
  );
}
