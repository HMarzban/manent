// Ghost follow strip below the Scenes toolbar and gentle auto-follow scrolling for the Cards view.
import { Button, SCENE_MOVE_WORDS } from "@manent/ui";
import { CornerDownLeftIcon, EyeIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useServices } from "../services/context.tsx";
import {
  useCurrentOutlineId,
  useViewedOutlineId,
} from "../state/outline.store.ts";
import type { OutlineRow } from "../state/outline.store.ts";

const MANUAL_SCROLL_PAUSE_MS = 2500;
const CARD_PADDING_PX = 16;

function shortPlace(row: OutlineRow): string {
  if (row.kind === "scene" && row.number !== null)
    return SCENE_MOVE_WORDS.shortScene(row.number);
  return row.heading;
}

/**
 * Whisper-quiet strip shown under the Scenes toolbar only while the editor viewport is scrolled
 * away from the caret's scene: names the scene in view and offers one-click return to the caret.
 */
export function GhostFollowBar(props: {
  rows: readonly OutlineRow[];
}): ReactNode {
  const { rows } = props;
  const { editor } = useServices();
  const viewedId = useViewedOutlineId();
  const currentId = useCurrentOutlineId();
  if (viewedId === null || viewedId === currentId) return null;
  const viewedRow = rows.find((row) => row.blockId === viewedId) ?? null;
  if (viewedRow === null) return null;
  const currentRow =
    currentId === null
      ? null
      : (rows.find((row) => row.blockId === currentId) ?? null);
  return (
    <div
      data-ghost-follow=""
      className="flex items-center gap-1.5 border-b border-line bg-subtle px-3 py-1 text-meta text-fg-muted"
    >
      <EyeIcon aria-hidden="true" className="size-3 shrink-0 text-fg-accent" />
      <span className="min-w-0 flex-1 truncate tabular-nums">
        {SCENE_MOVE_WORDS.viewing(shortPlace(viewedRow))}
      </span>
      {currentRow === null ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 shrink-0 gap-1 px-1.5 text-micro font-medium text-fg-accent"
          onClick={() =>
            void editor.run({
              kind: "go_to",
              blockId: currentRow.blockId,
              offset: 0,
            })
          }
        >
          <CornerDownLeftIcon aria-hidden="true" className="size-3" />
          {SCENE_MOVE_WORDS.backTo(shortPlace(currentRow))}
        </Button>
      )}
    </div>
  );
}

/** Gently scrolls `containerRef` so the card matching `blockId` stays in view unless the person is interacting with it. */
export function useCardAutoFollow(
  containerRef: RefObject<HTMLDivElement | null>,
  blockId: string | null,
): void {
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const manualPauseUntilRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const onEnter = (): void => {
      pointerInsideRef.current = true;
    };
    const onLeave = (): void => {
      pointerInsideRef.current = false;
    };
    const onFocusIn = (): void => {
      focusInsideRef.current = true;
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (!container.contains(event.relatedTarget as Node | null))
        focusInsideRef.current = false;
    };
    const pause = (): void => {
      manualPauseUntilRef.current = Date.now() + MANUAL_SCROLL_PAUSE_MS;
    };
    container.addEventListener("pointerenter", onEnter);
    container.addEventListener("pointerleave", onLeave);
    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("focusout", onFocusOut);
    container.addEventListener("wheel", pause, { passive: true });
    container.addEventListener("touchmove", pause, { passive: true });
    return () => {
      container.removeEventListener("pointerenter", onEnter);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
      container.removeEventListener("wheel", pause);
      container.removeEventListener("touchmove", pause);
    };
  }, [containerRef]);

  useEffect(() => {
    if (blockId === null) return;
    const container = containerRef.current;
    if (
      container === null ||
      pointerInsideRef.current ||
      focusInsideRef.current ||
      Date.now() < manualPauseUntilRef.current ||
      container.querySelector("[data-dragging]") !== null
    )
      return;
    const escaped = typeof CSS !== "undefined" ? CSS.escape(blockId) : blockId;
    const card = container.querySelector<HTMLElement>(
      `[data-outline-id="${escaped}"]`,
    );
    if (card === null) return;
    const box = container.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    let targetTop: number | null = null;
    if (cardBox.top < box.top + CARD_PADDING_PX)
      targetTop = Math.max(
        0,
        container.scrollTop + (cardBox.top - box.top - CARD_PADDING_PX),
      );
    else if (cardBox.bottom > box.bottom - CARD_PADDING_PX)
      targetTop = Math.max(
        0,
        container.scrollTop + (cardBox.bottom - box.bottom + CARD_PADDING_PX),
      );
    if (targetTop === null) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    container.scrollTo({
      top: targetTop,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [containerRef, blockId]);
}
