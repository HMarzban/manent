// The Board's sticky 2D storyline × episode matrix backed by single-cell SortableLists, 2D keyboard navigation and collapse.
import type { EpisodeEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  SortableLists,
  createKeyResolver,
  useCommands,
} from "@manent/ui";
import type { SortableListsHandle } from "@manent/ui";
import { useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { EpisodeScenesState } from "../../board/episode-scenes.ts";
import { cardsInCell, parseCellKey } from "../../board/model.ts";
import type {
  BoardCard,
  BoardStoryline,
  StorylineTone,
} from "../../board/model.ts";
import type { BoardMutations } from "../../board/use-board-mutations.ts";
import type { SeriesPerson } from "../library/series/series-facts.ts";
import { BoardCardItem } from "./board-card.tsx";
import { BoardCellFooter } from "./board-cell-footer.tsx";
import { handleBoardGridKeyDown } from "./board-grid-keyboard.ts";
import { useBoardGridModel } from "./board-grid-model.ts";
import { AddStorylineInput } from "./board-inputs.tsx";
import { BoardCornerCell, BoardStaticMatrix } from "./board-readonly-grid.tsx";
import type { BoardDensity } from "./board-view.ts";
import { EpisodeHeader } from "./episode-header.tsx";
import { StorylineHeader } from "./storyline-header.tsx";

const MOVE_COMMANDS: readonly string[] = Object.freeze([
  "board.moveCardUp",
  "board.moveCardDown",
  "board.moveCardLeft",
  "board.moveCardRight",
]);

export interface AddingCardCell {
  readonly storylineId: string;
  readonly episodeId: string;
}

export interface BoardGridProps {
  readonly allStorylines: readonly BoardStoryline[];
  readonly storylines: readonly BoardStoryline[];
  readonly laneByStoryline: ReadonlyMap<string, StorylineTone>;
  readonly episodes: readonly EpisodeEntry[];
  readonly cards: readonly BoardCard[];
  readonly scenesByScript: ReadonlyMap<string, EpisodeScenesState>;
  readonly targetPages: number | null;
  readonly people: readonly SeriesPerson[];
  readonly density: BoardDensity;
  readonly focusedEpisodeId: string | null;
  readonly canEdit: boolean;
  readonly selectedCardId: string | null;
  readonly linkingCardId: string | null;
  readonly peekingCardId?: string | null;
  readonly addingStoryline: boolean;
  readonly addingCardCell: AddingCardCell | null;
  readonly collapsedStorylineIds: ReadonlySet<string>;
  readonly sortableRef: RefObject<SortableListsHandle | null>;
  readonly mutations: BoardMutations;
  onSelectCard(cardId: string): void;
  onLinkingCardChange(cardId: string | null): void;
  onPeekingCardChange?(cardId: string | null): void;
  onOpenCard(card: BoardCard, episode: EpisodeEntry): void;
  onOpenDoc(docId: string): void;
  onCommitStoryline(title: string): void;
  onCancelStoryline(reason: "escape" | "blur" | "button"): void;
  onStartAddCard(storylineId: string, episodeId: string): void;
  onCommitAddCard(storylineId: string, episodeId: string, text: string): void;
  onCommitAddCardAndContinue?(
    storylineId: string,
    episodeId: string,
    text: string,
  ): void;
  onCancelAddCard(
    storylineId: string,
    episodeId: string,
    reason: "escape" | "blur" | "button",
  ): void;
  onToggleCollapseStoryline(storylineId: string): void;
  onToggleCollapseAll(): void;
  onRemoveCard(card: BoardCard): void;
}

export function BoardGrid(props: BoardGridProps): ReactNode {
  const {
    allStorylines,
    storylines,
    laneByStoryline,
    episodes,
    cards,
    density,
    canEdit,
    collapsedStorylineIds,
    mutations,
  } = props;
  const { service, resolved } = useCommands();
  const [hoveredStorylineId, setHoveredStorylineId] = useState<string | null>(
    null,
  );

  const resolveKey = useMemo(
    () =>
      createKeyResolver({
        table: () =>
          MOVE_COMMANDS.flatMap((id) =>
            (resolved.get().effective.get(id) ?? []).map((chord) => ({
              id,
              chord,
            })),
          ),
      }),
    [resolved],
  );

  const {
    storylineById,
    storylineIndexById,
    episodeById,
    cardById,
    cardCountByEpisode,
    storylineStats,
    lists,
  } = useBoardGridModel({
    allStorylines,
    storylines,
    episodes,
    cards,
    collapsedStorylineIds,
  });

  const renderCard = (cardId: string): ReactNode => {
    const card = cardById.get(cardId);
    if (card === undefined) return null;
    const storyline = storylineById.get(card.storylineId);
    const episode = episodeById.get(card.episodeId);
    if (storyline === undefined || episode === undefined) return null;
    const scenesState =
      episode.docIds.script === null
        ? undefined
        : props.scenesByScript.get(episode.docIds.script);
    return (
      <BoardCardItem
        card={card}
        storyline={storyline}
        lane={laneByStoryline.get(storyline.id) ?? 1}
        episode={episode}
        storylines={allStorylines}
        laneByStoryline={laneByStoryline}
        episodes={episodes}
        scenesState={scenesState}
        density={density}
        selected={props.selectedCardId === card.id}
        canEdit={canEdit}
        linkingOpen={props.linkingCardId === card.id}
        peekingOpen={(props.peekingCardId ?? null) === card.id}
        onLinkingOpenChange={(open) =>
          props.onLinkingCardChange(open ? card.id : null)
        }
        onPeekingOpenChange={
          props.onPeekingCardChange === undefined
            ? undefined
            : (open) => props.onPeekingCardChange?.(open ? card.id : null)
        }
        onSelect={() => props.onSelectCard(card.id)}
        onOpen={() => props.onOpenCard(card, episode)}
        onEditText={(text) => mutations.editCardText(card, text)}
        onLinkScene={(blockId) => mutations.linkCardScene(card, blockId)}
        onDuplicate={() => mutations.duplicateCard(card)}
        onToggleFlag={() => mutations.toggleCardFlag(card)}
        onMoveToEpisode={(episodeId) =>
          mutations.moveCardToEpisode(card, episodeId)
        }
        onMoveToStoryline={(storylineId) =>
          mutations.moveCardToStoryline(card, storylineId)
        }
        onRemove={() => props.onRemoveCard(card)}
      />
    );
  };

  const handleDrop = (
    itemId: string,
    toListId: string,
    toIndex: number,
  ): void => {
    if (!canEdit) return;
    const parsed = parseCellKey(toListId);
    if (parsed === null) return;
    mutations.moveCard(itemId, parsed.storylineId, parsed.episodeId, toIndex);
  };

  const epTrack =
    density === "fit"
      ? "minmax(var(--board-ep-w), 1fr)"
      : "minmax(var(--board-ep-w), var(--board-ep-max))";
  const columns =
    episodes.length > 0
      ? `var(--board-rail-w) repeat(${episodes.length}, ${epTrack})`
      : "1fr";
  const allCollapsed =
    storylines.length > 0 &&
    storylines.every((s) => collapsedStorylineIds.has(s.id));

  const headerCells = (
    <>
      <BoardCornerCell
        storylineCount={storylines.length}
        allCollapsed={allCollapsed}
        onToggleCollapseAll={props.onToggleCollapseAll}
      />
      {episodes.map((episode, col) => (
        <EpisodeHeader
          key={episode.id}
          episode={episode}
          colIndex={col}
          cardCount={cardCountByEpisode.get(episode.id) ?? 0}
          targetPages={props.targetPages}
          people={props.people}
          density={density}
          focused={props.focusedEpisodeId === episode.id}
          onOpenDoc={props.onOpenDoc}
        />
      ))}
    </>
  );

  const renderStorylineBefore = (rowIndex: number): ReactNode => {
    const storyline = storylines[rowIndex];
    if (storyline === undefined) return null;
    const stats = storylineStats.get(storyline.id);
    const fullIndex = storylineIndexById.get(storyline.id) ?? rowIndex;
    return (
      <StorylineHeader
        storyline={storyline}
        rowStart={rowIndex + 2}
        isLast={rowIndex === storylines.length - 1 && !props.addingStoryline}
        canEdit={canEdit}
        lane={laneByStoryline.get(storyline.id) ?? 1}
        cardCount={stats?.count ?? 0}
        unlinkedCount={stats?.unlinked ?? 0}
        episodeCoverage={stats?.coverage ?? []}
        collapsed={collapsedStorylineIds.has(storyline.id)}
        canMoveUp={fullIndex > 0}
        canMoveDown={fullIndex < allStorylines.length - 1}
        hovered={hoveredStorylineId === storyline.id}
        onRename={(t) => mutations.renameStoryline(storyline, t)}
        onSetTone={(t) => mutations.setStorylineTone(storyline, t)}
        onMove={(by) => mutations.moveStoryline(storyline, by)}
        onRemove={() => mutations.removeStoryline(storyline)}
        onToggleCollapse={() => props.onToggleCollapseStoryline(storyline.id)}
        onHoverChange={(h) => setHoveredStorylineId(h ? storyline.id : null)}
      />
    );
  };

  const renderFooterFor = (
    storyline: BoardStoryline,
    episode: EpisodeEntry,
    cellCardCount: number,
  ): ReactNode => (
    <BoardCellFooter
      storyline={storyline}
      episode={episode}
      lane={laneByStoryline.get(storyline.id) ?? 1}
      collapsed={collapsedStorylineIds.has(storyline.id)}
      cellCardCount={cellCardCount}
      canEdit={canEdit}
      isAdding={
        canEdit &&
        props.addingCardCell?.storylineId === storyline.id &&
        props.addingCardCell.episodeId === episode.id
      }
      onToggleCollapse={() => props.onToggleCollapseStoryline(storyline.id)}
      onStartAdd={() => props.onStartAddCard(storyline.id, episode.id)}
      onCommitAdd={(text) =>
        props.onCommitAddCard(storyline.id, episode.id, text)
      }
      onCommitAddAndContinue={
        props.onCommitAddCardAndContinue === undefined
          ? undefined
          : (text) =>
              props.onCommitAddCardAndContinue?.(storyline.id, episode.id, text)
      }
      onCancelAdd={(r) => props.onCancelAddCard(storyline.id, episode.id, r)}
    />
  );

  const addStorylineRow =
    props.addingStoryline && canEdit ? (
      <AddStorylineInput
        episodeCount={episodes.length}
        rowIndex={storylines.length}
        lane={((allStorylines.length % 10) + 1) as StorylineTone}
        onCommit={props.onCommitStoryline}
        onCancel={props.onCancelStoryline}
      />
    ) : null;
  const listClassName =
    density === "comfortable"
      ? "relative flex min-w-0 flex-col gap-2"
      : "relative flex min-w-0 flex-col gap-1.5";

  const cellPropsFor = (
    list: { readonly id: string; readonly items: readonly unknown[] },
    index: number,
  ) => {
    const rowIndex = Math.floor(index / episodes.length);
    const colIndex = index % episodes.length;
    const sl = storylines[rowIndex];
    const ep = episodes[colIndex];
    return {
      "data-board-cell": list.id,
      "data-lane": String(sl ? (laneByStoryline.get(sl.id) ?? 1) : 1),
      "data-empty": list.items.length === 0 ? "true" : "false",
      "data-collapsed":
        sl && collapsedStorylineIds.has(sl.id) ? "true" : undefined,
      "data-lane-hover":
        sl && hoveredStorylineId === sl.id ? "true" : undefined,
      "data-focused-ep":
        ep && props.focusedEpisodeId === ep.id ? "true" : undefined,
      style: { gridColumn: colIndex + 2, gridRow: rowIndex + 2 },
      className: "mn-board-cell",
      onPointerEnter: () => sl && setHoveredStorylineId(sl.id),
      onPointerLeave: () => setHoveredStorylineId(null),
    };
  };

  return (
    <div
      data-tour="board"
      onKeyDownCapture={(event) =>
        handleBoardGridKeyDown({
          event,
          canEdit,
          storylines,
          episodes,
          cardById,
          episodeById,
          resolveKey,
          runCommand: (id) => service.run(id, "key"),
          onOpenCard: props.onOpenCard,
          onRemoveCard: props.onRemoveCard,
        })
      }
      className="min-w-full"
    >
      {episodes.length > 0 && storylines.length > 0 && canEdit ? (
        <SortableLists
          ref={props.sortableRef}
          lists={lists}
          onMove={handleDrop}
          renderItem={renderCard}
          instructions={BOARD_WORDS.dragInstructions}
          areaClassName="mn-board-grid"
          areaStyle={{ gridTemplateColumns: columns }}
          areaDataRing="inset"
          listClassName={listClassName}
          beforeLists={headerCells}
          afterLists={addStorylineRow}
          renderBeforeList={(_list, i) =>
            i % episodes.length === 0
              ? renderStorylineBefore(Math.floor(i / episodes.length))
              : null
          }
          getCellProps={cellPropsFor}
          renderListFooter={(_list, i) => {
            const sl = storylines[Math.floor(i / episodes.length)];
            const ep = episodes[i % episodes.length];
            return sl && ep
              ? renderFooterFor(sl, ep, cardsInCell(cards, sl.id, ep.id).length)
              : null;
          }}
        />
      ) : (
        <BoardStaticMatrix
          columns={columns}
          headerCells={headerCells}
          storylines={storylines}
          episodes={episodes}
          cards={cards}
          laneByStoryline={laneByStoryline}
          collapsedStorylineIds={collapsedStorylineIds}
          hoveredStorylineId={hoveredStorylineId}
          focusedEpisodeId={props.focusedEpisodeId}
          listClassName={listClassName}
          addStorylineRow={addStorylineRow}
          onHoverStoryline={setHoveredStorylineId}
          renderStorylineBefore={renderStorylineBefore}
          renderCard={renderCard}
          renderFooterFor={renderFooterFor}
        />
      )}
    </div>
  );
}
