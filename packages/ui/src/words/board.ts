// The Board's words: title bar, season choice, empty state, buttons, placeholders, menus, links and announcements.
import { formatCount, formatPosition } from "./format.ts";

export const BOARD_WORDS = Object.freeze({
  board: "Board",
  title: (projectTitle: string): string => `${projectTitle} · Board`,
  seasonLabel: "Season",
  seasonOption: (season: number): string => `Season ${formatCount(season)}`,
  empty: "Add a storyline, then a card in each episode it runs through.",
  addStoryline: "Add storyline",
  addCard: "Add card",
  storylinePlaceholder: "Storyline — for example The licence review",
  cardPlaceholder: "Card — what happens in this episode",
  linkToScene: "Link to scene",
  removeLink: "Remove link",
  moveToEpisode: "Move to episode",
  moveToStoryline: "Move to storyline",
  remove: "Remove",
  rename: "Rename",
  linkedPlace: (episodeNumber: number, sceneNumber: string): string =>
    `${episodeNumber} · sc. ${sceneNumber}`,
  needsScript: (episodeNumber: number): string =>
    `needs a script for ${episodeNumber}`,
  moveCardUp: "Move card up",
  moveCardDown: "Move card down",
  cardLabel: (
    text: string,
    episodeNumber: number,
    storylineTitle: string,
  ): string => `${text}, ${episodeNumber}, ${storylineTitle}`,
  cellLabel: (storylineTitle: string, episodeNumber: number): string =>
    `${storylineTitle} · ${episodeNumber}`,
  removedStoryline: (title: string, cardCount: number): string =>
    cardCount === 1
      ? `Removed the storyline ${title} and its 1 card.`
      : `Removed the storyline ${title} and its ${formatCount(cardCount)} cards.`,
  movedToList: (
    label: string,
    position: number,
    count: number,
    listLabel: string,
  ): string =>
    `Moved ${label} to position ${formatPosition(position, count)} in ${listLabel}.`,
});
