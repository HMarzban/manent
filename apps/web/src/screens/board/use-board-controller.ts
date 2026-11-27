// Registers the Board screen's keyboard/palette command controller (add storyline, add card, link scene, move card).
import { BOARD_WORDS, messageFor } from "@manent/ui";
import type { SortableListsHandle } from "@manent/ui";
import { useEffect } from "react";
import type { RefObject } from "react";
import { registerBoardController } from "../../board/board-actions.ts";
import { cardsInCell, cellKey } from "../../board/model.ts";
import type { BoardCard, BoardStoryline } from "../../board/model.ts";
import type { BoardData } from "../../board/use-board-data.ts";
import type { PersonServices } from "../../services/ports.ts";
import type { AddingCardCell } from "./board-grid.tsx";

export function useBoardController(args: {
  readonly data: BoardData;
  readonly visibleStorylines: readonly BoardStoryline[];
  readonly visibleCards: readonly BoardCard[];
  readonly selectedCardId: string | null;
  readonly messages: PersonServices["messages"];
  readonly sortableRef: RefObject<SortableListsHandle | null>;
  readonly viewportRef: RefObject<HTMLElement | null>;
  onStartAddStoryline(): void;
  onStartAddCard(cell: AddingCardCell): void;
  onStartLinkScene(cardId: string): void;
  onPrint(): void;
}): void {
  const {
    data,
    visibleStorylines,
    visibleCards,
    selectedCardId,
    messages,
    sortableRef,
    viewportRef,
    onStartAddStoryline,
    onStartAddCard,
    onStartLinkScene,
    onPrint,
  } = args;

  useEffect(() => {
    return registerBoardController({
      addStoryline() {
        if (data.canEdit) onStartAddStoryline();
      },
      addCard() {
        if (!data.canEdit) return;
        const selected = data.cards.find((c) => c.id === selectedCardId);
        const storylineId =
          selected?.storylineId ??
          visibleStorylines[0]?.id ??
          data.storylines[0]?.id;
        const episodeId = selected?.episodeId ?? data.episodes[0]?.id;
        if (storylineId !== undefined && episodeId !== undefined) {
          onStartAddCard({ storylineId, episodeId });
        }
      },
      linkScene() {
        if (!data.canEdit || selectedCardId === null) return;
        const card = data.cards.find((c) => c.id === selectedCardId);
        const episode =
          card === undefined
            ? undefined
            : data.episodes.find((e) => e.id === card.episodeId);
        if (card === undefined || episode === undefined) return;
        if (episode.docIds.script === null) {
          messages.push(
            messageFor({
              kind: "command_unavailable",
              label: BOARD_WORDS.linkToScene,
              reason: BOARD_WORDS.needsScript(episode.number),
            }),
          );
          return;
        }
        onStartLinkScene(card.id);
      },
      moveCard(by) {
        if (!data.canEdit) return;
        const focusedId =
          document.activeElement?.getAttribute("data-board-card") ??
          selectedCardId;
        const card =
          focusedId === null
            ? undefined
            : data.cards.find((c) => c.id === focusedId);
        if (card === undefined) return;
        const cell = cardsInCell(
          visibleCards,
          card.storylineId,
          card.episodeId,
        );
        const index = cell.findIndex((c) => c.id === card.id);
        if (index !== -1) {
          sortableRef.current?.move(
            card.id,
            cellKey(card.storylineId, card.episodeId),
            index + by,
          );
        }
      },
      moveCardEpisode(by) {
        if (!data.canEdit) return;
        const focusedId =
          document.activeElement?.getAttribute("data-board-card") ??
          selectedCardId;
        const card =
          focusedId === null
            ? undefined
            : data.cards.find((c) => c.id === focusedId);
        if (card === undefined) return;
        const rtl =
          viewportRef.current !== null &&
          typeof getComputedStyle === "function" &&
          getComputedStyle(viewportRef.current).direction === "rtl";
        const epIndex = data.episodes.findIndex((e) => e.id === card.episodeId);
        const targetEp =
          epIndex === -1
            ? undefined
            : data.episodes[epIndex + (rtl ? -by : by)];
        if (targetEp === undefined) return;
        const count = cardsInCell(
          visibleCards,
          card.storylineId,
          targetEp.id,
        ).length;
        sortableRef.current?.move(
          card.id,
          cellKey(card.storylineId, targetEp.id),
          count,
        );
      },
      printBoard() {
        onPrint();
      },
    });
  }, [
    data,
    visibleStorylines,
    visibleCards,
    selectedCardId,
    messages,
    sortableRef,
    viewportRef,
    onStartAddStoryline,
    onStartAddCard,
    onStartLinkScene,
    onPrint,
  ]);
}
