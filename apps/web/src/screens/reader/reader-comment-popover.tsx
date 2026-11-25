// Anchored comment composer and thread popover for the reader frame; never exposes writer-only notes.
import type { CommentOutcome, CommentThread } from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";
import type { Choice } from "@manent/settings";
import {
  Avatar,
  Button,
  COMMENTS_WORDS,
  DIALOG_WORDS,
  Input,
  SHARING_WORDS,
  Segmented,
} from "@manent/ui";
import { XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  dayTimeLabel,
  fullNameFor,
  resolvedLineLabel,
  threadItemsOf,
} from "../../comments/comments-format.ts";
import { MentionField } from "../../comments/mention-field.tsx";
import { BodyText } from "../../comments/thread-body.tsx";
import { initialsOf } from "../../initials.ts";
import type {
  ReaderCommentsSession,
  ReaderCommentsState,
} from "../../reader/reader-comments.ts";

export type ReaderPopoverMode =
  | {
      readonly kind: "comment";
      readonly anchor: TextAnchor;
      readonly place: { readonly left: number; readonly top: number };
    }
  | {
      readonly kind: "thread";
      readonly id: string;
      readonly place: { readonly left: number; readonly top: number };
    };

const EDGE_PX = 8;

const OUTCOME_CHOICES: readonly Choice<CommentOutcome>[] = [
  { value: "addressed", label: COMMENTS_WORDS.addressed },
  { value: "declined", label: COMMENTS_WORDS.declined },
];

function ReaderThreadView(props: {
  threadId: string;
  thread: CommentThread;
  state: ReaderCommentsState;
  session: ReaderCommentsSession;
  userId: string;
  now(): number;
  onClose(): void;
}): ReactNode {
  const { threadId, thread, state, session, userId, now, onClose } = props;
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState<CommentOutcome>("addressed");
  const [reason, setReason] = useState("");
  const currentNow = now();
  const items = threadItemsOf(threadId, state.items);
  const [first, ...replies] = items;
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

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={authorFull}
            initials={initialsOf(authorFull)}
            colour={null}
            size="sm"
            decorative
          />
          <span className="truncate text-meta text-fg-muted">
            {COMMENTS_WORDS.authorMeta(
              authorFull,
              dayTimeLabel(thread.createdAt, currentNow),
            )}
          </span>
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
        <blockquote className="border-l-2 border-line-strong pl-2 text-meta text-fg-muted">
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
          {replies.map((reply) => (
            <li
              key={reply.createdAt + reply.authorUserId}
              className="flex flex-col gap-1"
            >
              <span className="text-meta text-fg-muted">
                {COMMENTS_WORDS.authorMeta(
                  fullNameFor(reply.authorUserId, state.people),
                  dayTimeLabel(reply.createdAt, currentNow),
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
                onClick={() => session.reopen(threadId)}
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
            onLoadPeople={() => void session.loadPeople()}
            onSubmit={({ body, mentionedUserIds }) =>
              session.reply({ threadId, body, mentionedUserIds })
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
          ) : (
            <div className="flex justify-start">
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
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ReaderCommentPopover(props: {
  session: ReaderCommentsSession;
  mode: ReaderPopoverMode;
  userId: string;
  now(): number;
  onSwitchMode(mode: ReaderPopoverMode): void;
  onClose(): void;
}): ReactNode {
  const { session, mode, userId, now, onSwitchMode, onClose } = props;
  const subscribe = useCallback(
    (listener: () => void) => session.subscribe(listener),
    [session],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => session.getState(),
    () => session.getState(),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el === null) return;
    const width = el.offsetWidth || el.getBoundingClientRect().width;
    const height = el.offsetHeight || el.getBoundingClientRect().height;
    const maxLeft = Math.max(EDGE_PX, window.innerWidth - width - EDGE_PX);
    const maxTop = Math.max(EDGE_PX, window.innerHeight - height - EDGE_PX);
    el.style.left = `${Math.max(EDGE_PX, Math.min(mode.place.left, maxLeft))}px`;
    el.style.top = `${Math.max(EDGE_PX, Math.min(mode.place.top, maxTop))}px`;
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const el = rootRef.current;
      if (event.target instanceof Node && el?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  if (mode.kind === "comment" && !state.canComment) return null;

  let body: ReactNode = null;
  if (mode.kind === "comment") {
    body = (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ui font-medium text-fg">
            {COMMENTS_WORDS.commentLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={SHARING_WORDS.close}
            onClick={onClose}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        {mode.anchor.quote !== "" ? (
          <blockquote className="border-l-2 border-line-strong pl-2 text-meta text-fg-muted">
            {mode.anchor.quote}
          </blockquote>
        ) : null}
        <MentionField
          placeholder={COMMENTS_WORDS.composerPlaceholder}
          submitLabel={COMMENTS_WORDS.commentLabel}
          autoFocus
          mentions
          people={state.people}
          peopleState={state.peopleState}
          onLoadPeople={() => void session.loadPeople()}
          onSubmit={({ body: text, mentionedUserIds }) => {
            const threadId = session.startComment({
              anchor: mode.anchor,
              body: text,
              mentionedUserIds,
            });
            if (threadId !== null)
              onSwitchMode({ kind: "thread", id: threadId, place: mode.place });
          }}
        />
      </div>
    );
  } else {
    const thread = state.threads[mode.id];
    if (thread === undefined) return null;
    body = (
      <ReaderThreadView
        threadId={mode.id}
        thread={thread}
        state={state}
        session={session}
        userId={userId}
        now={now}
        onClose={onClose}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={COMMENTS_WORDS.commentLabel}
      data-open=""
      data-tour="comment_popover"
      className="fixed z-50 flex w-popover max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-lg bg-overlay text-ui text-fg shadow-overlay ring-1 ring-line animate-in fade-in-0 zoom-in-95 duration-(--dur-fast) ease-out"
      style={{
        left: mode.place.left,
        top: mode.place.top,
        maxHeight: `calc(100dvh - ${2 * EDGE_PX}px)`,
      }}
      onKeyDown={onKeyDown}
    >
      {body}
    </div>
  );
}
