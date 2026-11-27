// The alternates popover under a speech: its alternates, each with its writer and Use this, and a field for another.
import { Button, Input, MATERIAL_WORDS, formatCount } from "@manent/ui";
import { XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface AlternateRow {
  id: string;
  text: string;
  /** The first name of who wrote it. */
  writer: string;
  pitched: boolean;
}

export type AlternatesCloseReason = "outside" | "escape" | "button";

export interface AlternatesPopoverProps {
  rows: readonly AlternateRow[];
  /**
   * Px of the window: the popover's left, its top under the speech, and the speech's top less the gap, where its
   * bottom goes when there is no room below.
   */
  place: { left: number; top: number; above: number };
  /** What takes focus when it opens: the first alternate's Use this (the field when there is none), or the field. */
  focus: "list" | "field";
  onUse(alternateId: string): void;
  onType(text: string): void;
  onClose(reason?: AlternatesCloseReason): void;
}

// the room kept between the popover and the window's edges, px
const EDGE_PX = 8;

/** The popover's top: under the speech, else above it, else as low as the window lets it stand. */
function topOf(place: AlternatesPopoverProps["place"], height: number): number {
  const room = window.innerHeight - EDGE_PX;
  if (place.top + height <= room) return place.top;
  if (place.above - height >= EDGE_PX) return place.above - height;
  return Math.max(EDGE_PX, room - height);
}

/** The popover's left: clamped inside the viewport's horizontal margin. */
function leftOf(left: number, width: number): number {
  const maxLeft = Math.max(EDGE_PX, window.innerWidth - EDGE_PX - width);
  return Math.min(Math.max(left, EDGE_PX), maxLeft);
}

// each place Up and Down move between: the alternates' Use this, then the field
const STOP = "[data-alternate-stop]";

const stopsOf = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(STOP),
];

const focusablesOf = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled)",
  ),
];

/** Focus moved one stop `by` from the focused one, held at the first and the last. */
function moveFocus(root: HTMLElement, by: 1 | -1): void {
  const stops = stopsOf(root);
  const at = stops.findIndex((stop) => stop === document.activeElement);
  const next = stops[Math.min(Math.max(at + by, 0), stops.length - 1)];
  next?.focus();
}

/** Escape and a press outside it close it; Up and Down move through the alternates and the field. */
export function AlternatesPopover(props: AlternatesPopoverProps): ReactNode {
  const { rows, place, focus, onUse, onType, onClose } = props;
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  // after every drawing, as the speech moves with the page
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    const height = element.offsetHeight || rect.height;
    const width = element.offsetWidth || rect.width;
    element.style.top = `${topOf(place, height)}px`;
    element.style.left = `${leftOf(place.left, width)}px`;
  });

  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    const first = focus === "field" ? field.current : stopsOf(element)[0];
    first?.focus();
    // focus is given once, when it opens
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const element = root.current;
      if (event.target instanceof Node && element?.contains(event.target))
        return;
      onClose("outside");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const submitDraft = (): void => {
    const trimmed = draft.trim();
    if (trimmed === "") return;
    setDraft("");
    onType(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const element = root.current;
    if (element === null) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose("escape");
      return;
    }
    if (event.key === "Tab") {
      const items = focusablesOf(element);
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? current <= 0
          ? items.length - 1
          : current - 1
        : current === -1 || current >= items.length - 1
          ? 0
          : current + 1;
      event.preventDefault();
      items[nextIndex]?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (event.key === "ArrowDown" && document.activeElement === field.current)
        return;
      event.preventDefault();
      moveFocus(element, event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitDraft();
  };

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={MATERIAL_WORDS.alternates}
      data-open=""
      data-tour="alternates"
      className="fixed z-50 w-popover max-w-[calc(100vw-1rem)]"
      style={{
        left: place.left,
        top: place.top,
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="flex animate-in flex-col overflow-hidden rounded-surface border border-line bg-overlay text-ui text-fg shadow-overlay duration-(--dur-fast) ease-out fade-in-0 zoom-in-95"
        style={{
          maxHeight: `calc(100dvh - ${2 * EDGE_PX}px)`,
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-chrome px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-meta font-semibold text-fg">
              {MATERIAL_WORDS.alternates}
            </span>
            {rows.length > 0 ? (
              <span className="text-meta text-fg-muted tabular-nums">
                {formatCount(rows.length)}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={MATERIAL_WORDS.closeAlternates}
            onClick={() => onClose("button")}
          >
            <XIcon aria-hidden="true" className="size-icon" />
          </Button>
        </div>
        {rows.length === 0 ? null : (
          <ul className="flex min-h-0 flex-col overflow-y-auto overscroll-contain">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p id={`alternate-${row.id}`} className="break-words">
                    {row.text}
                  </p>
                  <p className="flex items-center gap-2 text-meta text-fg-muted">
                    {row.writer}
                    {row.pitched ? (
                      <span className="mn-tag">{MATERIAL_WORDS.pitched}</span>
                    ) : null}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-alternate-stop=""
                  aria-describedby={`alternate-${row.id}`}
                  onClick={() => onUse(row.id)}
                >
                  {MATERIAL_WORDS.useThis}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 border-t border-line bg-chrome px-3.5 py-2.5">
          <Input
            ref={field}
            data-alternate-stop=""
            value={draft}
            placeholder={MATERIAL_WORDS.anotherWay}
            aria-label={MATERIAL_WORDS.anotherWayName}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onFieldKeyDown}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={draft.trim() === ""}
            onClick={submitDraft}
          >
            {MATERIAL_WORDS.addAlternate}
          </Button>
        </div>
      </div>
    </div>
  );
}
