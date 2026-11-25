// The Board's command handlers: adding storylines and cards, linking to a scene and moving the focused card.
import type { CommandHandlers } from "@manent/commands";
import {
  runAddCard,
  runAddStoryline,
  runLinkScene,
  runMoveCard,
} from "../board/board-actions.ts";
import type { HandlerDeps } from "./index.ts";

type BoardCommandId =
  | "board.addStoryline"
  | "board.addCard"
  | "board.linkScene"
  | "board.moveCardUp"
  | "board.moveCardDown";

export function boardHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, BoardCommandId> {
  return {
    "board.addStoryline": () => runAddStoryline(),
    "board.addCard": () => runAddCard(),
    "board.linkScene": () => runLinkScene(),
    "board.moveCardUp": () => runMoveCard(-1),
    "board.moveCardDown": () => runMoveCard(1),
  };
}
