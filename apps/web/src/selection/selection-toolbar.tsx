// The toolbar over a selection made with the pointer in the page: it appears 150 ms after release and goes on the first
// keystroke. It reads the selection from the page's DOM, so the editor holds nothing of it.
import type { CommandId } from "@manent/commands";
import {
  Button,
  CommandButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SELECTION_WORDS,
  useCommands,
} from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useEnvironment } from "../services/context.tsx";
import { useEditorFact } from "../state/facts.store.ts";
import { SELECTION_SLOTS } from "./slots.ts";
import type { SelectionSlot } from "./slots.ts";

const SHOW_AFTER_MS = 150;
const PAGE_REGION = "[data-region='page']";
// the bar and its More menu, which is drawn outside it
const TOOLBAR = "[data-selection-toolbar]";
// with less window than this above the selection, px, the bar stands under it
const ROOM_ABOVE_PX = 48;

type Side = "above" | "below";

/** In px of the window: the bar is centred on `x`, with its bottom edge 8 px above `y`, or its top edge 8 px below. */
interface Place {
  x: number;
  y: number;
  side: Side;
}

const SHIFT: Readonly<Record<Side, string>> = Object.freeze({
  above: "translate(-50%, calc(-100% - 0.5rem))",
  below: "translate(-50%, 0.5rem)",
});

/** Where the bar stands over the window's selection; null while it is collapsed or outside the page. */
function placeOfSelection(): Place | null {
  const selection = document.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed)
    return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  if (element === null || element.closest(PAGE_REGION) === null) return null;
  const rect = range.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  return rect.top >= ROOM_ABOVE_PX
    ? { x, y: rect.top, side: "above" }
    : { x, y: rect.bottom, side: "below" };
}

const isWithin = (target: EventTarget | null, selector: string): boolean =>
  target instanceof Element && target.closest(selector) !== null;

/**
 * The place of a selection the pointer made in the page, from 150 ms after the press that made it ends, until a key
 * is pressed in the page, the pointer presses the page again, or the selection changes some other way. A change that
 * follows a press on the bar (a style redraws the selected text) moves the bar with the selection instead.
 */
function usePointerSelection(docId: string): Place | null {
  const { schedule } = useEnvironment();
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    let pressing = false;
    let fromBar = false;
    let wait: (() => void) | null = null;
    const hide = (): void => {
      wait?.();
      wait = null;
      setPlace(null);
    };
    const follow = (): void =>
      setPlace((shown) => (shown === null ? null : placeOfSelection()));
    const onPointerDown = (event: PointerEvent): void => {
      fromBar = isWithin(event.target, TOOLBAR);
      if (fromBar || !isWithin(event.target, PAGE_REGION)) return;
      pressing = true;
      hide();
    };
    const onPointerUp = (): void => {
      if (!pressing) return;
      pressing = false;
      wait = schedule(() => {
        wait = null;
        setPlace(placeOfSelection());
      }, SHOW_AFTER_MS);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isWithin(event.target, PAGE_REGION)) return;
      fromBar = false;
      hide();
    };
    const onSelectionChange = (): void => {
      // the press's own changes arrive until the wait ends, which reads the selection afresh
      if (pressing || wait !== null) return;
      if (fromBar) follow();
      else hide();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      hide();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [schedule, docId]);
  return place;
}

interface Items {
  main: readonly CommandId[];
  /** How many of `main` come before More ▾: it stands where the list's first `more` entry stands. */
  moreAt: number;
  more: readonly CommandId[];
  state: CommandId | null;
}

/** The bar's items from `slots`, keeping only the entries `isAvailable` accepts. */
function itemsOf(
  slots: readonly SelectionSlot[],
  isAvailable: (id: CommandId) => boolean,
): Items {
  const shown = slots.filter((slot) => isAvailable(slot.command));
  const idsIn = (place: SelectionSlot["place"]): CommandId[] =>
    shown.flatMap((slot) => (slot.place === place ? [slot.command] : []));
  const firstMore = slots.findIndex((slot) => slot.place === "more");
  const beforeMore = firstMore === -1 ? slots : slots.slice(0, firstMore);
  // a stable sort keeps the list's order among equal ranks
  const [state] = shown
    .filter((slot) => slot.place === "state")
    .toSorted((a, b) => a.rank - b.rank);
  return {
    main: idsIn("main"),
    moreAt: beforeMore.filter(
      (slot) => slot.place === "main" && isAvailable(slot.command),
    ).length,
    more: idsIn("more"),
    state: state?.command ?? null,
  };
}

/** Its items run their commands as a menu's do; closed, it gives focus back to the page and its selection. */
function MoreMenu(props: {
  items: readonly { id: CommandId; label: string }[];
}): ReactNode {
  const { service } = useCommands();
  const { dom } = useEnvironment();
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) dom.focusPage();
      }}
    >
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        {SELECTION_WORDS.more}
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent data-selection-toolbar="" finalFocus={false}>
        {props.items.map(({ id, label }) => (
          <DropdownMenuItem key={id} onClick={() => service.run(id, "menu")}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// a press on the bar leaves focus, and so the selection, in the page
const keepPageFocus = (event: MouseEvent): void => event.preventDefault();

const button = (id: CommandId): ReactNode => (
  <CommandButton key={id} id={id} size="sm" />
);

function Bar(props: { place: Place }): ReactNode {
  const { place } = props;
  const { service } = useCommands();
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => service.subscribe(changed), [service]);
  const { main, moreAt, more, state } = itemsOf(SELECTION_SLOTS, (id) => {
    const { visible, enabled } = service.state(id);
    return visible && enabled;
  });
  if (main.length === 0 && more.length === 0 && state === null) return null;
  return (
    <div
      role="toolbar"
      aria-label={SELECTION_WORDS.toolbar}
      data-selection-toolbar=""
      style={{ left: place.x, top: place.y, transform: SHIFT[place.side] }}
      className="fixed z-50 flex h-control-lg items-center gap-0.5 rounded-lg bg-overlay p-1 shadow-overlay ring-1 ring-line"
      onMouseDown={keepPageFocus}
    >
      {main.slice(0, moreAt).map(button)}
      {more.length === 0 ? null : (
        <MoreMenu
          items={more.map((id) => ({ id, label: service.state(id).label }))}
        />
      )}
      {main.slice(moreAt).map(button)}
      {state === null ? null : button(state)}
    </div>
  );
}

/** Drawn only while the selection the pointer made is not empty. */
export function SelectionToolbar(props: { docId: string }): ReactNode {
  const place = usePointerSelection(props.docId);
  const selectionEmpty = useEditorFact("selectionEmpty");
  return place === null || selectionEmpty ? null : <Bar place={place} />;
}
