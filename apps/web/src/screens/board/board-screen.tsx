// The Board screen: sticky 2D writers' room board with filter toolbar, episode jump, density switch, keyboard moves and Undo.
import type { EpisodeEntry } from "@manent/crdt";
import { BOARD_WORDS, messageFor } from "@manent/ui";
import type { SortableListsHandle } from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEpisodeScenes } from "../../board/episode-scenes.ts";
import { cardsInCell, cellKey } from "../../board/model.ts";
import type { BoardCard } from "../../board/model.ts";
import { useBoardData } from "../../board/use-board-data.ts";
import { useBoardMutations } from "../../board/use-board-mutations.ts";
import { useServices } from "../../services/context.tsx";
import { BoardStatusBar, BoardTitleBar, BoardToolbar } from "./board-bars.tsx";
import {
  BoardEmptyView,
  BoardLoadingScreen,
  deriveBoardEmptyKind,
} from "./board-empty-states.tsx";
import type { AddingCardCell } from "./board-grid.tsx";
import { useBoardPan } from "./board-pan.tsx";
import { BoardGridSkeleton } from "./board-skeleton.tsx";
import { BoardStage } from "./board-stage.tsx";
import { useBoardDensity } from "./board-view.ts";
import { useBoardController } from "./use-board-controller.ts";
import { useBoardLifecycle, useBoardShortcuts } from "./use-board-shortcuts.ts";
import {
  boardCardHref,
  focusBoardSelector,
  useBoardFilters,
  useBoardViewport,
} from "./use-board-viewport.ts";

const route = getRouteApi("/p/$projectId/board");

