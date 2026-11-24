// Anchored popover (data-tour="comment_popover") for composing/reading comments and writer-only notes.
import { Button, COMMENTS_WORDS, SHARING_WORDS } from "@manent/ui";
import { XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { PersonServices } from "../services/ports.ts";
import { commentsActions, useComments } from "../state/comments.store.ts";
import { dayTimeLabel } from "./comments-format.ts";
import type { PopoverMode } from "./comments-types.ts";
import { MentionField } from "./mention-field.tsx";
import { ThreadBody } from "./thread-body.tsx";

export interface CommentPopoverProps {
  docId: string;
  mode: PopoverMode;
  services: PersonServices;
  writerName: string;
  now(): number;
  onSwitchMode(mode: PopoverMode): void;
  onClose(): void;
}

const EDGE_PX = 8;

export function CommentPopover(props: CommentPopoverProps): ReactNode {
  const { docId, mode, services, writerName, now, onSwitchMode, onClose } =
    props;
  const state = useComments(docId);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = Math.max(EDGE_PX, window.innerWidth - rect.width - EDGE_PX);
    const maxTop = Math.max(
      EDGE_PX,
      window.innerHeight - rect.height - EDGE_PX,
    );
    const left = Math.max(EDGE_PX, Math.min(mode.place.left, maxLeft));
    const top = Math.max(EDGE_PX, Math.min(mode.place.top, maxTop));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
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
  if (mode.kind === "note" && !state.canEdit) return null;

  const heading =
    mode.kind === "note"
      ? COMMENTS_WORDS.noteLabel
      : COMMENTS_WORDS.commentLabel;

  let body: ReactNode = null;
  if (mode.kind === "comment") {
    body = (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-label font-medium text-fg">
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
        {mode.anchor === null ? (
          <p className="text-meta text-fg-muted">
            {COMMENTS_WORDS.wholeScript}
          </p>
        ) : mode.anchor.quote !== "" ? (
          <blockquote className="border-l-2 border-line-strong pl-2 text-meta text-fg-muted">
            {mode.anchor.quote}
          </blockquote>
        ) : null}
        <MentionField
          placeholder={COMMENTS_WORDS.composerPlaceholder}
          submitLabel={COMMENTS_WORDS.post}
          autoFocus
          mentions
          people={state.people}
          peopleState={state.peopleState}
          onLoadPeople={() =>
            void commentsActions.loadPeople(docId, services.userId)
          }
          onSubmit={({ body: text, mentionedUserIds }) => {
            const threadId = commentsActions.startComment(
              docId,
              services,
              {
                anchor: mode.anchor,
                roundId: null,
                body: text,
                mentionedUserIds,
              },
              now,
            );
            if (threadId !== null)
              onSwitchMode({ kind: "thread", id: threadId, place: mode.place });
          }}
        />
      </div>
    );
  } else if (mode.kind === "note") {
    body = (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-label font-medium text-fg">
              {COMMENTS_WORDS.noteLabel}
            </span>
            <span className="mn-tag">{COMMENTS_WORDS.writersOnly}</span>
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
        {mode.anchor.quote !== "" ? (
          <blockquote className="border-l-2 border-line-strong pl-2 text-meta text-fg-muted">
            {mode.anchor.quote}
          </blockquote>
        ) : null}
        <MentionField
          placeholder={COMMENTS_WORDS.notePlaceholder}
          submitLabel={COMMENTS_WORDS.saveNote}
          autoFocus
          mentions={false}
          people={state.people}
          peopleState={state.peopleState}
          onSubmit={({ body: text }) => {
            commentsActions.addNote(
              docId,
              writerName,
              { anchor: mode.anchor, text },
              now,
            );
            onClose();
          }}
        />
      </div>
    );
  } else {
    const thread = state.threads[mode.id];
    if (thread !== undefined) {
      body = (
        <ThreadBody
          docId={docId}
          threadId={mode.id}
          thread={thread}
          state={state}
          services={services}
          now={now}
          onClose={onClose}
        />
      );
    } else if (state.canEdit) {
      const note = state.notes.find((n) => n.id === mode.id);
      if (note === undefined) return null;
      const removed =
        note.note.anchor !== null && state.removedIds.has(note.id);
      body = (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-label font-medium text-fg">
                {COMMENTS_WORDS.noteLabel}
              </span>
              <span className="mn-tag">{COMMENTS_WORDS.writersOnly}</span>
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
          {note.note.writerName !== null && note.note.at !== null ? (
            <p className="text-meta text-fg-muted">
              {COMMENTS_WORDS.authorMeta(
                note.note.writerName.split(" ")[0] ?? note.note.writerName,
                dayTimeLabel(note.note.at, now()),
              )}
            </p>
          ) : null}
          {removed ? (
            <p className="text-meta text-fg-muted">
              {COMMENTS_WORDS.textRemoved}
            </p>
          ) : null}
          {note.note.anchor !== null && note.note.anchor.quote !== "" ? (
            <blockquote className="border-l-2 border-line-strong pl-2 text-meta text-fg-muted">
              {note.note.anchor.quote}
            </blockquote>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-ui text-fg">
            {note.note.text}
          </p>
        </div>
      );
    } else {
      return null;
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={heading}
      data-open=""
      data-tour="comment_popover"
      className="fixed z-50 flex w-popover flex-col overflow-y-auto rounded-lg bg-overlay text-ui text-fg shadow-overlay ring-1 ring-line"
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
