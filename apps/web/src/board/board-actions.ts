// Bridge between the Board's registered commands and whichever Board screen is currently mounted.

export interface BoardController {
  addStoryline(): void;
  addCard(): void;
  linkScene(): void;
  moveCard(by: -1 | 1): void;
}

let active: BoardController | null = null;

/** Registers `controller` while the Board screen is mounted; the returned function clears it. */
export function registerBoardController(
  controller: BoardController,
): () => void {
  active = controller;
  return () => {
    if (active === controller) active = null;
  };
}

export function runAddStoryline(): void {
  active?.addStoryline();
}

export function runAddCard(): void {
  active?.addCard();
}

export function runLinkScene(): void {
  active?.linkScene();
}

export function runMoveCard(by: -1 | 1): void {
  active?.moveCard(by);
}
