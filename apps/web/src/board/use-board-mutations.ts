// Guarded CRDT mutations for the Board: every write runs only through `writableBoardMap`, with Undo on storyline removal.
import { BOARD_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";
import { useCallback } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import {
  addCard,
  addStoryline,
  cardsInCell,
  editCardText,
  moveCard,
  removeCard,
  removeStoryline,
  renameStoryline,
  restoreStoryline,
  setCardLink,
} from "./model.ts";
import type { BoardCard, BoardStoryline } from "./model.ts";
import type { BoardData } from "./use-board-data.ts";

const UNDO_ACTION = Object.freeze({
  label: "Undo",
  commandId: "settings.undo",
});
const STORYLINE_REMOVED_ID = "board.storyline_removed";

export interface BoardMutations {
  commitStoryline(title: string): void;
  renameStoryline(storyline: BoardStoryline, title: string): void;
  removeStoryline(storyline: BoardStoryline): void;
  commitAddCard(storylineId: string, episodeId: string, text: string): void;
  editCardText(card: BoardCard, text: string): void;
  linkCardScene(card: BoardCard, blockId: string | null): void;
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
  },
): BoardMutations {
  const { messages, reverses } = useServices();
  const { dom, randomId } = useEnvironment();
  const { onCardCreated, onCardRemoved } = callbacks;

  const commitStoryline = useCallback(
    (title: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map !== null) addStoryline(map, data.storylines, randomId(), title);
      });
    },
    [data, randomId],
  );

  const handleRenameStoryline = useCallback(
    (storyline: BoardStoryline, title: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map !== null) renameStoryline(map, storyline, title);
      });
    },
    [data],
  );

  const handleRemoveStoryline = useCallback(
    (storyline: BoardStoryline): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const removed = removeStoryline(map, storyline, data.cards);
        if (removed.length === 0) return;
        const message: Message = {
          id: STORYLINE_REMOVED_ID,
          text: BOARD_WORDS.removedStoryline(storyline.title, removed.length),
          actions: [UNDO_ACTION],
          lifetime: "reverse",
          ownWork: false,
        };
        reverses.set(message.id, () => {
          void data.writableBoardMap().then((undoMap) => {
            if (undoMap !== null) restoreStoryline(undoMap, storyline, removed);
          });
        });
        messages.push(message);
      });
    },
    [data, messages, reverses],
  );

  const commitAddCard = useCallback(
    (storylineId: string, episodeId: string, text: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        const cell = cardsInCell(data.cards, storylineId, episodeId);
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
        if (map !== null) editCardText(map, card, text);
      });
    },
    [data],
  );

  const linkCardScene = useCallback(
    (card: BoardCard, blockId: string | null): void => {
      void data.writableBoardMap().then((map) => {
        if (map !== null)
          setCardLink(map, card, blockId === null ? null : { blockId });
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
      const card = data.cards.find((c) => c.id === cardId);
      if (card === undefined) return;
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        moveCard(
          map,
          card,
          targetStorylineId,
          targetEpisodeId,
          data.cards,
          targetIndex,
        );
      });
    },
    [data],
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
      handleMoveCard(card.id, card.storylineId, episodeId, count);
      announceCrossMove(card, card.storylineId, episodeId);
    },
    [announceCrossMove, data.cards, handleMoveCard],
  );

  const moveCardToStoryline = useCallback(
    (card: BoardCard, storylineId: string): void => {
      if (storylineId === card.storylineId) return;
      const count = cardsInCell(data.cards, storylineId, card.episodeId).length;
      handleMoveCard(card.id, storylineId, card.episodeId, count);
      announceCrossMove(card, storylineId, card.episodeId);
    },
    [announceCrossMove, data.cards, handleMoveCard],
  );

  const handleRemoveCard = useCallback(
    (cardId: string): void => {
      void data.writableBoardMap().then((map) => {
        if (map === null) return;
        removeCard(map, cardId);
        onCardRemoved(cardId);
      });
    },
    [data, onCardRemoved],
  );

  return {
    commitStoryline,
    renameStoryline: handleRenameStoryline,
    removeStoryline: handleRemoveStoryline,
    commitAddCard,
    editCardText: handleEditCardText,
    linkCardScene,
    moveCard: handleMoveCard,
    moveCardToEpisode,
    moveCardToStoryline,
    removeCard: handleRemoveCard,
  };
}
