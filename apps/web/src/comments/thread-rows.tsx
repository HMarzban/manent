// Thread and writer-note rows rendered inside the Comments tab list.
import { Avatar, COMMENTS_WORDS, cn } from "@manent/ui";
import { StickyNoteIcon } from "lucide-react";
import { useState } from "react";
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

const FOLD_REPLY_THRESHOLD = 2;

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
  const [expanded, setExpanded] = useState(false);
  const removed = thread.anchor !== null && state.removedIds.has(id);
  const [first, ...replies] = items;
  const authorFull = fullNameFor(thread.authorUserId, state.people);
  const round =
    thread.roundId !== null ? (state.rounds[thread.roundId] ?? null) : null;
  const baseClass = cn(
    "mn-thread-row block w-full cursor-pointer px-3 py-3 text-start transition-colors active:bg-control",
    active ? "bg-selected" : "hover:bg-subtle",
  );

  if (thread.state.kind === "resolved") {
    const outcomeTone =
      thread.state.outcome === "addressed"
        ? "text-ok"
        : thread.state.outcome === "declined"
          ? "text-attention"
          : "text-fg-muted";
    return (
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className={baseClass}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {thread.state.outcome !== null ? (
            <span className={cn("mn-tag font-medium", outcomeTone)}>
              {thread.state.outcome === "addressed"
                ? COMMENTS_WORDS.addressed
                : COMMENTS_WORDS.declined}
            </span>
          ) : null}
          {round !== null ? <span className="mn-tag">{round.name}</span> : null}
          <span className="text-meta text-fg-muted">
            {resolvedLineLabel(thread, state.people, now)}
          </span>
        </div>
        {thread.state.reason === null || thread.state.reason === "" ? null : (
          <p className="mt-1 text-ui text-fg">{thread.state.reason}</p>
        )}
        {thread.anchor !== null && thread.anchor.quote !== "" ? (
          <blockquote className="mn-comment-quote mt-1.5 line-clamp-1 ps-2 text-meta text-fg-muted">
            {thread.anchor.quote}
          </blockquote>
        ) : null}
        {first !== undefined ? (
          <p className="mt-1 line-clamp-2 text-meta text-fg-muted">
            <span className="font-medium text-fg">{authorFull}: </span>
            {first.body}
          </p>
        ) : null}
      </button>
    );
  }

  const keyByItem = replies.length === 0 ? null : itemKeysByRef(state.items);
  const place = anchorPlaceLabel(thread.anchor, state.blockScenes);
  const flagText = flaggedLabel(
    flags,
    thread.authorUserId,
    currentUserId,
    state.people,
  );
  const foldedCount =
    !expanded && replies.length > FOLD_REPLY_THRESHOLD ? replies.length - 1 : 0;
  const visibleReplies = foldedCount > 0 ? replies.slice(-1) : replies;

  return (
    <div className="relative">
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
        {flagText !== null || round !== null ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {round !== null ? (
              <span className="mn-tag">{round.name}</span>
            ) : null}
            {flagText !== null ? (
              <span className="mn-tag">{flagText}</span>
            ) : null}
          </div>
        ) : null}
        {removed ? (
          <p className="mt-2 text-meta text-fg-muted">
            {COMMENTS_WORDS.textRemoved}
          </p>
        ) : null}
        {thread.anchor !== null && thread.anchor.quote !== "" ? (
          <blockquote className="mn-comment-quote mt-2 line-clamp-2 ps-2 text-meta text-fg-muted">
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
        {visibleReplies.length === 0 ? null : (
          <ul className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
            {visibleReplies.map((reply, index) => {
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
      {foldedCount > 0 ? (
        <div className="border-t border-line px-3 py-1.5">
          <button
            type="button"
            className="cursor-pointer text-meta font-medium text-fg-accent hover:underline"
            onClick={() => setExpanded(true)}
          >
            {COMMENTS_WORDS.earlierReplies(foldedCount)}
          </button>
        </div>
      ) : null}
    </div>
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
      className={cn(
        "mn-thread-row block w-full cursor-pointer px-3 py-3 text-start transition-colors active:bg-control",
        active ? "bg-selected" : "hover:bg-subtle",
      )}
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
        <blockquote className="mn-note-quote mt-2 line-clamp-2 ps-2 text-meta text-fg-muted">
          {note.anchor.quote}
        </blockquote>
      ) : null}
      <p className="mt-2 whitespace-pre-wrap break-words text-ui text-fg">
        {note.text}
      </p>
    </button>
  );
}
