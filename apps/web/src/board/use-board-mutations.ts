// Guarded CRDT mutations for the Board: live snapshot reads before every write, with Undo on removals and link-clearing moves.
import { BOARD_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";
import { useCallback } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import {
  addCard,
  addStoryline,
  cardsInCell,
  duplicateCard,
  editCardText,
  moveCard,
  moveStoryline,
  readBoard,
  removeCard,
  removeStoryline,
  renameStoryline,
  restoreCard,
  restoreStoryline,
  setCardFlagged,
  setCardLink,
  setStorylineTone,
} from "./model.ts";
import type { BoardCard, BoardStoryline, StorylineTone } from "./model.ts";
import type { BoardData } from "./use-board-data.ts";

const UNDO_ACTION = Object.freeze({
  label: "Undo",
  commandId: "settings.undo",
});
const STORYLINE_REMOVED_ID = "board.storyline_removed";
const CARD_REMOVED_ID = "board.card_removed";
const CARD_MOVED_LINK_CLEARED_ID = "board.card_link_cleared";

export interface BoardMutations {
  commitStoryline(title: string): void;
  renameStoryline(storyline: BoardStoryline, title: string): void;
  setStorylineTone(storyline: BoardStoryline, tone: StorylineTone | null): void;
  moveStoryline(storyline: BoardStoryline, by: -1 | 1): void;
  removeStoryline(storyline: BoardStoryline): void;
  commitAddCard(storylineId: string, episodeId: string, text: string): void;
  editCardText(card: BoardCard, text: string): void;
  linkCardScene(card: BoardCard, blockId: string | null): void;
  duplicateCard(card: BoardCard): void;
  toggleCardFlag(card: BoardCard): void;
  moveCard(
    cardId: string,
    targetStorylineId: string,
    targetEpisodeId: string,
    targetIndex: number,
  ): void;
  moveCardToEpisode(card: BoardCard, episodeId: string): void;
  moveCardToStoryline(card: BoardCard, storylineId: string): void;
  removeCard(cardId: string): void;
}

export function useBoardMutations(
  data: BoardData,
  callbacks: {
    onCardCreated(cardId: string): void;
    onCardRemoved(cardId: string): void;
    onStorylineCreated?(storylineId: string): void;
    moveViaSortable?(
      cardId: string,
      storylineId: string,
      episodeId: string,
      targetIndex: number,
    ): boolean;
  },
): BoardMutations {
  const { messages, reverses } = useServices();
  const { dom, randomId } = useEnvironment();
  const { onCardCreated, onCardRemoved, onStorylineCreated, moveViaSortable } =
    callbacks;

  const commitStoryline = useCallback(
    (title: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map);
        const created = addStoryline(map, live.storylines, randomId(), title);
        onStorylineCreated?.(created.id);
      });
    },
    [data, randomId, onStorylineCreated],
  );

  const handleRenameStoryline = useCallback(
    (storyline: BoardStoryline, title: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live =
          readBoard(map).storylines.find((s) => s.id === storyline.id) ??
          storyline;
        renameStoryline(map, live, title);
      });
    },
    [data],
  );

  const handleSetStorylineTone = useCallback(
    (storyline: BoardStoryline, tone: StorylineTone | null): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live =
          readBoard(map).storylines.find((s) => s.id === storyline.id) ??
          storyline;
        setStorylineTone(map, live, tone);
      });
    },
    [data],
  );

  const handleMoveStoryline = useCallback(
    (storyline: BoardStoryline, by: -1 | 1): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map);
        const index = live.storylines.findIndex((s) => s.id === storyline.id);
        if (index === -1) return;
        const target = index + by;
        if (target < 0 || target >= live.storylines.length) return;
        const current = live.storylines[index]!;
        moveStoryline(map, current, live.storylines, target);
        dom.announce(
          BOARD_WORDS.movedStoryline(
            current.title,
            target + 1,
            live.storylines.length,
          ),
        );
      });
    },
    [data, dom],
  );

  const handleRemoveStoryline = useCallback(
    (storyline: BoardStoryline): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map);
        const current =
          live.storylines.find((s) => s.id === storyline.id) ?? storyline;
        const removed = removeStoryline(map, current, live.cards);
        const message: Message = {
          id: STORYLINE_REMOVED_ID,
          text: BOARD_WORDS.removedStoryline(current.title, removed.length),
          actions: [UNDO_ACTION],
          lifetime: "reverse",
          ownWork: false,
        };
        reverses.set(message.id, () => {
          void data.writableBoardMap().then((undoMap) => {
            if (undoMap !== null) restoreStoryline(undoMap, current, removed);
          });
        });
        messages.push(message);
        dom.announce(message.text);
      });
    },
    [data, messages, reverses, dom],
  );

  const commitAddCard = useCallback(
    (storylineId: string, episodeId: string, text: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map);
        const cell = cardsInCell(live.cards, storylineId, episodeId);
        const created = addCard(map, cell, {
          id: randomId(),
          storylineId,
          episodeId,
          text,
        });
        onCardCreated(created.id);
      });
    },
    [data, randomId, onCardCreated],
  );

  const handleEditCardText = useCallback(
    (card: BoardCard, text: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map).cards.find((c) => c.id === card.id) ?? card;
        editCardText(map, live, text);
      });
    },
    [data],
  );

  const linkCardScene = useCallback(
    (card: BoardCard, blockId: string | null): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map).cards.find((c) => c.id === card.id) ?? card;
        setCardLink(map, live, blockId === null ? null : { blockId });
      });
    },
    [data],
  );

  const handleDuplicateCard = useCallback(
    (card: BoardCard): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map);
        const source = live.cards.find((c) => c.id === card.id) ?? card;
        const cell = cardsInCell(
          live.cards,
          source.storylineId,
          source.episodeId,
        );
        const created = duplicateCard(map, cell, source, randomId());
        onCardCreated(created.id);
        dom.announce(BOARD_WORDS.duplicatedCard(source.text));
      });
    },
    [data, randomId, onCardCreated, dom],
  );

  const handleToggleCardFlag = useCallback(
    (card: BoardCard): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map).cards.find((c) => c.id === card.id) ?? card;
        setCardFlagged(map, live, live.flagged !== true);
      });
    },
    [data],
  );

  const handleMoveCard = useCallback(
    (
      cardId: string,
      targetStorylineId: string,
      targetEpisodeId: string,
      targetIndex: number,
    ): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map);
        const liveCard = live.cards.find((c) => c.id === cardId);
        if (liveCard === undefined) return;
        const clearedLink =
          liveCard.link !== null && targetEpisodeId !== liveCard.episodeId;
        moveCard(
          map,
          liveCard,
          targetStorylineId,
          targetEpisodeId,
          live.cards,
          targetIndex,
        );
        if (clearedLink) {
          const targetEp = data.episodes.find((e) => e.id === targetEpisodeId);
          if (targetEp !== undefined) {
            const message: Message = {
              id: CARD_MOVED_LINK_CLEARED_ID,
              text: BOARD_WORDS.movedCardClearedLink(targetEp.number),
              actions: [UNDO_ACTION],
              lifetime: "reverse",
              ownWork: false,
            };
            reverses.set(message.id, () => {
              void data.writableBoardMap().then((undoMap) => {
                if (undoMap !== null) restoreCard(undoMap, liveCard);
              });
            });
            messages.push(message);
          }
        }
      });
    },
    [data, messages, reverses],
  );

  const announceCrossMove = useCallback(
    (card: BoardCard, targetStorylineId: string, targetEpisodeId: string) => {
      const storyline = data.storylines.find((s) => s.id === targetStorylineId);
      const episode = data.episodes.find((e) => e.id === targetEpisodeId);
      if (storyline === undefined || episode === undefined) return;
      const count =
        cardsInCell(data.cards, targetStorylineId, targetEpisodeId).length + 1;
      dom.announce(
        BOARD_WORDS.movedToList(
          card.text,
          count,
          count,
          BOARD_WORDS.cellLabel(storyline.title, episode.number),
        ),
      );
    },
    [data.cards, data.episodes, data.storylines, dom],
  );

  const moveCardToEpisode = useCallback(
    (card: BoardCard, episodeId: string): void => {
      if (episodeId === card.episodeId) return;
      const count = cardsInCell(data.cards, card.storylineId, episodeId).length;
      if (moveViaSortable?.(card.id, card.storylineId, episodeId, count)) {
        return;
      }
      handleMoveCard(card.id, card.storylineId, episodeId, count);
      announceCrossMove(card, card.storylineId, episodeId);
    },
    [announceCrossMove, data.cards, handleMoveCard, moveViaSortable],
  );

  const moveCardToStoryline = useCallback(
    (card: BoardCard, storylineId: string): void => {
      if (storylineId === card.storylineId) return;
      const count = cardsInCell(data.cards, storylineId, card.episodeId).length;
      if (moveViaSortable?.(card.id, storylineId, card.episodeId, count)) {
        return;
      }
      handleMoveCard(card.id, storylineId, card.episodeId, count);
      announceCrossMove(card, storylineId, card.episodeId);
    },
    [announceCrossMove, data.cards, handleMoveCard, moveViaSortable],
  );

  const handleRemoveCard = useCallback(
    (cardId: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const live = readBoard(map);
        const liveCard = live.cards.find((c) => c.id === cardId);
        removeCard(map, cardId);
        onCardRemoved(cardId);
        if (liveCard !== undefined) {
          const message: Message = {
            id: CARD_REMOVED_ID,
            text: BOARD_WORDS.removedCard(liveCard.text),
            actions: [UNDO_ACTION],
            lifetime: "reverse",
            ownWork: false,
          };
          reverses.set(message.id, () => {
            void data.writableBoardMap().then((undoMap) => {
              if (undoMap !== null) restoreCard(undoMap, liveCard);
            });
          });
          messages.push(message);
          dom.announce(message.text);
        }
      });
    },
    [data, onCardRemoved, messages, reverses, dom],
  );

  return {
    commitStoryline,
    renameStoryline: handleRenameStoryline,
    setStorylineTone: handleSetStorylineTone,
    moveStoryline: handleMoveStoryline,
    removeStoryline: handleRemoveStoryline,
    commitAddCard,
    editCardText: handleEditCardText,
    linkCardScene,
    duplicateCard: handleDuplicateCard,
    toggleCardFlag: handleToggleCardFlag,
    moveCard: handleMoveCard,
    moveCardToEpisode,
    moveCardToStoryline,
    removeCard: handleRemoveCard,
  };
}
