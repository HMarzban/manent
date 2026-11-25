// The toolbar over a selection made with the pointer in the page: it appears 150 ms after release and goes on the first
// keystroke or an outside press. It reads the selection's place from the DOM and its marks through selection-marks.
import type { CommandId } from "@manent/commands";
import { CommandButton, SELECTION_WORDS, useCommands } from "@manent/ui";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
} from "react";
import type {
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { readSelectionMarks } from "../editor-host/selection-marks.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { FactsContext } from "../state/bridge-contexts.ts";
import { useEditorFact } from "../state/facts.store.ts";
import { MoreMenu } from "./more-menu.tsx";
import {
  ICON_ONLY_COMMANDS,
  iconForCommand,
  isCommandActive,
} from "./selection-icons.tsx";
import { EDGE_PX, SHIFT, usePointerSelection } from "./selection-position.ts";
import type { Place } from "./selection-position.ts";
import { SELECTION_SLOTS } from "./slots.ts";
import type {
  SelectionActionContext,
  SelectionCommandSlot,
  SelectionSlot,
} from "./slots.ts";

interface Items {
  main: readonly CommandId[];
  /** How many of `main` come before More: it stands where the list's first `more` entry stands. */
  moreAt: number;
  more: readonly SelectionSlot[];
  state: CommandId | null;
}

const isCommandSlot = (slot: SelectionSlot): slot is SelectionCommandSlot =>
  "command" in slot;

/** The bar's items from `slots`, keeping only the entries `isAvailable` or `actionContext` accepts. */
function itemsOf(
  slots: readonly SelectionSlot[],
  isAvailable: (id: CommandId) => boolean,
  actionContext: SelectionActionContext | null,
): Items {
  const keeps = (slot: SelectionSlot): boolean =>
    isCommandSlot(slot)
      ? isAvailable(slot.command)
      : actionContext !== null && slot.available(actionContext);
  const shown = slots.filter(keeps);
  const commandIdsIn = (place: SelectionCommandSlot["place"]): CommandId[] =>
    shown.flatMap((slot) =>
      isCommandSlot(slot) && slot.place === place ? [slot.command] : [],
    );
  const firstMore = slots.findIndex((slot) => slot.place === "more");
  const beforeMore = firstMore === -1 ? slots : slots.slice(0, firstMore);
  // a stable sort keeps the list's order among equal ranks
  const [state] = shown
    .filter(
      (slot): slot is SelectionCommandSlot =>
        isCommandSlot(slot) && slot.place === "state",
    )
    .toSorted((a, b) => a.rank - b.rank);
  return {
    main: commandIdsIn("main"),
    moreAt: beforeMore.filter(
      (slot) =>
        isCommandSlot(slot) &&
        slot.place === "main" &&
        isAvailable(slot.command),
    ).length,
    more: shown.filter((slot) => slot.place === "more"),
    state: state?.command ?? null,
  };
}

// a press on the bar leaves focus, and so the selection, in the page
const keepPageFocus = (event: MouseEvent): void => event.preventDefault();

const divider = (): ReactNode => (
  <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-line" />
);

const toolbarButtons = (root: HTMLElement): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
];

function syncTabStops(
  root: HTMLElement,
  active: HTMLButtonElement | null = null,
): void {
  const buttons = toolbarButtons(root);
  if (buttons.length === 0) return;
  const chosen =
    (active !== null && buttons.includes(active) ? active : null) ??
    buttons.find((item) => item.tabIndex === 0) ??
    buttons[0];
  for (const item of buttons) item.tabIndex = item === chosen ? 0 : -1;
}

