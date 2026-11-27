// Series view, season summary, episode table, filter toolbar and episode menu words.
import { formatCount } from "./format.ts";

export const SERIES_WORDS = Object.freeze({
  columns: Object.freeze({
    ep: "Ep",
    title: "Title",
    writer: "Writer",
    stage: "Stage",
    due: "Due",
    pages: "Pages",
    lastEdited: "Last edited",
  }),
  stages: Object.freeze({
    outline: "Outline",
    board: "Board",
    writersFirst: "Writer's First",
    studio: "Studio",
    network: "Network",
    table: "Table",
    white: "White",
    record: "Record",
    animatic: "Animatic",
    conformed: "Conformed",
  }),
  seasonHeading: (title: string | null, season: number): string =>
    title === null
      ? `Season ${formatCount(season)}`
      : `${title} · Season ${formatCount(season)}`,
  empty: "No episodes yet",
  emptySeasonTag: "Empty",
  newEpisode: "New episode",
  newSeason: "New season",
  projectSettings: "Project settings",
  untitledEpisode: "Untitled episode",
  seasonName: (season: number): string => `Season ${formatCount(season)}`,
  seasonShort: (season: number): string => `S${formatCount(season)}`,
  renameSeason: "Rename season",
  seasonTitlePlaceholder: "Season title (optional)",
  collapseSeason: (heading: string): string => `Collapse ${heading}`,
  expandSeason: (heading: string): string => `Expand ${heading}`,
  jumpToSeason: (heading: string): string => `Jump to ${heading}`,
  episodeCount: (count: number): string =>
    count === 1 ? "1 episode" : `${formatCount(count)} episodes`,
  lockedCount: (count: number): string => `${formatCount(count)} locked`,
  openNotesCount: (count: number): string =>
    count === 1 ? "1 open note" : `${formatCount(count)} open notes`,
  targetPagesLabel: (pages: number): string =>
    `${formatCount(pages)} pp. target`,
  boardCardsCount: (count: number): string =>
    count === 1 ? "1 board card" : `${formatCount(count)} board cards`,
  pagesOfTarget: (pages: number, target: number): string =>
    `${formatCount(pages)} of ${formatCount(target)} pages`,
  pagesLocked: "Pages locked",
  openEpisode: (episode: string): string => `Open ${episode}`,
  openScript: "Open script",
  openOutline: "Open outline",
  openRoomLog: "Open room log",
  openOnBoard: "Open on Board",
  renameEpisode: "Rename episode",
  changeNumber: "Change episode number",
  clearStage: "No stage",
  clearDue: "Clear due date",
  dueOverdue: "Overdue",
  dueSoon: "Due soon",
  filterPlaceholder: "Filter episodes…",
  filterLabel: "Filter episodes",
  allWriters: "All writers",
  allStages: "All stages",
  needsAttention: "Needs attention",
  needsAttentionLabel:
    "Show episodes with open notes, overdue dates or over-target pages",
  clearFilters: "Clear filters",
  noFilterMatches: "No episodes match this filter.",
  filterCount: (shown: number, total: number): string =>
    `${formatCount(shown)} of ${formatCount(total)} episodes`,
  cellLabel: (column: string, episode: string): string =>
    `${column} for ${episode}`,
  draftOpen: (name: string, open: number): string =>
    `${name} · ${formatCount(open)} open`,
  blank: "—",
  changedCount: (count: number): string => `▲${formatCount(count)}`,
  changedSinceOpened: "Changed since you opened",
});
