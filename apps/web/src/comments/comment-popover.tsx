// Anchored popover (data-tour="comment_popover") for composing/reading comments and writer-only notes.
import { Button, COMMENTS_WORDS, SHARING_WORDS } from "@manent/ui";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  StickyNoteIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { PersonServices } from "../services/ports.ts";
import { useComments } from "../state/comments.store.ts";
import { AnnotationStrip, blockItemsOf } from "./annotation-strip.tsx";
import type { PopoverMode } from "./comments-types.ts";
import { CommentCompose, NoteBody, NoteCompose } from "./popover-bodies.tsx";
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

interface SwitcherState {
  index: number;
  total: number;
  onPrevious(): void;
  onNext(): void;
}

function BlockSwitcher(props: SwitcherState): ReactNode {
  const { index, total, onPrevious, onNext } = props;
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={COMMENTS_WORDS.previous}
        onClick={onPrevious}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <span className="px-1 text-micro text-fg-muted tabular-nums">
        {COMMENTS_WORDS.positionOf(index + 1, total)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={COMMENTS_WORDS.next}
        onClick={onNext}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function PopoverHeader(props: {
  isNote: boolean;
  isCompose: boolean;
  switcher: SwitcherState | null;
  onClose(): void;
}): ReactNode {
  const { isNote, isCompose, switcher, onClose } = props;
  return (
    <div
      className={
        isNote
          ? "flex shrink-0 items-center justify-between gap-2 rounded-t-lg border-b border-line bg-subtle px-3 py-2"
          : "flex shrink-0 items-center justify-between gap-2 px-3 pt-3"
      }
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {isNote ? (
          <>
            <StickyNoteIcon
              aria-hidden="true"
              className="size-icon shrink-0 text-fg-muted"
            />
            <span className="text-ui font-semibold text-fg">
              {COMMENTS_WORDS.noteLabel}
            </span>
            <span className="mn-tag">{COMMENTS_WORDS.writersOnly}</span>
          </>
        ) : (
          <>
            <MessageSquareIcon
              aria-hidden="true"
              className="size-icon shrink-0 text-attention"
            />
            <span
              className={
                isCompose
                  ? "text-ui font-semibold text-fg"
                  : "text-micro font-medium text-fg-muted"
              }
            >
              {COMMENTS_WORDS.commentLabel}
            </span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {switcher !== null ? <BlockSwitcher {...switcher} /> : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={SHARING_WORDS.close}
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function CommentPopover(props: CommentPopoverProps): ReactNode {
  const { docId, mode, services, writerName, now, onSwitchMode, onClose } =
    props;
  const state = useComments(docId);
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    if (mode.kind === "thread") {
      rootRef.current?.focus({ preventScroll: true });
    }
    return () => {
      const opener = openerRef.current;
      if (opener !== null && opener.isConnected) {
        opener.focus({ preventScroll: true });
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
      event.stopPropagation();
      onClose();
    }
  };

  if (mode.kind === "comment" && !state.canComment) return null;
  if (mode.kind === "note" && !state.canEdit) return null;

  const thread = mode.kind === "thread" ? state.threads[mode.id] : undefined;
  const note =
    mode.kind === "thread" && thread === undefined && state.canEdit
      ? state.notes.find((n) => n.id === mode.id)
      : undefined;

  if (mode.kind === "thread" && thread === undefined && note === undefined)
    return null;

  const activeBlockIds =
    mode.kind === "thread" && mode.blockIds !== undefined
      ? mode.blockIds.filter(
          (id) =>
            id === mode.id ||
            state.threads[id]?.state.kind === "open" ||
            (state.canEdit && state.notes.some((n) => n.id === id)),
        )
      : [];
  const blockItems =
    mode.kind === "thread" && activeBlockIds.length > 1
      ? blockItemsOf(activeBlockIds, state)
      : [];
  const selectBlockItem = (id: string): void => {
    if (mode.kind !== "thread" || id === mode.id) return;
    onSwitchMode({
      kind: "thread",
      id,
      blockIds: activeBlockIds,
      place: mode.place,
    });
  };
  const switcherIndex =
    mode.kind === "thread" ? activeBlockIds.indexOf(mode.id) : -1;
  const switcher: SwitcherState | null =
    mode.kind === "thread" && activeBlockIds.length > 1 && switcherIndex !== -1
      ? {
          index: switcherIndex,
          total: activeBlockIds.length,
          onPrevious: () =>
            selectBlockItem(
              activeBlockIds[
                (switcherIndex - 1 + activeBlockIds.length) %
                  activeBlockIds.length
              ]!,
            ),
          onNext: () =>
            selectBlockItem(
              activeBlockIds[(switcherIndex + 1) % activeBlockIds.length]!,
            ),
        }
      : null;

  const isNote = mode.kind === "note" || note !== undefined;
  const heading = isNote
    ? COMMENTS_WORDS.noteLabel
    : COMMENTS_WORDS.commentLabel;

  let body: ReactNode = null;
  if (mode.kind === "comment") {
    body = (
      <CommentCompose
        key={`${mode.anchor?.blockId ?? "script"}:${mode.anchor?.start ?? 0}`}
        docId={docId}
        mode={mode}
        state={state}
        services={services}
        now={now}
        onSwitchMode={onSwitchMode}
      />
    );
  } else if (mode.kind === "note") {
    body = (
      <NoteCompose
        key={`${mode.anchor.blockId}:${mode.anchor.start}`}
        docId={docId}
        mode={mode}
        state={state}
        writerName={writerName}
        now={now}
        onClose={onClose}
      />
    );
  } else if (thread !== undefined) {
    body = (
      <ThreadBody
        key={mode.id}
        docId={docId}
        threadId={mode.id}
        thread={thread}
        state={state}
        services={services}
        now={now}
        onClose={onClose}
      />
    );
  } else if (note !== undefined) {
    body = <NoteBody key={mode.id} note={note} state={state} now={now} />;
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
      aria-label={heading}
      data-open=""
      data-popup-open=""
      data-tour="comment_popover"
      className="fixed z-50 flex w-popover max-w-[calc(100vw-1rem)] animate-in flex-col overflow-y-auto overscroll-contain rounded-lg bg-overlay text-ui text-fg shadow-overlay ring-1 ring-line outline-none duration-(--dur-fast) ease-out fade-in-0 zoom-in-95"
      style={{
        left: mode.place.left,
        top: mode.place.top,
        maxHeight: `calc(100dvh - ${2 * EDGE_PX}px)`,
      }}
      onKeyDown={onKeyDown}
    >
      <PopoverHeader
        isNote={isNote}
        isCompose={mode.kind === "comment" || mode.kind === "note"}
        switcher={switcher}
        onClose={onClose}
      />
      {blockItems.length > 1 && mode.kind === "thread" ? (
        <AnnotationStrip
          items={blockItems}
          activeId={mode.id}
          onSelect={selectBlockItem}
        />
      ) : null}
      {body}
    </div>
  );
}
