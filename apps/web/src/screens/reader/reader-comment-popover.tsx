// Anchored comment composer and thread popover for the reader frame; never exposes writer-only notes.
import type { TextAnchor } from "@manent/schema";
import { Button, COMMENTS_WORDS, SHARING_WORDS } from "@manent/ui";
import { MessageSquareIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { MentionField } from "../../comments/mention-field.tsx";
import type { ReaderCommentsSession } from "../../reader/reader-comments.ts";
import { ReaderThreadView } from "./reader-thread-view.tsx";

export type ReaderPopoverMode =
  | {
      readonly kind: "comment";
      readonly anchor: TextAnchor;
      readonly place: { readonly left: number; readonly top: number };
    }
  | {
      readonly kind: "thread";
      readonly id: string;
      readonly anchor?: TextAnchor;
      readonly place: { readonly left: number; readonly top: number };
    };

const EDGE_PX = 8;

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
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement ? active : null;
    return () => {
      const target = returnFocusRef.current;
      if (target !== null && target.isConnected) {
        target.focus({ preventScroll: true });
      }
    };
  }, []);

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
      event.stopPropagation();
      onClose();
    }
  };

  if (mode.kind === "comment" && !state.canComment) return null;

  let body: ReactNode = null;
  if (mode.kind === "comment") {
    body = (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-ui font-semibold text-fg">
            <MessageSquareIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-attention"
            />
            <span>{COMMENTS_WORDS.commentLabel}</span>
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
          <blockquote className="mn-comment-quote line-clamp-2 ps-2 text-meta text-fg-muted">
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
              onSwitchMode({
                kind: "thread",
                id: threadId,
                anchor: mode.anchor,
                place: mode.place,
              });
          }}
        />
      </div>
    );
  } else {
    const thread = state.threads[mode.id];
    if (thread === undefined) return null;
    const anchorForNew = mode.anchor ?? thread.anchor;
    body = (
      <ReaderThreadView
        threadId={mode.id}
        thread={thread}
        state={state}
        session={session}
        userId={userId}
        now={now}
        onStartAnother={
          anchorForNew !== null
            ? () =>
                onSwitchMode({
                  kind: "comment",
                  anchor: anchorForNew,
                  place: mode.place,
                })
            : undefined
        }
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
      data-popup-open=""
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