function Bar(props: { docId: string; place: Place }): ReactNode {
  const { docId, place } = props;
  const { service } = useCommands();
  const services = useServices();
  const environment = useEnvironment();
  const facts = useContext(FactsContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const stops = [service.subscribe(changed)];
    if (facts !== null) {
      stops.push(
        facts.subscribe("selectedText", changed),
        facts.subscribe("blockId", changed),
        facts.subscribe("blockAlign", changed),
        facts.subscribe("blockSpaceBeforeSet", changed),
      );
    }
    return () => {
      for (const stop of stops) stop();
    };
  }, [service, facts]);

  const marks = readSelectionMarks(docId);
  const actionContext: SelectionActionContext | null =
    facts === null ? null : { docId, services, environment, facts };
  const { main, moreAt, more, state } = itemsOf(
    SELECTION_SLOTS,
    (id) => {
      const { visible, enabled } = service.state(id);
      return visible && enabled;
    },
    actionContext,
  );
  const itemsKey = `${main.join(",")}|${more.length > 0 ? "m" : ""}|${state ?? ""}`;
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el === null) return;
    const width = el.offsetWidth || el.getBoundingClientRect().width;
    const half = width / 2;
    const minLeft = EDGE_PX + half;
    const maxLeft = Math.max(minLeft, window.innerWidth - EDGE_PX - half);
    el.style.left = `${Math.min(Math.max(place.x, minLeft), maxLeft)}px`;
    syncTabStops(el);
  }, [place.x, itemsKey]);
  if (main.length === 0 && more.length === 0 && state === null) return null;

  const refreshMarks = (): void => {
    queueMicrotask(changed);
  };
  const leadingMain = main.slice(0, moreAt);
  const trailingMain = main.slice(moreAt);
  const hasLeading = leadingMain.length > 0 || more.length > 0;
  const hasTrailing = trailingMain.length > 0;

  const barButton = (id: CommandId): ReactNode => (
    <CommandButton
      key={id}
      id={id}
      size="sm"
      icon={iconForCommand(id)}
      iconOnly={ICON_ONLY_COMMANDS.has(id)}
      pressed={isCommandActive(id, marks, facts)}
    />
  );

  // capture so a focus-opened tooltip on a toolbar button does not swallow Escape before focus returns to the page
  const onKeyDownCapture = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key !== "Escape") return;
    const root = rootRef.current;
    const active = event.target;
    if (root === null || !(active instanceof Element) || !root.contains(active))
      return;
    if (active.getAttribute("aria-expanded") === "true") return;
    event.preventDefault();
    event.stopPropagation();
    environment.dom.focusPage();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    const active = event.target;
    if (
      root === null ||
      !(active instanceof HTMLButtonElement) ||
      !root.contains(active)
    )
      return;
    const buttons = toolbarButtons(root);
    const index = buttons.indexOf(active);
    if (index === -1) return;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % buttons.length
        : event.key === "ArrowLeft"
          ? (index - 1 + buttons.length) % buttons.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = buttons[next];
    if (target === undefined) return;
    syncTabStops(root, target);
    target.focus();
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    if (
      root !== null &&
      event.target instanceof HTMLButtonElement &&
      root.contains(event.target)
    )
      syncTabStops(root, event.target);
  };
  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={SELECTION_WORDS.toolbar}
      data-selection-toolbar=""
      style={{ left: place.x, top: place.y, transform: SHIFT[place.side] }}
      className="fixed z-50"
      onMouseDown={keepPageFocus}
      onClickCapture={refreshMarks}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <div className="flex h-control-lg animate-in items-center gap-0.5 rounded-surface bg-overlay p-1 shadow-overlay ring-1 ring-line duration-(--dur-fast) ease-out fade-in-0 zoom-in-95">
        {leadingMain.map(barButton)}
        {more.length === 0 ? null : (
          <MoreMenu
            more={more}
            marks={marks}
            facts={facts}
            actionContext={actionContext}
            onApplied={refreshMarks}
          />
        )}
        {hasLeading && (hasTrailing || state !== null) ? divider() : null}
        {trailingMain.map(barButton)}
        {hasTrailing && state !== null ? divider() : null}
        {state === null ? null : barButton(state)}
      </div>
    </div>
  );
}

/** Drawn only while the selection the pointer made is not empty. */
export function SelectionToolbar(props: { docId: string }): ReactNode {
  const place = usePointerSelection(props.docId);
  const selectionEmpty = useEditorFact("selectionEmpty");
  return place === null || selectionEmpty ? null : (
    <Bar docId={props.docId} place={place} />
  );
}
