// Single-key writers' room shortcuts, Mod+P print intercept, and lifecycle effects on the Board screen.
import type { EpisodeEntry } from "@manent/crdt";
import { DEMO_PEOPLE } from "@manent/demo";
import { BOARD_WORDS } from "@manent/ui";
import { useEffect, useLayoutEffect } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { BoardCard, BoardStoryline } from "../../board/model.ts";
import { focusHeading } from "../../focus.ts";
import type { PersonServices } from "../../services/ports.ts";
import { pageTitle } from "../../text.ts";
import type { AddingCardCell } from "./board-grid.tsx";
import { focusBoardSelector } from "./use-board-viewport.ts";

/** Manages focus-after-create, non-series redirect, document title, and initial `?ep=` scroll on Board. */
export function useBoardLifecycle(args: {
  readonly projectId: string;
  readonly projectTitle: string | null;
  readonly userId: string;
  readonly notSeries: boolean;
  readonly boardLoaded: boolean;
  readonly focusedEpisodeId: string | null;
  readonly cards: readonly BoardCard[];
  readonly viewportRef: RefObject<HTMLElement | null>;
  readonly pendingFocusCardIdRef: MutableRefObject<string | null>;
  readonly scrolledToEpRef: MutableRefObject<string | null>;
  onRedirectHome(): void;
  onJumpEpisode(episodeId: string): void;
}): void {
  const {
    projectId,
    projectTitle,
    userId,
    notSeries,
    boardLoaded,
    focusedEpisodeId,
    cards,
    viewportRef,
    pendingFocusCardIdRef,
    scrolledToEpRef,
    onRedirectHome,
    onJumpEpisode,
  } = args;

  useLayoutEffect(() => {
    const targetId = pendingFocusCardIdRef.current;
    if (targetId === null) return;
    const el = viewportRef.current?.querySelector<HTMLElement>(
      `[data-board-card="${CSS.escape(targetId)}"]`,
    );
    if (el) {
      pendingFocusCardIdRef.current = null;
      el.focus();
    }
  }, [cards, viewportRef, pendingFocusCardIdRef]);

  useEffect(() => {
    if (notSeries) onRedirectHome();
  }, [notSeries, onRedirectHome]);

  useEffect(() => {
    if (projectTitle === null) return;
    focusHeading(document);
    const person = DEMO_PEOPLE.find((p) => p.userId === userId);
    document.title = pageTitle(
      BOARD_WORDS.title(projectTitle),
      person?.name ?? null,
    );
  }, [projectId, projectTitle, userId]);

  useEffect(() => {
    if (
      !boardLoaded ||
      focusedEpisodeId === null ||
      scrolledToEpRef.current === focusedEpisodeId
    )
      return;
    scrolledToEpRef.current = focusedEpisodeId;
    const raf = requestAnimationFrame(() => onJumpEpisode(focusedEpisodeId));
    return () => cancelAnimationFrame(raf);
  }, [boardLoaded, focusedEpisodeId, onJumpEpisode, scrolledToEpRef]);
}

const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="textbox"]';
const OPEN_OVERLAY_SELECTOR =
  '[role="dialog"], [role="menu"], [data-popup-open]';

export function useBoardShortcuts(args: {
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly visibleStorylines: readonly BoardStoryline[];
  readonly episodes: readonly EpisodeEntry[];
  readonly visibleCards: readonly BoardCard[];
  readonly selectedCardId: string | null;
  readonly viewportRef: RefObject<HTMLElement | null>;
  readonly messages: PersonServices["messages"];
  onSelectCard(cardId: string): void;
  onStartAddCard(cell: AddingCardCell): void;
  onStartLinkScene(cardId: string): void;
  onDuplicateCard(card: BoardCard): void;
  onToggleFlag(card: BoardCard): void;
  onTogglePeek(cardId: string): void;
  onScrollEpisodes(direction: -1 | 1): void;
  onPrint(): void;
}): void {
  const {
    enabled,
    canEdit,
    visibleStorylines,
    episodes,
    visibleCards,
    selectedCardId,
    viewportRef,
    messages,
    onSelectCard,
    onStartAddCard,
    onStartLinkScene,
    onDuplicateCard,
    onToggleFlag,
    onTogglePeek,
    onScrollEpisodes,
    onPrint,
  } = args;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        onPrint();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest(TYPING_SELECTOR) !== null) return;
      if (document.querySelector(OPEN_OVERLAY_SELECTOR) !== null) return;

      const key = event.key;
      if (key === "/") {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>(
          "[data-board-search]",
        );
        search?.focus();
        search?.select();
        return;
      }
      if (key === "[") {
        event.preventDefault();
        onScrollEpisodes(-1);
        return;
      }
      if (key === "]") {
        event.preventDefault();
        onScrollEpisodes(1);
        return;
      }

      const lower = key.toLowerCase();
      const focusedId =
        document.activeElement?.getAttribute("data-board-card") ??
        selectedCardId;
      const selected =
        focusedId === null
          ? undefined
          : visibleCards.find((c) => c.id === focusedId);

      if (lower === "n" && canEdit) {
        const storylineId = selected?.storylineId ?? visibleStorylines[0]?.id;
        const episodeId = selected?.episodeId ?? episodes[0]?.id;
        if (storylineId !== undefined && episodeId !== undefined) {
          event.preventDefault();
          onStartAddCard({ storylineId, episodeId });
        }
        return;
      }
      if (lower === "l" && canEdit && selected !== undefined) {
        const ep = episodes.find((e) => e.id === selected.episodeId);
        if (ep?.docIds.script !== null && ep !== undefined) {
          event.preventDefault();
          onStartLinkScene(selected.id);
        }
        return;
      }
      if (lower === "d" && canEdit && selected !== undefined) {
        event.preventDefault();
        onDuplicateCard(selected);
        return;
      }
      if (lower === "f" && canEdit && selected !== undefined) {
        event.preventDefault();
        onToggleFlag(selected);
        return;
      }
      if (lower === "i" && selected !== undefined && selected.link !== null) {
        event.preventDefault();
        onTogglePeek(selected.id);
        return;
      }
      if (lower === "u") {
        const unlinked = visibleCards.filter((c) => c.link === null);
        event.preventDefault();
        if (unlinked.length === 0) {
          messages.push({
            id: "board.all_linked",
            text: BOARD_WORDS.noUnlinkedCards,
            actions: [],
            lifetime: "brief",
            ownWork: false,
          });
          return;
        }
        const currentIdx = unlinked.findIndex((c) => c.id === focusedId);
        const next = unlinked[(currentIdx + 1) % unlinked.length]!;
        onSelectCard(next.id);
        const selector = `[data-board-card="${CSS.escape(next.id)}"]`;
        const el = viewportRef.current?.querySelector<HTMLElement>(selector);
        el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        focusBoardSelector(selector, viewportRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    canEdit,
    visibleStorylines,
    episodes,
    visibleCards,
    selectedCardId,
    viewportRef,
    messages,
    onSelectCard,
    onStartAddCard,
    onStartLinkScene,
    onDuplicateCard,
    onToggleFlag,
    onTogglePeek,
    onScrollEpisodes,
    onPrint,
  ]);
}
