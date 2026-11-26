// The Board's 2D grid of storylines against episodes, backed by SortableLists for dragging and command moves.
import type { EpisodeEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  Button,
  SERIES_WORDS,
  SortableLists,
  createKeyResolver,
  useCommands,
} from "@manent/ui";
import type { SortableListsHandle } from "@manent/ui";
import { PlusIcon } from "lucide-react";
import { Fragment, useMemo } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type { EpisodeScene } from "../../board/episode-scenes.ts";
import { cardsInCell, cellKey, parseCellKey } from "../../board/model.ts";
import type { BoardCard, BoardStoryline } from "../../board/model.ts";
import type { BoardMutations } from "../../board/use-board-mutations.ts";
import { BoardCardItem } from "./board-card.tsx";
import { AddCardInput, AddStorylineInput } from "./board-inputs.tsx";
import { StorylineHeader } from "./storyline-header.tsx";

const MOVE_COMMANDS: readonly string[] = Object.freeze([
  "board.moveCardUp",
  "board.moveCardDown",
]);

export interface AddingCardCell {
  readonly storylineId: string;
  readonly episodeId: string;
}

export interface BoardGridProps {
  readonly storylines: readonly BoardStoryline[];
  readonly episodes: readonly EpisodeEntry[];
  readonly cards: readonly BoardCard[];
  readonly scenesByScript: ReadonlyMap<string, readonly EpisodeScene[]>;
  readonly canEdit: boolean;
  readonly selectedCardId: string | null;
  readonly linkingCardId: string | null;
  readonly addingStoryline: boolean;
  readonly addingCardCell: AddingCardCell | null;
  readonly sortableRef: RefObject<SortableListsHandle | null>;
  readonly mutations: BoardMutations;
  onSelectCard(cardId: string): void;
  onLinkingCardChange(cardId: string | null): void;
  onOpenCard(card: BoardCard, episode: EpisodeEntry): void;
  onCommitStoryline(title: string): void;
  onCancelStoryline(): void;
  onStartAddCard(storylineId: string, episodeId: string): void;
  onCommitAddCard(storylineId: string, episodeId: string, text: string): void;
  onCancelAddCard(): void;
}

