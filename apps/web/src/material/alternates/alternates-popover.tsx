// The alternates popover under a speech: its alternates, each with its writer and Use this, and a field for another.
import { Button, Input, MATERIAL_WORDS } from "@manent/ui";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface AlternateRow {
  id: string;
  text: string;
  /** The first name of who wrote it. */
  writer: string;
  pitched: boolean;
}

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
  onClose(): void;
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

// each place Up and Down move between: the alternates' Use this, then the field
const STOP = "[data-alternate-stop]";

const stopsOf = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(STOP),
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

  // after every drawing, as the speech moves with the page
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) return;
    const top = topOf(place, element.getBoundingClientRect().height);
    element.style.top = `${top}px`;
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
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const element = root.current;
    if (element === null) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(element, event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const text = event.currentTarget.value;
    if (text !== "") onType(text);
  };

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={MATERIAL_WORDS.alternates}
      data-open=""
      data-tour="alternates"
      className="fixed z-50 flex w-popover flex-col overflow-hidden rounded-lg bg-overlay text-ui text-fg shadow-overlay ring-1 ring-line"
      style={{
        left: place.left,
        top: place.top,
        maxHeight: `calc(100dvh - ${2 * EDGE_PX}px)`,
      }}
      onKeyDown={onKeyDown}
    >
      {rows.length === 0 ? null : (
        <ul className="flex min-h-0 flex-col overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start gap-3 border-b border-line px-4 py-3"
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
      <div className="bg-chrome px-4 py-3">
        <Input
          ref={field}
          data-alternate-stop=""
          placeholder={MATERIAL_WORDS.anotherWay}
          aria-label={MATERIAL_WORDS.anotherWayName}
          onKeyDown={onFieldKeyDown}
        />
      </div>
    </div>
  );
}
