// Floating ambient Version history outline mini-map matching Present mode: weightless tick spine, hover/pinnable card and change indicators.
import {
  Button,
  DOCUMENT_WORDS,
  HISTORY_WORDS,
  Input,
  LIBRARY_WORDS,
  PRESENT_WORDS,
  cn,
} from "@manent/ui";
import { ListTreeIcon, PinIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { nextOutlineFocus } from "../present/room/minimap-logic.ts";
import {
  compressHistoryTicks,
  filterHistoryMinimapItems,
  minimapChangeSummary,
  minimapItemLabel,
} from "./history-minimap-logic.ts";
import type { HistoryMinimapItem } from "./history-minimap-logic.ts";
import { MinimapRow } from "./history-minimap-row.tsx";

const LEAVE_DELAY_MS = 180;
const FILTER_THRESHOLD = 8;
const ICON_BUTTON_PROPS = {
  type: "button",
  variant: "ghost",
  size: "icon-xs",
} as const;
const ICON_CLASS = "size-3.5 text-fg-muted";
const META_NUMBER_CLASS = "shrink-0 text-fg-muted tabular-nums";

type CardMode = "closed" | "open" | "pinned";

/**
 * Weightless floating outline mini-map for `/s/$docId/history`, matching Present mode's exact ambient tick spine
 * and hover/pinnable `.mn-minimap-card` grammar with subtle change markers (`data-changed="true"`).
 */
export function HistoryMinimapToc(props: {
  readonly docId: string;
  readonly items: readonly HistoryMinimapItem[];
  readonly activeId: string | null;
  readonly progress: number;
  readonly isRundown?: boolean;
  readonly preferCollapsed?: boolean;
  readonly onJump: (blockId: string, itemId: string) => void;
}): ReactNode {
  const {
    docId,
    items,
    activeId,
    progress,
    isRundown = false,
    preferCollapsed = false,
    onJump,
  } = props;
  const [mode, setMode] = useState<CardMode>("closed");
  const [filter, setFilter] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
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
  useEffect(() => {
    setFilter("");
    setChangedOnly(false);
  }, [docId]);
  useEffect(() => {
    if (preferCollapsed) setMode("closed");
  }, [preferCollapsed]);
  useEffect(() => {
    if (expanded)
      cardRef.current
        ?.querySelector("[aria-current='location']")
        ?.scrollIntoView?.({ block: "nearest" });
  }, [expanded]);

  const summary = minimapChangeSummary(items);
  const hasChanges = summary.changedItems > 0;
  useEffect(() => {
    if (!hasChanges && changedOnly) setChangedOnly(false);
  }, [hasChanges, changedOnly]);

  if (items.length === 0) return null;

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
    const buttons = [
      ...cardRef.current.querySelectorAll<HTMLButtonElement>(
        "[data-outline-item]",
      ),
    ];
    const currentIndex = buttons.findIndex(
      (element) => element === document.activeElement,
    );
    const nextIndex = nextOutlineFocus(
      event.key,
      currentIndex,
      buttons.length,
      event.target instanceof HTMLInputElement,
    );
    if (nextIndex < 0) return;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  const ticks = compressHistoryTicks(items, activeId);
  const filtered = filterHistoryMinimapItems(
    items,
    filter,
    changedOnly && hasChanges,
  );
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const spineStyle = {
    transform: `scaleY(${clampedProgress / 100})`,
    transformOrigin: "top",
  };
  const filterInputClass = cn(
    "h-control-sm w-full ps-7 text-ui [&::-webkit-search-cancel-button]:hidden",
    filter !== "" && "pe-7",
  );

  return (
    <aside
      ref={asideRef}
      aria-label={HISTORY_WORDS.minimapLabel}
      data-history-minimap=""
      onMouseEnter={() => setCardMode(pinned ? "pinned" : "open")}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="pointer-events-auto absolute end-4 bottom-4 z-20 flex flex-row-reverse items-center md:top-1/2 md:bottom-auto md:-translate-y-1/2"
    >
      {/* Weightless ambient tick spine + quiet icon toggle (exact Present mode grammar) */}
      <div className="flex flex-col items-end gap-2">
        <div className="hidden items-stretch gap-2 md:flex">
          <div className="flex flex-col items-end">
            {ticks.map((tick, index) => (
              <button
                key={tick.item.id}
                type="button"
                tabIndex={-1}
                aria-label={PRESENT_WORDS.jumpTo(minimapItemLabel(tick.item))}
                title={
                  tick.changed
                    ? `${minimapItemLabel(tick.item)} — ${HISTORY_WORDS.sceneChangesLabel(tick.item.changeCount)}`
                    : minimapItemLabel(tick.item)
                }
                aria-current={tick.active ? "location" : undefined}
                onClick={() => onJump(tick.item.targetBlockId, tick.item.id)}
                className={cn(
                  "flex cursor-pointer items-center justify-end py-1 ps-2 pe-1",
                  tick.isMilestone && index > 0 && "mt-2",
                )}
              >
                <span
                  aria-hidden="true"
                  data-kind={tick.item.kind}
                  data-active={tick.active ? "true" : undefined}
                  data-changed={tick.changed ? "true" : undefined}
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
          className="cursor-pointer rounded-control border border-line bg-raised text-fg-muted hover:text-fg md:border-transparent"
        >
          <ListTreeIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </div>

      {/* Floating overlay card (hover-revealed or pinned, zero permanent sidebar chrome) */}
      {expanded ? (
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
                {HISTORY_WORDS.minimapHeading}
              </span>
              {hasChanges ? (
                <span className="text-micro font-medium tnum text-ok">
                  {HISTORY_WORDS.changedScenesCount(
                    summary.changedItems,
                    summary.total || items.length,
                  )}
                </span>
              ) : (
                <span className="text-micro text-fg-muted">
                  {PRESENT_WORDS.sceneCount(summary.total || items.length)}
                </span>
              )}
              <span className={`ms-auto text-micro ${META_NUMBER_CLASS}`}>
                {PRESENT_WORDS.progressPercent(clampedProgress)}
              </span>
              <Button
                {...ICON_BUTTON_PROPS}
                aria-pressed={pinned}
                aria-label={PRESENT_WORDS.pinOutline}
                onClick={() => setCardMode(pinned ? "open" : "pinned")}
                className="cursor-pointer"
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
                className="cursor-pointer md:hidden"
              >
                <XIcon aria-hidden="true" className={ICON_CLASS} />
              </Button>
            </div>

            {hasChanges ? (
              <div
                role="group"
                aria-label={HISTORY_WORDS.minimapLabel}
                className="mb-1.5 grid grid-cols-2 gap-0.5 rounded-control border border-line bg-well p-0.5 text-meta"
              >
                <button
                  type="button"
                  aria-pressed={!changedOnly}
                  className={cn(
                    "h-6 cursor-pointer rounded-[calc(var(--shape-control)-2px)] px-2 font-medium transition-colors",
                    !changedOnly
                      ? "bg-raised text-fg shadow-xs"
                      : "text-fg-muted hover:text-fg",
                  )}
                  onClick={() => setChangedOnly(false)}
                >
                  {HISTORY_WORDS.allItems}
                </button>
                <button
                  type="button"
                  aria-pressed={changedOnly}
                  className={cn(
                    "h-6 cursor-pointer rounded-[calc(var(--shape-control)-2px)] px-2 font-medium transition-colors",
                    changedOnly
                      ? "bg-raised text-fg shadow-xs"
                      : "text-fg-muted hover:text-fg",
                  )}
                  onClick={() => setChangedOnly(true)}
                >
                  {HISTORY_WORDS.changedOnly} ({summary.changedItems})
                </button>
              </div>
            ) : null}

            {items.length >= FILTER_THRESHOLD ? (
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
                {filter !== "" ? (
                  <Button
                    {...ICON_BUTTON_PROPS}
                    aria-label={LIBRARY_WORDS.clearSearch}
                    className="absolute end-0.5 cursor-pointer"
                    onClick={() => {
                      setFilter("");
                      cardRef.current?.querySelector("input")?.focus();
                    }}
                  >
                    <XIcon aria-hidden="true" className={ICON_CLASS} />
                  </Button>
                ) : null}
              </div>
            ) : null}

            <nav
              aria-label={HISTORY_WORDS.minimapHeading}
              data-ring="inset"
              className="max-h-[58vh] overflow-y-auto pt-1"
            >
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-meta text-fg-muted">
                  {changedOnly
                    ? isRundown
                      ? HISTORY_WORDS.noChangedRows
                      : HISTORY_WORDS.noChangedScenes
                    : PRESENT_WORDS.noMatchingScenes}
                </p>
              ) : (
                filtered.map((item, index) => (
                  <MinimapRow
                    key={item.id}
                    item={item}
                    index={index}
                    active={item.id === activeId}
                    onJump={onJump}
                  />
                ))
              )}
            </nav>
          </div>
        </>
      ) : null}
    </aside>
  );
}