export function BoardGrid(props: BoardGridProps): ReactNode {
  const {
    storylines,
    episodes,
    cards,
    scenesByScript,
    canEdit,
    selectedCardId,
    linkingCardId,
    addingStoryline,
    addingCardCell,
    sortableRef,
    mutations,
    onSelectCard,
    onLinkingCardChange,
    onOpenCard,
    onCommitStoryline,
    onCancelStoryline,
    onStartAddCard,
    onCommitAddCard,
    onCancelAddCard,
  } = props;
  const { service, resolved } = useCommands();

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

  const storylineById = useMemo(
    () => new Map(storylines.map((s) => [s.id, s])),
    [storylines],
  );
  const episodeById = useMemo(
    () => new Map(episodes.map((e) => [e.id, e])),
    [episodes],
  );
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const lists = useMemo(
    () =>
      storylines.flatMap((storyline) =>
        episodes.map((episode) => ({
          id: cellKey(storyline.id, episode.id),
          label: BOARD_WORDS.cellLabel(storyline.title, episode.number),
          items: cardsInCell(cards, storyline.id, episode.id).map((card) => ({
            id: card.id,
            label: BOARD_WORDS.cardLabel(
              card.text,
              episode.number,
              storyline.title,
            ),
          })),
        })),
      ),
    [storylines, episodes, cards],
  );

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>): void => {
    const dragging =
      event.currentTarget.querySelector("[data-dragging]") !== null;
    if (dragging) return;
    const commandId = resolveKey(event.nativeEvent);
    if (commandId !== null) {
      event.preventDefault();
      event.stopPropagation();
      service.run(commandId, "key");
      return;
    }
    // Enter opens a focused card rather than starting a keyboard drag; Space picks a card up to drag
    if (
      event.key === "Enter" &&
      event.target instanceof HTMLElement &&
      event.target.hasAttribute("data-board-card")
    ) {
      const cardId = event.target.getAttribute("data-board-card");
      const card = cardId === null ? undefined : cardById.get(cardId);
      const episode =
        card === undefined ? undefined : episodeById.get(card.episodeId);
      if (card !== undefined && episode !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        onOpenCard(card, episode);
      }
    }
  };

  const renderCard = (cardId: string): ReactNode => {
    const card = cardById.get(cardId);
    if (card === undefined) return null;
    const storyline = storylineById.get(card.storylineId);
    const episode = episodeById.get(card.episodeId);
    if (storyline === undefined || episode === undefined) return null;
    const scenes =
      episode.docIds.script === null
        ? []
        : (scenesByScript.get(episode.docIds.script) ?? []);
    return (
      <BoardCardItem
        card={card}
        storyline={storyline}
        episode={episode}
        storylines={storylines}
        episodes={episodes}
        scenes={scenes}
        selected={selectedCardId === card.id}
        canEdit={canEdit}
        linkingOpen={linkingCardId === card.id}
        onLinkingOpenChange={(open) =>
          onLinkingCardChange(open ? card.id : null)
        }
        onSelect={() => onSelectCard(card.id)}
        onOpen={() => onOpenCard(card, episode)}
        onEditText={(text) => mutations.editCardText(card, text)}
        onLinkScene={(blockId) => mutations.linkCardScene(card, blockId)}
        onMoveToEpisode={(episodeId) =>
          mutations.moveCardToEpisode(card, episodeId)
        }
        onMoveToStoryline={(storylineId) =>
          mutations.moveCardToStoryline(card, storylineId)
        }
        onRemove={() => mutations.removeCard(card.id)}
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

  const columns =
    episodes.length > 0
      ? `var(--board-storyline-col) repeat(${episodes.length}, minmax(var(--board-ep-col), 1fr))`
      : "1fr";
  const totalCols = episodes.length + 1;

  return (
    <div
      data-tour="board"
      onKeyDownCapture={onKeyDownCapture}
      className="min-w-full overflow-x-auto"
    >
      <div
        data-ring="inset"
        style={{ gridTemplateColumns: columns }}
        className="grid w-max min-w-full overflow-hidden rounded-surface border border-line bg-chrome [--board-ep-col:12.5rem] [--board-storyline-col:8.5rem] sm:[--board-ep-col:14rem] sm:[--board-storyline-col:13rem]"
      >
        <div
          aria-hidden="true"
          style={{ gridColumn: 1, gridRow: 1 }}
          className="min-h-row border-b border-line bg-chrome px-3 py-2"
        />
        {episodes.map((episode, col) => (
          <div
            key={episode.id}
            style={{ gridColumn: col + 2, gridRow: 1 }}
            className="flex min-w-0 items-baseline gap-2 border-b border-l border-line bg-chrome px-3 py-2"
          >
            <span className="shrink-0 text-micro font-semibold text-fg-muted tabular-nums">
              {episode.number}
            </span>
            <span className="min-w-0 truncate text-ui font-medium text-fg">
              {episode.title ?? SERIES_WORDS.untitledEpisode}
            </span>
          </div>
        ))}

        {storylines.map((storyline, rowIndex) => {
          const rowStart = 2 + rowIndex * 2;
          const isLast = rowIndex === storylines.length - 1 && !addingStoryline;
          return (
            <Fragment key={storyline.id}>
              <StorylineHeader
                storyline={storyline}
                rowStart={rowStart}
                isLast={isLast}
                canEdit={canEdit}
                onRename={(title) =>
                  mutations.renameStoryline(storyline, title)
                }
                onRemove={() => mutations.removeStoryline(storyline)}
              />
              {episodes.map((episode, colIndex) => {
                const isAdding =
                  canEdit &&
                  addingCardCell?.storylineId === storyline.id &&
                  addingCardCell.episodeId === episode.id;
                return (
                  <div
                    key={`${storyline.id}:${episode.id}:foot`}
                    style={{ gridColumn: colIndex + 2, gridRow: rowStart + 1 }}
                    className={`border-l border-line bg-chrome px-2 pt-1 pb-2${isLast ? "" : " border-b"}`}
                  >
                    {isAdding ? (
                      <AddCardInput
                        onCommit={(text) =>
                          onCommitAddCard(storyline.id, episode.id, text)
                        }
                        onCancel={onCancelAddCard}
                      />
                    ) : canEdit ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        data-tour="board.addCard"
                        onClick={() => onStartAddCard(storyline.id, episode.id)}
                        className="w-full justify-start text-fg-muted hover:text-fg"
                      >
                        <PlusIcon
                          aria-hidden="true"
                          data-icon="inline-start"
                          className="size-icon"
                        />
                        {BOARD_WORDS.addCard}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </Fragment>
          );
        })}

        {episodes.length > 0 && storylines.length > 0 ? (
          canEdit ? (
            <div className="contents [&>div]:contents [&>div>[role=list]]:flex [&>div>[role=list]]:min-h-12 [&>div>[role=list]]:min-w-0 [&>div>[role=list]]:flex-col [&>div>[role=list]]:gap-2 [&>div>[role=list]]:border-l [&>div>[role=list]]:border-line [&>div>[role=list]]:bg-chrome [&>div>[role=list]]:p-2 [&>div>[role=list]:empty]:min-h-2 [&>div>[role=list]:empty]:p-1">
              <SortableLists
                ref={sortableRef}
                lists={lists}
                onMove={handleDrop}
                renderItem={renderCard}
              />
            </div>
          ) : (
            lists.map((list) => (
              <div
                key={list.id}
                role="list"
                aria-label={list.label}
                className={`flex min-w-0 flex-col gap-2 border-l border-line bg-chrome ${list.items.length === 0 ? "min-h-2 p-1" : "min-h-12 p-2"}`}
              >
                {list.items.map((item) => (
                  <div key={item.id} role="listitem">
                    {renderCard(item.id)}
                  </div>
                ))}
              </div>
            ))
          )
        ) : null}

        {addingStoryline && canEdit ? (
          <AddStorylineInput
            columnSpan={totalCols}
            onCommit={onCommitStoryline}
            onCancel={onCancelStoryline}
          />
        ) : null}
      </div>
    </div>
  );
}
