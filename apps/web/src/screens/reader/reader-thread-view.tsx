// Reader thread view inside ReaderCommentPopover: archival CommentPopover anatomy with inline Resolve, avatars and RTL quote.
import type { CommentOutcome, CommentThread } from "@manent/crdt";
import type { Choice } from "@manent/settings";
import {
  Avatar,
  Button,
  COMMENTS_WORDS,
  DIALOG_WORDS,
  Input,
  READER_WORDS,
  SHARING_WORDS,
  Segmented,
} from "@manent/ui";
import { MessageSquareIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  dayTimeLabel,
  fullNameFor,
  resolvedLineLabel,
} from "../../comments/comments-format.ts";
import { MentionField } from "../../comments/mention-field.tsx";
import { BodyText } from "../../comments/thread-body.tsx";
import { initialsOf } from "../../initials.ts";
import type {
  ReaderCommentsSession,
  ReaderCommentsState,
} from "../../reader/reader-comments.ts";

const OUTCOME_CHOICES: readonly Choice<CommentOutcome>[] = [
  { value: "addressed", label: COMMENTS_WORDS.addressed },
  { value: "declined", label: COMMENTS_WORDS.declined },
];

export function ReaderThreadView(props: {
  threadId: string;
  thread: CommentThread;
  state: ReaderCommentsState;
  session: ReaderCommentsSession;
  userId: string;
  now(): number;
  onStartAnother?(): void;
  onClose(): void;
}): ReactNode {
  const {
    threadId,
    thread,
    state,
    session,
    userId,
    now,
    onStartAnother,
    onClose,
  } = props;
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState<CommentOutcome>("addressed");
  const [reason, setReason] = useState("");
  const currentNow = now();
  const itemEntries = Object.entries(state.items)
    .filter(([, item]) => item.threadId === threadId)
    .toSorted(([, a], [, b]) => a.createdAt - b.createdAt);
  const firstEntry = itemEntries[0];
  const replyEntries = itemEntries.slice(1);
  const authorFull = fullNameFor(thread.authorUserId, state.people);
  const inRoundOutcome =
    thread.roundId !== null && thread.authorUserId === userId;

  const confirmResolve = (): void => {
    session.resolve({
      threadId,
      outcome: inRoundOutcome ? outcome : null,
      reason: inRoundOutcome ? reason : null,
    });
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
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={authorFull}
            initials={initialsOf(authorFull)}
            colour={null}
            size="md"
            decorative
          />
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate text-ui font-semibold text-fg">
              <MessageSquareIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-attention"
              />
              <span className="truncate">{authorFull}</span>
            </span>
            <span className="truncate text-meta text-fg-muted">
              {dayTimeLabel(thread.createdAt, currentNow)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={SHARING_WORDS.close}
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      {thread.anchor !== null && thread.anchor.quote !== "" ? (
        <blockquote className="mn-comment-quote line-clamp-2 ps-2 text-meta text-fg-muted">
          {thread.anchor.quote}
        </blockquote>
      ) : null}

      {firstEntry === undefined ? null : (
        <BodyText
          body={firstEntry[1].body}
          mentionedUserIds={firstEntry[1].mentionedUserIds}
          people={state.people}
        />
      )}

      {replyEntries.length === 0 ? null : (
        <ul className="flex flex-col gap-2.5 border-t border-line pt-2.5">
          {replyEntries.map(([itemId, reply]) => {
            const replyAuthor = fullNameFor(reply.authorUserId, state.people);
            return (
              <li key={itemId} className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Avatar
                    name={replyAuthor}
                    initials={initialsOf(replyAuthor)}
                    colour={null}
                    size="sm"
                    decorative
                  />
                  <span className="truncate text-meta text-fg-muted">
                    {COMMENTS_WORDS.authorMeta(
                      replyAuthor,
                      dayTimeLabel(reply.createdAt, currentNow),
                    )}
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
        <div className="flex flex-col gap-2 border-t border-line pt-2.5">
          <p className="text-meta text-fg-muted">
            {resolvedLineLabel(thread, state.people, currentNow)}
          </p>
          {thread.state.reason === null || thread.state.reason === "" ? null : (
            <p className="text-ui text-fg-muted">{thread.state.reason}</p>
          )}
          {state.canComment ? (
            <div className="flex justify-end gap-2">
              {onStartAnother !== undefined ? (
                <Button variant="ghost" size="sm" onClick={onStartAnother}>
                  {READER_WORDS.addAnotherComment}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => session.reopen(threadId)}
              >
                {COMMENTS_WORDS.reopen}
              </Button>
            </div>
          ) : null}
        </div>
      ) : state.canComment ? (
        <div className="flex flex-col gap-2 border-t border-line pt-2.5">
          {resolving ? (
            <div className="flex flex-col gap-2 rounded-control bg-subtle p-2.5">
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
          ) : (
            <MentionField
              placeholder={COMMENTS_WORDS.replyPlaceholder}
              submitLabel={COMMENTS_WORDS.reply}
              mentions
              people={state.people}
              peopleState={state.peopleState}
              leadingAction={resolveButton}
              onLoadPeople={() => void session.loadPeople()}
              onSubmit={({ body, mentionedUserIds }) =>
                session.reply({ threadId, body, mentionedUserIds })
              }
            />
          )}
          {onStartAnother !== undefined && !resolving ? (
            <div className="flex justify-start">
              <Button
                variant="ghost"
                size="sm"
                onClick={onStartAnother}
                className="text-meta text-fg-muted hover:text-fg"
              >
                {READER_WORDS.addAnotherComment}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
