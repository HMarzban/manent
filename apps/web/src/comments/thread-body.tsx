// Thread view inside the comment popover: header, quote, replies, mention formatting, resolve/reopen.
import type { CommentOutcome, CommentThread } from "@manent/crdt";
import {
  Avatar,
  Button,
  COMMENTS_WORDS,
  DIALOG_WORDS,
  Input,
  Segmented,
} from "@manent/ui";
import type { Choice } from "@manent/settings";
import { useState } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import type { PersonServices } from "../services/ports.ts";
import { commentsActions } from "../state/comments.store.ts";
import {
  anchorPlaceLabel,
  dayTimeLabel,
  flaggedLabel,
  fullNameFor,
  resolvedLineLabel,
  splitBodyMentions,
  threadItemsOf,
} from "./comments-format.ts";
import type { ScriptCommentsState } from "./comments-types.ts";
import { MentionField } from "./mention-field.tsx";
import type { CommentPerson } from "./people-request.ts";

const OUTCOME_CHOICES: readonly Choice<CommentOutcome>[] = [
  { value: "addressed", label: COMMENTS_WORDS.addressed },
  { value: "declined", label: COMMENTS_WORDS.declined },
];

export function BodyText(props: {
  body: string;
  mentionedUserIds: readonly string[];
  people: readonly CommentPerson[];
}): ReactNode {
  const segments = splitBodyMentions(
    props.body,
    props.mentionedUserIds,
    props.people,
  );
  return (
    <p className="whitespace-pre-wrap break-words text-ui text-fg">
      {segments.map((seg, i) =>
        seg.mention ? (
          <span key={i} className="font-medium text-fg-accent">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}

export function ThreadBody(props: {
  docId: string;
  threadId: string;
  thread: CommentThread;
  state: ScriptCommentsState;
  services: PersonServices;
  now(): number;
  onClose(): void;
}): ReactNode {
  const { docId, threadId, thread, state, services, now, onClose } = props;
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState<CommentOutcome>("addressed");
  const [reason, setReason] = useState("");
  const currentNow = now();
  const items = threadItemsOf(threadId, state.items);
  const [first, ...replies] = items;
  const threadFlags = Object.values(state.flags).filter(
    (flag) => flag.threadId === threadId,
  );
  const flagText = flaggedLabel(
    threadFlags,
    thread.authorUserId,
    services.userId,
    state.people,
  );
  const removed = thread.anchor !== null && state.removedIds.has(threadId);
  const authorFull = fullNameFor(thread.authorUserId, state.people);
  const place = anchorPlaceLabel(thread.anchor, state.blockScenes);
  const inRoundOutcome =
    thread.roundId !== null &&
    (state.canEdit || thread.authorUserId === services.userId);

  const confirmResolve = (): void => {
    commentsActions.resolve(
      docId,
      services,
      {
        threadId,
        outcome: inRoundOutcome ? outcome : null,
        reason: inRoundOutcome ? reason : null,
      },
      now,
    );
    setResolving(false);
    setReason("");
    onClose();
  };

  const resolveButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (inRoundOutcome) setResolving(true);
        else confirmResolve();
      }}
    >
      {COMMENTS_WORDS.resolve}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar
          name={authorFull}
          initials={initialsOf(authorFull)}
          colour={null}
          size="md"
          decorative
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ui font-semibold text-fg">
            {authorFull}
          </span>
          <span className="truncate text-meta text-fg-muted tabular-nums">
            {COMMENTS_WORDS.metaLine(
              dayTimeLabel(thread.createdAt, currentNow),
              place,
            )}
          </span>
        </div>
      </div>
      {flagText === null ? null : (
        <div>
          <span className="mn-tag">{flagText}</span>
        </div>
      )}
      {removed ? (
        <p className="text-meta text-fg-muted">{COMMENTS_WORDS.textRemoved}</p>
      ) : null}
      {thread.anchor !== null && thread.anchor.quote !== "" ? (
        <blockquote className="mn-comment-quote line-clamp-2 pl-2 text-meta text-fg-muted">
          {thread.anchor.quote}
        </blockquote>
      ) : null}
      {first === undefined ? null : (
        <BodyText
          body={first.body}
          mentionedUserIds={first.mentionedUserIds}
          people={state.people}
        />
      )}
      {replies.length === 0 ? null : (
        <ul className="flex flex-col gap-2 border-t border-line pt-2">
          {replies.map((reply) => {
            const replyAuthor = fullNameFor(reply.authorUserId, state.people);
            return (
              <li
                key={reply.createdAt + reply.authorUserId}
                className="flex flex-col gap-1"
              >
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
                    {dayTimeLabel(reply.createdAt, currentNow)}
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
      {thread.state.kind === "resolved" ? (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <p className="text-meta text-fg-muted">
            {resolvedLineLabel(thread, state.people, currentNow)}
          </p>
          {thread.state.reason === null || thread.state.reason === "" ? null : (
            <p className="text-ui text-fg-muted">{thread.state.reason}</p>
          )}
          {state.canComment ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  commentsActions.reopen(docId, services, threadId)
                }
              >
                {COMMENTS_WORDS.reopen}
              </Button>
            </div>
          ) : null}
        </div>
      ) : state.canComment ? (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <MentionField
            placeholder={COMMENTS_WORDS.replyPlaceholder}
            submitLabel={COMMENTS_WORDS.reply}
            mentions
            people={state.people}
            peopleState={state.peopleState}
            leadingAction={resolving ? undefined : resolveButton}
            onLoadPeople={() =>
              void commentsActions.loadPeople(docId, services.userId)
            }
            onSubmit={({ body, mentionedUserIds }) =>
              commentsActions.reply(
                docId,
                services,
                { threadId, body, mentionedUserIds },
                now,
              )
            }
          />
          {resolving ? (
            <div className="flex flex-col gap-2 rounded-md bg-subtle p-2">
              <Segmented
                label={COMMENTS_WORDS.resolve}
                size="sm"
                value={outcome}
                options={OUTCOME_CHOICES}
                onChange={(next) => {
                  if (next === "addressed" || next === "declined")
                    setOutcome(next);
                }}
              />
              <label className="flex flex-col gap-1">
                <span className="text-meta text-fg-muted">
                  {COMMENTS_WORDS.reason}
                </span>
                <Input
                  value={reason}
                  placeholder={COMMENTS_WORDS.reasonPlaceholder}
                  aria-label={COMMENTS_WORDS.reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResolving(false)}
                >
                  {DIALOG_WORDS.cancel}
                </Button>
                <Button size="sm" onClick={confirmResolve}>
                  {COMMENTS_WORDS.resolve}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
