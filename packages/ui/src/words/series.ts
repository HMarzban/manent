// Series view and episode table words, from S2-PS-01 and S2-PS-17..20.
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
  newEpisode: "New episode",
  newSeason: "New season",
  untitledEpisode: "Untitled episode",
  seasonName: (season: number): string => `Season ${formatCount(season)}`,
  cellLabel: (column: string, episode: string): string =>
    `${column} for ${episode}`,
  draftOpen: (name: string, open: number): string =>
    `${name} · ${formatCount(open)} open`,
  blank: "—",
  changedCount: (count: number): string => `▲${formatCount(count)}`,
  changedSinceOpened: "Changed since you opened",
});
