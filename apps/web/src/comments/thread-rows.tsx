// Thread and writer-note rows rendered inside the Comments tab list.
import { Avatar, COMMENTS_WORDS } from "@manent/ui";
import { StickyNoteIcon } from "lucide-react";
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
import { BodyText, itemKeysByRef } from "./thread-body.tsx";

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
    ? "w-full cursor-pointer bg-selected px-3 py-3 text-left transition-colors active:bg-control"
    : "w-full cursor-pointer px-3 py-3 text-left transition-colors hover:bg-subtle active:bg-control";

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
  const keyByItem = replies.length === 0 ? null : itemKeysByRef(state.items);
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
      <div className="flex min-w-0 items-center gap-2">
        <Avatar
          name={authorFull}
          initials={initialsOf(authorFull)}
          colour={null}
          size="sm"
          decorative
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ui font-semibold text-fg">
            {authorFull}
          </span>
          <span className="truncate text-meta text-fg-muted tabular-nums">
            {COMMENTS_WORDS.metaLine(
              dayTimeLabel(thread.createdAt, now),
              place,
            )}
          </span>
        </div>
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
        <blockquote className="mn-comment-quote mt-2 line-clamp-2 pl-2 text-meta text-fg-muted">
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
          {replies.map((reply, index) => {
            const replyAuthor = fullNameFor(reply.authorUserId, state.people);
            const replyKey =
              keyByItem?.get(reply) ??
              `${index}:${reply.createdAt}:${reply.authorUserId}`;
            return (
              <li key={replyKey} className="flex flex-col gap-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Avatar
                    name={replyAuthor}
                    initials={initialsOf(replyAuthor)}
                    colour={null}
                    size="sm"
                    decorative
                  />
                  <span className="truncate text-meta font-medium text-fg">
                    {replyAuthor}
                  </span>
                  <span className="shrink-0 text-meta text-fg-muted tabular-nums">
                    {dayTimeLabel(reply.createdAt, now)}
                  </span>
                </div>
                <BodyText
                  body={reply.body}
                  mentionedUserIds={reply.mentionedUserIds}
                  people={state.people}
                />
              </li>
            );
          })}
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
  place?: string | null;
  onOpen(): void;
}): ReactNode {
  const { entry, removed, active, now, place = null, onOpen } = props;
  const { note } = entry;
  const noteTime = note.at !== null ? dayTimeLabel(note.at, now) : null;
  const noteMeta =
    noteTime !== null ? COMMENTS_WORDS.metaLine(noteTime, place) : place;
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onOpen}
      className={
        active
          ? "w-full cursor-pointer bg-selected px-3 py-3 text-left transition-colors active:bg-control"
          : "w-full cursor-pointer px-3 py-3 text-left transition-colors hover:bg-subtle active:bg-control"
      }
    >
      <div className="flex items-center gap-1.5">
        <StickyNoteIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-muted"
        />
        <span className="mn-tag">{COMMENTS_WORDS.writersOnly}</span>
      </div>
      {note.writerName !== null ? (
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <Avatar
            name={note.writerName}
            initials={initialsOf(note.writerName)}
            colour={null}
            size="sm"
            decorative
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-ui font-semibold text-fg">
              {note.writerName}
            </span>
            {noteMeta !== null ? (
              <span className="truncate text-meta text-fg-muted tabular-nums">
                {noteMeta}
              </span>
            ) : null}
          </div>
        </div>
      ) : noteMeta !== null ? (
        <p className="mt-1 text-meta text-fg-muted tabular-nums">{noteMeta}</p>
      ) : null}
      {removed ? (
        <p className="mt-2 text-meta text-fg-muted">
          {COMMENTS_WORDS.textRemoved}
        </p>
      ) : null}
      {note.anchor !== null && note.anchor.quote !== "" ? (
        <blockquote className="mn-note-quote mt-2 line-clamp-2 pl-2 text-meta text-fg-muted">
          {note.anchor.quote}
        </blockquote>
      ) : null}
      <p className="mt-2 whitespace-pre-wrap break-words text-ui text-fg">
        {note.text}
      </p>
    </button>
  );
}
