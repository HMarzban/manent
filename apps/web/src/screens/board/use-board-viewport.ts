// Board viewport scroll/overflow observation, smooth episode jumping, and pure card filtering.
import type { EpisodeEntry } from "@manent/crdt";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { EpisodeScenesState } from "../../board/episode-scenes.ts";
import { resolveStorylineLanes } from "../../board/model.ts";
import type {
  BoardCard,
  BoardStoryline,
  StorylineTone,
} from "../../board/model.ts";
import type { BoardDensity } from "./board-view.ts";
import { computeNextEpisodeScrollLeft } from "./board-pan.tsx";

export interface BoardViewportState {
  readonly scrolledX: boolean;
  readonly scrolledY: boolean;
  readonly overflowEnd: boolean;
  readonly hasHorizontalOverflow: boolean;
  readonly visibleEpisodeIds: ReadonlySet<string>;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Filters season cards by search text (card body, storyline title, linked scene), storyline set, and unlinked toggle. */
export function filterBoardCards(params: {
  readonly seasonCards: readonly BoardCard[];
  readonly episodes: readonly EpisodeEntry[];
  readonly storylines: readonly BoardStoryline[];
  readonly scenesByScript: ReadonlyMap<string, EpisodeScenesState>;
  readonly query: string;
  readonly selectedStorylineIds: ReadonlySet<string>;
  readonly unlinkedOnly: boolean;
  readonly flaggedOnly?: boolean;
}): readonly BoardCard[] {
  const {
    seasonCards,
    episodes,
    storylines,
    scenesByScript,
    query,
    selectedStorylineIds,
    unlinkedOnly,
    flaggedOnly = false,
  } = params;
  const trimmed = query.trim().toLowerCase();
  if (
    trimmed === "" &&
    selectedStorylineIds.size === 0 &&
    !unlinkedOnly &&
    !flaggedOnly
  ) {
    return seasonCards;
  }
  const epById = new Map(episodes.map((e) => [e.id, e]));
  const slById = new Map(storylines.map((s) => [s.id, s]));
  return seasonCards.filter((card) => {
    if (
      selectedStorylineIds.size > 0 &&
      !selectedStorylineIds.has(card.storylineId)
    ) {
      return false;
    }
    if (unlinkedOnly && card.link !== null) return false;
    if (flaggedOnly && card.flagged !== true) return false;
    if (trimmed === "") return true;
    if (card.text.toLowerCase().includes(trimmed)) return true;
    const storyline = slById.get(card.storylineId);
    if (storyline?.title.toLowerCase().includes(trimmed)) return true;
    const ep = epById.get(card.episodeId);
    if (ep !== undefined && card.link !== null && ep.docIds.script !== null) {
      const state = scenesByScript.get(ep.docIds.script);
      if (state?.status === "ready") {
        const scene = state.scenes.find(
          (s) => s.blockId === card.link?.blockId,
        );
        if (
          scene !== undefined &&
          (scene.heading.toLowerCase().includes(trimmed) ||
            scene.number.toLowerCase().includes(trimmed))
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

/** Tracks Board scroll shadows, horizontal overflow fade, visible episode pills, and smooth episode jumping. */
export function useBoardViewport(
  viewportRef: RefObject<HTMLElement | null>,
  deps: {
    readonly episodeCount: number;
    readonly storylineCount: number;
    readonly density: BoardDensity;
  },
): {
  readonly scrollState: BoardViewportState;
  jumpToEpisode(episodeId: string): void;
  scrollByEpisodes(direction: -1 | 1): void;
} {
  const [scrollState, setScrollState] = useState<BoardViewportState>(() => ({
    scrolledX: false,
    scrolledY: false,
    overflowEnd: false,
    hasHorizontalOverflow: false,
    visibleEpisodeIds: new Set(),
  }));

  const jumpToEpisode = useCallback(
    (episodeId: string): void => {
      const viewport = viewportRef.current;
      if (viewport === null) return;
      const col = viewport.querySelector<HTMLElement>(
        `[data-episode-col="${CSS.escape(episodeId)}"]`,
      );
      if (col === null) return;
      const rail = viewport.querySelector<HTMLElement>(".mn-board-corner");
      const railWidth = rail?.offsetWidth ?? 0;
      const targetLeft = Math.max(0, col.offsetLeft - railWidth);
      viewport.scrollTo({
        left: targetLeft,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
    [viewportRef],
  );

  const scrollByEpisodes = useCallback(
    (direction: -1 | 1): void => {
      const viewport = viewportRef.current;
      if (viewport === null) return;
      const rail = viewport.querySelector<HTMLElement>(".mn-board-corner");
      const railWidth = rail?.offsetWidth ?? 0;
      const cols = viewport.querySelectorAll<HTMLElement>("[data-episode-col]");
      const rtl =
        typeof getComputedStyle === "function" &&
        getComputedStyle(viewport).direction === "rtl";
      const columnLefts = [...cols].map((col) => col.offsetLeft);
      const current = Math.abs(viewport.scrollLeft);
      const next = computeNextEpisodeScrollLeft({
        scrollLeft: current,
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        railWidth,
        columnLefts,
        direction,
      });
      viewport.scrollTo({
        left: rtl ? -next : next,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
    [viewportRef],
  );

  const measureViewport = useCallback((): void => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const scrolledX = Math.abs(viewport.scrollLeft) > 2;
    const scrolledY = viewport.scrollTop > 2;
    const maxScrollX = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const hasHorizontalOverflow = maxScrollX > 4;
    const overflowEnd =
      hasHorizontalOverflow && Math.abs(viewport.scrollLeft) < maxScrollX - 4;
    const rail = viewport.querySelector<HTMLElement>(".mn-board-corner");
    const railW = rail?.offsetWidth ?? 0;
    const vpRect = viewport.getBoundingClientRect();
    const visible = new Set<string>();
    const cols = viewport.querySelectorAll<HTMLElement>("[data-episode-col]");
    for (const col of cols) {
      const id = col.getAttribute("data-episode-col");
      if (id === null) continue;
      const rect = col.getBoundingClientRect();
      const leftEdge = vpRect.left + railW;
      if (rect.right > leftEdge + 16 && rect.left < vpRect.right - 16) {
        visible.add(id);
      }
    }
    setScrollState((prev) => {
      const sameVisible =
        prev.visibleEpisodeIds.size === visible.size &&
        [...visible].every((id) => prev.visibleEpisodeIds.has(id));
      if (
        prev.scrolledX === scrolledX &&
        prev.scrolledY === scrolledY &&
        prev.overflowEnd === overflowEnd &&
        prev.hasHorizontalOverflow === hasHorizontalOverflow &&
        sameVisible
      ) {
        return prev;
      }
      return {
        scrolledX,
        scrolledY,
        overflowEnd,
        hasHorizontalOverflow,
        visibleEpisodeIds: visible,
      };
    });
  }, [viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    measureViewport();
    const onScroll = (): void => measureViewport();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measureViewport);
      observer.observe(viewport);
    }
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [
    viewportRef,
    measureViewport,
    deps.episodeCount,
    deps.storylineCount,
    deps.density,
  ]);

  return { scrollState, jumpToEpisode, scrollByEpisodes };
}

/** Manages Board filter state, derived storyline lanes, counts, and filtered storylines/cards. */
export function useBoardFilters(args: {
  readonly episodes: readonly EpisodeEntry[];
  readonly storylines: readonly BoardStoryline[];
  readonly cards: readonly BoardCard[];
  readonly scenesByScript: ReadonlyMap<string, EpisodeScenesState>;
}): {
  readonly query: string;
  readonly selectedStorylineIds: ReadonlySet<string>;
  readonly unlinkedOnly: boolean;
  readonly flaggedOnly: boolean;
  readonly hasActiveFilter: boolean;
  readonly seasonCards: readonly BoardCard[];
  readonly visibleStorylines: readonly BoardStoryline[];
  readonly visibleCards: readonly BoardCard[];
  readonly laneByStoryline: ReadonlyMap<string, StorylineTone>;
  readonly cardCountByStoryline: ReadonlyMap<string, number>;
  readonly unlinkedCount: number;
  readonly flaggedCount: number;
  setQuery(next: string): void;
  toggleStoryline(id: string): void;
  clearStorylines(): void;
  toggleUnlinked(): void;
  toggleFlagged(): void;
  clearFilters(): void;
} {
  const { episodes, storylines, cards, scenesByScript } = args;
  const [query, setQuery] = useState("");
  const [selectedStorylineIds, setSelectedStorylineIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const episodeIds = useMemo(
    () => new Set(episodes.map((e) => e.id)),
    [episodes],
  );
  const seasonCards = useMemo(
    () => cards.filter((c) => episodeIds.has(c.episodeId)),
    [cards, episodeIds],
  );
  const laneByStoryline = useMemo(
    () => resolveStorylineLanes(storylines),
    [storylines],
  );
  const cardCountByStoryline = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of seasonCards) {
      counts.set(card.storylineId, (counts.get(card.storylineId) ?? 0) + 1);
    }
    return counts;
  }, [seasonCards]);
  const unlinkedCount = useMemo(
    () => seasonCards.filter((c) => c.link === null).length,
    [seasonCards],
  );
  const flaggedCount = useMemo(
    () => seasonCards.filter((c) => c.flagged === true).length,
    [seasonCards],
  );
  const hasActiveFilter =
    query.trim() !== "" ||
    selectedStorylineIds.size > 0 ||
    unlinkedOnly ||
    flaggedOnly;
  const visibleStorylines = useMemo(
    () =>
      selectedStorylineIds.size === 0
        ? storylines
        : storylines.filter((s) => selectedStorylineIds.has(s.id)),
    [storylines, selectedStorylineIds],
  );
  const visibleCards = useMemo(
    () =>
      filterBoardCards({
        seasonCards,
        episodes,
        storylines,
        scenesByScript,
        query,
        selectedStorylineIds,
        unlinkedOnly,
        flaggedOnly,
      }),
    [
      seasonCards,
      episodes,
      storylines,
      scenesByScript,
      query,
      selectedStorylineIds,
      unlinkedOnly,
      flaggedOnly,
    ],
  );

  const toggleStoryline = useCallback((id: string) => {
    setSelectedStorylineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearStorylines = useCallback(
    () => setSelectedStorylineIds(new Set()),
    [],
  );
  const toggleUnlinked = useCallback(() => setUnlinkedOnly((v) => !v), []);
  const toggleFlagged = useCallback(() => setFlaggedOnly((v) => !v), []);
  const clearFilters = useCallback(() => {
    setQuery("");
    setSelectedStorylineIds(new Set());
    setUnlinkedOnly(false);
    setFlaggedOnly(false);
  }, []);

  return {
    query,
    selectedStorylineIds,
    unlinkedOnly,
    flaggedOnly,
    hasActiveFilter,
    seasonCards,
    visibleStorylines,
    visibleCards,
    laneByStoryline,
    cardCountByStoryline,
    unlinkedCount,
    flaggedCount,
    setQuery,
    toggleStoryline,
    clearStorylines,
    toggleUnlinked,
    toggleFlagged,
    clearFilters,
  };
}

/** Restores focus on the next frame to `selector` inside `root` (or `document` when omitted). */
export function focusBoardSelector(
  selector: string,
  root: ParentNode | null = document,
): void {
  requestAnimationFrame(() =>
    root?.querySelector<HTMLElement>(selector)?.focus(),
  );
}

/** Resolves the route href for opening a card's linked scene, episode script, or episode outline; null if none exists. */
export function boardCardHref(
  card: BoardCard,
  ep: EpisodeEntry,
): string | null {
  if (ep.docIds.script !== null) {
    const at =
      card.link === null ? "" : `?at=${encodeURIComponent(card.link.blockId)}`;
    return `/s/${ep.docIds.script}${at}`;
  }
  return ep.docIds.outline !== null ? `/s/${ep.docIds.outline}` : null;
}
