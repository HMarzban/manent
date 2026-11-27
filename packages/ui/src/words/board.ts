// The Board's words: title bar, toolbar, season choice, empty states, buttons, placeholders, menus, links and announcements.
import { formatCount, formatPosition } from "./format.ts";

export const BOARD_WORDS = Object.freeze({
  board: "Board",
  title: (projectTitle: string): string => `${projectTitle} · Board`,
  seasonLabel: "Season",
  seasonOption: (season: number): string => `Season ${formatCount(season)}`,
  seasonOptionWithTitle: (season: number, title: string): string =>
    `Season ${formatCount(season)} · ${title}`,
  empty: "Add a storyline, then a card in each episode it runs through.",
  noEpisodesTitle: "No episodes in this season",
  noEpisodesDescription:
    "Add episodes to this season in the Library to see them on the Board.",
  noFilterMatches: "No cards match this filter.",
  addStoryline: "Add storyline",
  addCard: "Add card",
  addCardInCell: (storylineTitle: string, episodeNumber: number): string =>
    `Add card — ${storylineTitle} · ${episodeNumber}`,
  add: "Add",
  cancel: "Cancel",
  enterToAdd: "Enter adds · ⌘/Ctrl+Enter adds another",
  printBoard: "Print board",
  printedOn: (date: string): string => `Printed ${date}`,
  printFilteredNote: "Filtered view",
  duplicateCard: "Duplicate card",
  duplicatedCard: (text: string): string => `Duplicated card: ${text}`,
  flagCard: "Flag for room",
  clearFlag: "Clear flag",
  flaggedBadge: "Flagged for room",
  flaggedOnly: "Flagged",
  flaggedOnlyLabel: "Show cards flagged for the room",
  previewScene: "Read scene",
  sceneOmitted: "Omitted",
  sceneNoExcerpt: "No lines written yet.",
  sceneCharactersLabel: "Characters",
  noUnlinkedCards: "All cards on this board are linked to a scene.",
  storylinePlaceholder: "Storyline — for example The licence review",
  cardPlaceholder: "Card — what happens in this episode",
  storylinesHeading: "Storylines",
  filterPlaceholder: "Filter cards…",
  filterLabel: "Filter board cards",
  filterScenesPlaceholder: "Filter scenes…",
  clearFilters: "Clear filters",
  allStorylines: "All storylines",
  storylinesSelected: (count: number): string =>
    count === 1 ? "1 storyline" : `${formatCount(count)} storylines`,
  showAllStorylines: "Show all storylines",
  unlinkedOnly: "Not linked",
  unlinkedOnlyLabel: "Show cards not linked to a scene",
  densityLabel: "Card size",
  densityComfortable: "Standard",
  densityCompact: "Smaller",
  densityFit: "Fit",
  episodesJumpLabel: "Episodes",
  scrollLeft: "Scroll episodes left",
  scrollRight: "Scroll episodes right",
  jumpToEpisode: (episodeNumber: number, title: string): string =>
    `Jump to ${episodeNumber} · ${title}`,
  openEpisodeScript: (episodeNumber: number, title: string): string =>
    `Open ${episodeNumber} · ${title} script`,
  openEpisodeOutline: (episodeNumber: number, title: string): string =>
    `Open ${episodeNumber} · ${title} outline`,
  openScript: "Open script",
  openOutline: "Open outline",
  openRoomLog: "Open room log",
  openScene: "Open scene",
  episodeActions: (episodeNumber: number, title: string): string =>
    `Options for ${episodeNumber} · ${title}`,
  episodeLocked: "Pages locked",
  pagesCount: (pages: number): string =>
    pages === 1 ? "1 p." : `${formatCount(pages)} pp.`,
  cardCount: (count: number): string =>
    count === 0
      ? "No cards"
      : count === 1
        ? "1 card"
        : `${formatCount(count)} cards`,
  unlinkedCount: (count: number): string => `${formatCount(count)} not linked`,
  editCard: "Edit card",
  linkToScene: "Link to scene",
  changeScene: "Change scene",
  removeLink: "Remove link",
  loadingScenes: "Opening scenes…",
  scenesUnavailable: "Could not open this episode's scenes.",
  sceneMissing: "Scene removed · Link again",
  openLinkedScene: (episodeNumber: number): string => `${episodeNumber} · …`,
  moveToEpisode: "Move to episode",
  moveToStoryline: "Move to storyline",
  moveStorylineUp: "Move storyline up",
  moveStorylineDown: "Move storyline down",
  laneColour: "Storyline colour",
  laneColourAuto: "Default",
  laneColourOption: (index: number): string => `Colour ${formatCount(index)}`,
  collapseStoryline: (title: string): string => `Hide ${title}`,
  expandStoryline: (title: string): string => `Show ${title}`,
  collapseAll: "Hide all cards",
  expandAll: "Show all cards",
  remove: "Remove",
  rename: "Rename",
  linkedPlace: (episodeNumber: number, sceneNumber: string): string =>
    `${episodeNumber} · sc. ${sceneNumber}`,
  needsScript: (episodeNumber: number): string =>
    `needs a script for ${episodeNumber}`,
  moveCardUp: "Move card up",
  moveCardDown: "Move card down",
  dragInstructions:
    "To pick up a card, press Space. Use the arrow keys to move it, Space to drop it, and Esc to put it back. Press Enter to open its script.",
  cardLabel: (
    text: string,
    episodeNumber: number,
    storylineTitle: string,
  ): string => `${text}, ${episodeNumber}, ${storylineTitle}`,
  cellLabel: (storylineTitle: string, episodeNumber: number): string =>
    `${storylineTitle} · ${episodeNumber}`,
  removedStoryline: (title: string, cardCount: number): string =>
    cardCount === 0
      ? `Removed the storyline ${title}.`
      : cardCount === 1
        ? `Removed the storyline ${title} and its 1 card.`
        : `Removed the storyline ${title} and its ${formatCount(cardCount)} cards.`,
  removedCard: (text: string): string => `Removed card: ${text}`,
  movedCardClearedLink: (episodeNumber: number): string =>
    `Moved card to ${episodeNumber} and cleared its scene link.`,
  movedStoryline: (title: string, position: number, count: number): string =>
    `Moved storyline ${title} to position ${formatPosition(position, count)}.`,
  movedToList: (
    label: string,
    position: number,
    count: number,
    listLabel: string,
  ): string =>
    `Moved ${label} to position ${formatPosition(position, count)} in ${listLabel}.`,
  filterCount: (shown: number, total: number): string =>
    `${formatCount(shown)} of ${formatCount(total)} cards`,
  statusSummary: (
    storylines: number,
    episodes: number,
    cards: number,
    linked: number,
  ): string => {
    const s =
      storylines === 1
        ? "1 storyline"
        : `${formatCount(storylines)} storylines`;
    const e =
      episodes === 1 ? "1 episode" : `${formatCount(episodes)} episodes`;
    const c = cards === 1 ? "1 card" : `${formatCount(cards)} cards`;
    return cards > 0
      ? `${s} · ${e} · ${c} · ${formatCount(linked)} linked`
      : `${s} · ${e} · ${c}`;
  },
});
