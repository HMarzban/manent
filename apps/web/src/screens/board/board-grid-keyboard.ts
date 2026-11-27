// 2D keyboard navigation and command-key dispatch for the Board grid.
import type { EpisodeEntry } from "@manent/crdt";
import type { KeyboardEvent } from "react";
import { cellKey, parseCellKey } from "../../board/model.ts";
import type { BoardCard, BoardStoryline } from "../../board/model.ts";

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.closest('[data-slot="popover-content"], [role="menu"]') !== null);

function focusCellTarget(
  root: HTMLElement,
  storylineId: string,
  episodeId: string,
  edge: "first" | "last" = "first",
): boolean {
  const cell = root.querySelector<HTMLElement>(
    `[data-board-cell="${CSS.escape(cellKey(storylineId, episodeId))}"]`,
  );
  if (cell === null) return false;
  const focusables = [
    ...cell.querySelectorAll<HTMLElement>(
      '[data-board-card], [data-tour="board.addCard"], [data-collapsed-expand]',
    ),
  ];
  const target = edge === "last" ? focusables.at(-1) : (focusables[0] ?? null);
  if (target === undefined || target === null) return false;
  target.focus();
  return true;
}

export interface BoardGridKeyArgs {
  readonly event: KeyboardEvent<HTMLDivElement>;
  readonly canEdit: boolean;
  readonly storylines: readonly BoardStoryline[];
  readonly episodes: readonly EpisodeEntry[];
  readonly cardById: ReadonlyMap<string, BoardCard>;
  readonly episodeById: ReadonlyMap<string, EpisodeEntry>;
  resolveKey(nativeEvent: globalThis.KeyboardEvent): string | null;
  runCommand(commandId: string): void;
  onOpenCard(card: BoardCard, episode: EpisodeEntry): void;
  onRemoveCard(card: BoardCard): void;
}

/** Handles command shortcuts, Enter-to-open, Delete-to-remove, and 2D arrow/Home/End focus navigation on the Board. */
export function handleBoardGridKeyDown(args: BoardGridKeyArgs): void {
  const {
    event,
    canEdit,
    storylines,
    episodes,
    cardById,
    episodeById,
    resolveKey,
    runCommand,
    onOpenCard,
    onRemoveCard,
  } = args;

  const dragging =
    event.currentTarget.querySelector("[data-dragging]") !== null;
  if (dragging || isEditableTarget(event.target)) return;

  const commandId = resolveKey(event.nativeEvent);
  if (commandId !== null) {
    event.preventDefault();
    event.stopPropagation();
    runCommand(commandId);
    return;
  }

  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target === null) return;

  // Enter opens a focused card rather than starting a keyboard drag; Space picks a card up to drag
  if (event.key === "Enter" && target.hasAttribute("data-board-card")) {
    const cardId = target.getAttribute("data-board-card");
    const card = cardId === null ? undefined : cardById.get(cardId);
    const episode =
      card === undefined ? undefined : episodeById.get(card.episodeId);
    if (card !== undefined && episode !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      onOpenCard(card, episode);
    }
    return;
  }

  if (
    canEdit &&
    (event.key === "Delete" || event.key === "Backspace") &&
    target.hasAttribute("data-board-card")
  ) {
    const cardId = target.getAttribute("data-board-card");
    const card = cardId === null ? undefined : cardById.get(cardId);
    if (card !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      onRemoveCard(card);
    }
    return;
  }

  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    (!target.hasAttribute("data-board-card") &&
      !target.hasAttribute("data-tour") &&
      !target.hasAttribute("data-collapsed-expand"))
  ) {
    return;
  }

  const cellEl = target.closest<HTMLElement>("[data-board-cell]");
  const cellId = cellEl?.getAttribute("data-board-cell") ?? null;
  const parsed = cellId === null ? null : parseCellKey(cellId);
  if (parsed === null || cellEl === null) return;

  const rowIdx = storylines.findIndex((s) => s.id === parsed.storylineId);
  const colIdx = episodes.findIndex((e) => e.id === parsed.episodeId);
  if (rowIdx === -1 || colIdx === -1) return;
  const rtl =
    typeof getComputedStyle === "function" &&
    getComputedStyle(event.currentTarget).direction === "rtl";

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const step = event.key === "ArrowDown" ? 1 : -1;
    const inCell = [
      ...cellEl.querySelectorAll<HTMLElement>(
        '[data-board-card], [data-tour="board.addCard"], [data-collapsed-expand]',
      ),
    ];
    const idx = inCell.indexOf(target);
    const nextInCell = idx === -1 ? undefined : inCell[idx + step];
    if (nextInCell !== undefined) {
      event.preventDefault();
      nextInCell.focus();
      return;
    }
    const nextRow = storylines[rowIdx + step];
    if (nextRow !== undefined) {
      event.preventDefault();
      focusCellTarget(
        event.currentTarget,
        nextRow.id,
        parsed.episodeId,
        step > 0 ? "first" : "last",
      );
    }
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const dir = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
    const nextEp = episodes[colIdx + dir];
    if (nextEp !== undefined) {
      event.preventDefault();
      focusCellTarget(event.currentTarget, parsed.storylineId, nextEp.id);
    }
  } else if (event.key === "Home" || event.key === "End") {
    const edgeEp = event.key === "Home" ? episodes[0] : episodes.at(-1);
    if (edgeEp !== undefined) {
      event.preventDefault();
      focusCellTarget(event.currentTarget, parsed.storylineId, edgeEp.id);
    }
  }
}
