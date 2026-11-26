// Present mode right-edge outline mini-map: ambient tick spine, floating outline card and quick-jump filter.
import {
  Button,
  DOCUMENT_WORDS,
  Input,
  LIBRARY_WORDS,
  PRESENT_WORDS,
  cn,
} from "@manent/ui";
import { ListTreeIcon, PinIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import type { OutlineRow } from "../../../state/outline.store.ts";
import {
  compressTicks,
  filterOutlineRows,
  formatEighths,
  nextOutlineFocus,
  rowLabel,
  sceneIndexInfo,
} from "./minimap-logic.ts";

const LEAVE_DELAY_MS = 180;
const FILTER_THRESHOLD = 8;
const ICON_BUTTON_PROPS = {
  type: "button",
  variant: "ghost",
  size: "icon-xs",
} as const;
const TICK_BUTTON_CLASS = "flex items-center justify-end py-1 ps-2 pe-1";
const ICON_CLASS = "size-3.5 text-fg-muted";
const META_NUMBER_CLASS = "shrink-0 text-fg-muted tabular-nums";
const ROW_BASE_CLASS =
  "mn-row w-full rounded-control px-2 text-start hover:bg-subtle active:bg-control";

type CardMode = "closed" | "open" | "pinned";

function renderOutlineItem(
  row: OutlineRow,
  index: number,
  active: boolean,
  onJump: (blockId: string) => void,
): ReactNode {
  const lengthLabel = row.kind === "scene" ? formatEighths(row.eighths) : null;
  let itemClass = `${ROW_BASE_CLASS} flex items-center gap-2 py-1 text-ui`;
  if (row.kind === "act")
    itemClass = cn(
      ROW_BASE_CLASS,
      "truncate py-1.5 text-ui font-semibold text-fg",
      index > 0 && "mt-1 border-t border-line pt-2",
    );
  else if (row.kind === "section")
    itemClass = `${ROW_BASE_CLASS} truncate py-1 text-meta text-fg-muted italic`;

  let body: ReactNode = row.heading;
  if (row.kind === "scene") {
    body = row.omitted ? (
      <span className="min-w-0 flex-1 truncate text-fg-muted">
        {rowLabel(row)}
      </span>
    ) : (
      <>
        {row.number !== null && (
          <span className={`w-6 text-end text-meta ${META_NUMBER_CLASS}`}>
            {row.number}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-ui">{row.heading}</span>
        {lengthLabel !== null && (
          <span className={`text-micro ${META_NUMBER_CLASS}`}>
            {lengthLabel}
          </span>
        )}
      </>
    );
  }

  return (
    <button
      key={row.blockId}
      type="button"
      data-outline-item="true"
      aria-current={active ? "location" : undefined}
      onClick={() => onJump(row.blockId)}
      className={itemClass}
    >
      {body}
    </button>
  );
}

/** Floating right-edge script outline mini-map for Present mode. */
export function MiniMapToc(props: {
  docId: string;
  rows: readonly OutlineRow[];
  activeBlockId: string | null;
  progress: number;
  onJump(blockId: string): void;
}): ReactNode {
  const { docId, rows, activeBlockId, progress, onJump } = props;
  const [mode, setMode] = useState<CardMode>("closed");
  const [filter, setFilter] = useState("");
  const cardId = useId();
  const asideRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = mode !== "closed";
  const pinned = mode === "pinned";

  useEffect(
    () => () => {
      if (leaveTimerRef.current !== null) clearTimeout(leaveTimerRef.current);
    },
    [],
  );
  useEffect(() => setFilter(""), [docId]);
  useEffect(() => {
    if (expanded)
      cardRef.current
        ?.querySelector("[aria-current='location']")
        ?.scrollIntoView?.({ block: "nearest" });
  }, [expanded]);

  if (rows.length === 0) return null;

  const clearLeaveTimer = (): void => {
    if (leaveTimerRef.current === null) return;
    clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
  };
  const setCardMode = (next: CardMode): void => {
    clearLeaveTimer();
    setMode(next);
  };
  const handleMouseLeave = (): void => {
    if (pinned) return;
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null;
      if (!asideRef.current?.contains(document.activeElement))
        setMode((current) => (current === "pinned" ? current : "closed"));
    }, LEAVE_DELAY_MS);
  };
  const handleBlur = (event: FocusEvent<HTMLElement>): void => {
    if (pinned) return;
    if (!asideRef.current?.contains(event.relatedTarget as Node | null))
      setCardMode("closed");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!expanded) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (filter !== "") {
        setFilter("");
        return;
      }
      setCardMode("closed");
      toggleRef.current?.focus();
      return;
    }
    if (!cardRef.current?.contains(event.target as Node)) return;
    const items = [
      ...cardRef.current.querySelectorAll<HTMLButtonElement>(
        "[data-outline-item]",
      ),
    ];
    const currentIndex = items.findIndex(
      (element) => element === document.activeElement,
    );
    const nextIndex = nextOutlineFocus(
      event.key,
      currentIndex,
      items.length,
      event.target instanceof HTMLInputElement,
    );
    if (nextIndex < 0) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const ticks = compressTicks(rows, activeBlockId);
  const { totalScenes } = sceneIndexInfo(rows, activeBlockId);
  const filteredRows = filterOutlineRows(rows, filter);
  const filterInputClass = cn(
    "h-control-sm w-full ps-7 text-ui [&::-webkit-search-cancel-button]:hidden",
    filter !== "" && "pe-7",
  );
  const spineStyle = {
    transform: `scaleY(${progress / 100})`,
    transformOrigin: "top",
  };

  return (
    <aside
      ref={asideRef}
      aria-label={PRESENT_WORDS.minimapLabel}
      onMouseEnter={() => setCardMode(pinned ? "pinned" : "open")}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="pointer-events-auto fixed end-4 bottom-4 z-20 flex flex-row-reverse items-center md:top-1/2 md:bottom-auto md:-translate-y-1/2"
    >
      <div className="flex flex-col items-end gap-2">
        <div className="hidden items-stretch gap-2 md:flex">
          <div className="flex flex-col items-end">
            {ticks.map((tick, index) => (
              <button
                key={tick.row.blockId}
                type="button"
                tabIndex={-1}
                aria-label={PRESENT_WORDS.jumpTo(rowLabel(tick.row))}
                title={rowLabel(tick.row)}
                aria-current={tick.active ? "location" : undefined}
                onClick={() => onJump(tick.row.blockId)}
                className={cn(
                  TICK_BUTTON_CLASS,
                  tick.isMilestone && index > 0 && "mt-2",
                )}
              >
                <span
                  aria-hidden="true"
                  data-kind={tick.row.kind}
                  data-active={tick.active ? "true" : undefined}
                  className={`mn-minimap-tick block rounded-full ${tick.widthClass}`}
                />
              </button>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="mn-minimap-spine my-1 w-0.5 shrink-0 overflow-hidden rounded-full bg-line"
          >
            <div
              className="mn-minimap-spine-fill h-full w-full rounded-full bg-accent-solid"
              style={spineStyle}
            />
          </div>
        </div>
        <Button
          {...ICON_BUTTON_PROPS}
          ref={toggleRef}
          aria-label={PRESENT_WORDS.toggleOutline}
          aria-expanded={expanded}
          aria-controls={expanded ? cardId : undefined}
          onClick={() => setCardMode(expanded ? "closed" : "open")}
          className="rounded-control border border-line bg-raised text-fg-muted hover:text-fg md:border-transparent"
        >
          <ListTreeIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      {expanded && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setCardMode("closed")}
            className="fixed inset-0 -z-10 bg-scrim md:hidden"
          />
          <div
            id={cardId}
            ref={cardRef}
            data-popup-open=""
            className="mn-minimap-card p-2 animate-in fade-in-0 slide-in-from-end-2 duration-(--dur-fast) ease-out max-md:fixed max-md:inset-x-4 max-md:bottom-14 max-md:max-w-[calc(100vw-2rem)] md:me-2 md:w-60"
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className="mn-group-label p-0!">
                {PRESENT_WORDS.outline}
              </span>
              <span className="text-micro text-fg-muted">
                {PRESENT_WORDS.sceneCount(totalScenes)}
              </span>
              <span className={`ms-auto text-micro ${META_NUMBER_CLASS}`}>
                {PRESENT_WORDS.progressPercent(progress)}
              </span>
              <Button
                {...ICON_BUTTON_PROPS}
                aria-pressed={pinned}
                aria-label={PRESENT_WORDS.pinOutline}
                onClick={() => setCardMode(pinned ? "open" : "pinned")}
              >
                <PinIcon
                  aria-hidden="true"
                  className={pinned ? "size-3.5 text-fg-accent" : ICON_CLASS}
                />
              </Button>
              <Button
                {...ICON_BUTTON_PROPS}
                aria-label={DOCUMENT_WORDS.dismiss}
                onClick={() => {
                  setCardMode("closed");
                  toggleRef.current?.focus();
                }}
                className="md:hidden"
              >
                <XIcon aria-hidden="true" className={ICON_CLASS} />
              </Button>
            </div>
            {rows.length >= FILTER_THRESHOLD && (
              <div className="relative mb-1.5 flex items-center">
                <SearchIcon
                  aria-hidden="true"
                  className={`pointer-events-none absolute start-2 ${ICON_CLASS}`}
                />
                <Input
                  type="search"
                  aria-label={PRESENT_WORDS.filterScenes}
                  placeholder={PRESENT_WORDS.filterPlaceholder}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className={filterInputClass}
                />
                {filter !== "" && (
                  <Button
                    {...ICON_BUTTON_PROPS}
                    aria-label={LIBRARY_WORDS.clearSearch}
                    className="absolute end-0.5"
                    onClick={() => {
                      setFilter("");
                      cardRef.current?.querySelector("input")?.focus();
                    }}
                  >
                    <XIcon aria-hidden="true" className={ICON_CLASS} />
                  </Button>
                )}
              </div>
            )}
            <nav
              aria-label={PRESENT_WORDS.outline}
              data-ring="inset"
              className="max-h-[58vh] overflow-y-auto pt-1"
            >
              {filteredRows.length === 0 ? (
                <p className="px-2 py-3 text-center text-meta text-fg-muted">
                  {PRESENT_WORDS.noMatchingScenes}
                </p>
              ) : (
                filteredRows.map((row, index) =>
                  renderOutlineItem(
                    row,
                    index,
                    row.blockId === activeBlockId,
                    onJump,
                  ),
                )
              )}
            </nav>
          </div>
        </>
      )}
    </aside>
  );
}