export function BoardScreen(): ReactNode {
  const { projectId }: { projectId: string } = route.useParams();
  const {
    season: seasonParam,
    ep: epParam,
  }: { season: string | null; ep: string | null } = route.useSearch();
  const navigate = useNavigate();
  const { userId, messages } = useServices();
  const data = useBoardData(projectId, seasonParam, epParam);
  const scenesByScript = useEpisodeScenes(data.episodes);
  const { density, setDensity } = useBoardDensity();

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null);
  const [peekingCardId, setPeekingCardId] = useState<string | null>(null);
  const [addingStoryline, setAddingStoryline] = useState(false);
  const [addingCardCell, setAddingCardCell] = useState<AddingCardCell | null>(
    null,
  );
  const [collapsedStorylineIds, setCollapsedStorylineIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const sortableRef = useRef<SortableListsHandle | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const pendingFocusCardIdRef = useRef<string | null>(null);
  const scrolledToEpRef = useRef<string | null>(null);

  const filters = useBoardFilters({
    episodes: data.episodes,
    storylines: data.storylines,
    cards: data.cards,
    scenesByScript,
  });

  const onCardCreated = useCallback((cardId: string) => {
    setSelectedCardId(cardId);
    pendingFocusCardIdRef.current = cardId;
  }, []);
  const onCardRemoved = useCallback((cardId: string) => {
    setSelectedCardId((prev) => (prev === cardId ? null : prev));
  }, []);
  const moveViaSortable = useCallback(
    (cardId: string, storylineId: string, episodeId: string, idx: number) => {
      try {
        sortableRef.current?.move(cardId, cellKey(storylineId, episodeId), idx);
        return sortableRef.current !== null;
      } catch {
        return false;
      }
    },
    [],
  );

  const mutations = useBoardMutations(data, {
    onCardCreated,
    onCardRemoved,
    moveViaSortable,
  });

  const { scrollState, jumpToEpisode, scrollByEpisodes } = useBoardViewport(
    viewportRef,
    {
      episodeCount: data.episodes.length,
      storylineCount: filters.visibleStorylines.length,
      density,
    },
  );
  useBoardPan(viewportRef);

  const redirectHome = useCallback(
    (): void => void navigate({ href: "/", replace: true }),
    [navigate],
  );
  useBoardLifecycle({
    projectId,
    projectTitle:
      data.lookup.status === "ready" ? data.lookup.project.title : null,
    userId,
    notSeries: data.lookup.status === "not_series",
    boardLoaded: data.boardLoaded,
    focusedEpisodeId: data.focusedEpisodeId,
    cards: data.cards,
    viewportRef,
    pendingFocusCardIdRef,
    scrolledToEpRef,
    onRedirectHome: redirectHome,
    onJumpEpisode: jumpToEpisode,
  });

  const handleOpenDoc = useCallback(
    (docId: string): void => void navigate({ href: `/s/${docId}` }),
    [navigate],
  );

  const handleOpenCard = useCallback(
    (card: BoardCard, ep: EpisodeEntry): void => {
      const href = boardCardHref(card, ep);
      if (href !== null) void navigate({ href });
      else
        messages.push(
          messageFor({
            kind: "command_unavailable",
            label: BOARD_WORDS.openScript,
            reason: BOARD_WORDS.needsScript(ep.number),
          }),
        );
    },
    [navigate, messages],
  );

  const handleRemoveCard = useCallback(
    (card: BoardCard): void => {
      const cell = cardsInCell(
        filters.visibleCards,
        card.storylineId,
        card.episodeId,
      );
      const index = cell.findIndex((c) => c.id === card.id);
      const nextCard = cell[index + 1] ?? cell[index - 1] ?? null;
      mutations.removeCard(card.id);
      const selector =
        nextCard !== null
          ? `[data-board-card="${CSS.escape(nextCard.id)}"]`
          : `[data-board-cell="${CSS.escape(cellKey(card.storylineId, card.episodeId))}"] [data-tour="board.addCard"]`;
      focusBoardSelector(selector, viewportRef.current);
    },
    [filters.visibleCards, mutations],
  );

  const handlePrint = useCallback((): void => {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  }, []);

  useBoardController({
    data,
    visibleStorylines: filters.visibleStorylines,
    visibleCards: filters.visibleCards,
    selectedCardId,
    messages,
    sortableRef,
    viewportRef,
    onStartAddStoryline: () => setAddingStoryline(true),
    onStartAddCard: setAddingCardCell,
    onStartLinkScene: setLinkingCardId,
    onPrint: handlePrint,
  });

  useBoardShortcuts({
    enabled:
      data.lookup.status === "ready" && data.boardLoaded && !data.accessRemoved,
    canEdit: data.canEdit,
    visibleStorylines: filters.visibleStorylines,
    episodes: data.episodes,
    visibleCards: filters.visibleCards,
    selectedCardId,
    viewportRef,
    messages,
    onSelectCard: setSelectedCardId,
    onStartAddCard: setAddingCardCell,
    onStartLinkScene: setLinkingCardId,
    onDuplicateCard: mutations.duplicateCard,
    onToggleFlag: mutations.toggleCardFlag,
    onTogglePeek: (cardId) =>
      setPeekingCardId((prev) => (prev === cardId ? null : cardId)),
    onScrollEpisodes: scrollByEpisodes,
    onPrint: handlePrint,
  });

  if (data.lookup.status === "not_series") return null;
  if (data.lookup.status === "loading") return <BoardLoadingScreen />;

  const { empty, showToolbar, emptyKind } = deriveBoardEmptyKind({
    accessRemoved: data.accessRemoved,
    boardLoaded: data.boardLoaded,
    storylineCount: data.storylines.length,
    episodeCount: data.episodes.length,
    addingStoryline,
    hasActiveFilter: filters.hasActiveFilter,
    visibleCardCount: filters.visibleCards.length,
  });
  const statusSummary =
    data.boardLoaded && !data.accessRemoved && data.storylines.length > 0
      ? BOARD_WORDS.statusSummary(
          data.storylines.length,
          data.episodes.length,
          filters.seasonCards.length,
          filters.seasonCards.length - filters.unlinkedCount,
        )
      : null;
  const label = BOARD_WORDS.title(data.lookup.project.title);
  const goBack = (): void => void navigate({ href: "/" });

  const handleCancelStoryline = (r: "escape" | "blur" | "button"): void => {
    setAddingStoryline(false);
    if (r !== "blur")
      focusBoardSelector(
        `[data-region="title_bar"] button[aria-label="${CSS.escape(BOARD_WORDS.addStoryline)}"]`,
      );
  };
  const handleCancelAddCard = (
    s: string,
    e: string,
    r: "escape" | "blur" | "button",
  ): void => {
    setAddingCardCell(null);
    if (r !== "blur")
      focusBoardSelector(
        `[data-board-cell="${CSS.escape(cellKey(s, e))}"] [data-tour="board.addCard"]`,
        viewportRef.current,
      );
  };
  const handleToggleCollapse = (id: string): void =>
    setCollapsedStorylineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mn-board-print-root flex min-h-0 flex-1 flex-col bg-chrome text-fg">
      <BoardTitleBar
        projectTitle={data.lookup.project.title}
        seasons={data.seasons}
        activeSeason={data.activeSeason}
        canEdit={data.canEdit}
        showViewOnly={data.accessReady && !data.canEdit && !data.accessRemoved}
        empty={empty}
        onBack={goBack}
        onSeasonChange={(nextSeasonId) => {
          scrolledToEpRef.current = null;
          void navigate({
            href: `/p/${projectId}/board?season=${encodeURIComponent(nextSeasonId)}`,
            replace: true,
          });
        }}
        onAddStoryline={() => setAddingStoryline(true)}
        onPrint={handlePrint}
      />

      {showToolbar ? (
        <BoardToolbar
          query={filters.query}
          storylines={data.storylines}
          laneByStoryline={filters.laneByStoryline}
          cardCountByStoryline={filters.cardCountByStoryline}
          selectedStorylineIds={filters.selectedStorylineIds}
          unlinkedOnly={filters.unlinkedOnly}
          unlinkedCount={filters.unlinkedCount}
          flaggedOnly={filters.flaggedOnly}
          flaggedCount={filters.flaggedCount}
          episodes={data.episodes}
          visibleEpisodeIds={scrollState.visibleEpisodeIds}
          canScrollStart={scrollState.scrolledX}
          canScrollEnd={scrollState.overflowEnd}
          hasHorizontalOverflow={scrollState.hasHorizontalOverflow}
          density={density}
          filteredCardCount={filters.visibleCards.length}
          totalCardCount={filters.seasonCards.length}
          hasActiveFilter={filters.hasActiveFilter}
          onQueryChange={filters.setQuery}
          onToggleStoryline={filters.toggleStoryline}
          onClearStorylines={filters.clearStorylines}
          onToggleUnlinked={filters.toggleUnlinked}
          onToggleFlagged={filters.toggleFlagged}
          onClearFilters={filters.clearFilters}
          onJumpEpisode={jumpToEpisode}
          onScrollEpisodes={scrollByEpisodes}
          onDensityChange={setDensity}
        />
      ) : null}

      {emptyKind !== null ? (
        <BoardEmptyView
          kind={emptyKind}
          label={label}
          canEdit={data.canEdit}
          onBack={goBack}
          onAddStoryline={() => setAddingStoryline(true)}
          onClearFilters={filters.clearFilters}
        />
      ) : !data.boardLoaded && !addingStoryline ? (
        <main
          aria-label={label}
          className="flex min-h-0 flex-1 flex-col bg-desk"
        >
          <BoardGridSkeleton />
        </main>
      ) : (
        <BoardStage
          label={label}
          projectTitle={data.lookup.project.title}
          activeSeason={data.activeSeason}
          summary={statusSummary}
          hasActiveFilter={filters.hasActiveFilter}
          scrollState={scrollState}
          viewportRef={viewportRef}
          onScrollEpisodes={scrollByEpisodes}
          allStorylines={data.storylines}
          storylines={filters.visibleStorylines}
          laneByStoryline={filters.laneByStoryline}
          episodes={data.episodes}
          cards={filters.visibleCards}
          scenesByScript={scenesByScript}
          targetPages={data.targetPages}
          people={data.people}
          density={density}
          focusedEpisodeId={data.focusedEpisodeId}
          canEdit={data.canEdit}
          selectedCardId={selectedCardId}
          linkingCardId={linkingCardId}
          peekingCardId={peekingCardId}
          addingStoryline={addingStoryline}
          addingCardCell={addingCardCell}
          collapsedStorylineIds={collapsedStorylineIds}
          sortableRef={sortableRef}
          mutations={mutations}
          onSelectCard={setSelectedCardId}
          onLinkingCardChange={setLinkingCardId}
          onPeekingCardChange={setPeekingCardId}
          onOpenCard={handleOpenCard}
          onOpenDoc={handleOpenDoc}
          onCommitStoryline={(t) => (
            setAddingStoryline(false),
            mutations.commitStoryline(t)
          )}
          onCancelStoryline={handleCancelStoryline}
          onStartAddCard={(storylineId, episodeId) =>
            setAddingCardCell({ storylineId, episodeId })
          }
          onCommitAddCard={(s, e, t) => (
            setAddingCardCell(null),
            mutations.commitAddCard(s, e, t)
          )}
          onCommitAddCardAndContinue={(s, e, t) =>
            mutations.commitAddCard(s, e, t)
          }
          onCancelAddCard={handleCancelAddCard}
          onToggleCollapseStoryline={handleToggleCollapse}
          onToggleCollapseAll={() =>
            setCollapsedStorylineIds((prev) =>
              filters.visibleStorylines.every((s) => prev.has(s.id))
                ? new Set()
                : new Set(filters.visibleStorylines.map((s) => s.id)),
            )
          }
          onRemoveCard={handleRemoveCard}
        />
      )}

      <BoardStatusBar summary={statusSummary} />
    </div>
  );
}
