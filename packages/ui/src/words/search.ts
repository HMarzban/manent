// The words of Library search, Filter ▾, offline fallback, and palette cross-workspace search.
import { formatCount } from "./format.ts";

export const SEARCH_WORDS = Object.freeze({
  placeholder: "Search this workspace…",
  fieldLabel: "Search this workspace",
  commandLabel: "Search this workspace…",
  clearSearch: "Clear search",
  count: (n: number): string =>
    n === 1 ? "1 document" : `${formatCount(n)} documents`,
  limitNotice: (limit: number): string =>
    `The best ${formatCount(limit)} matches are shown. Add a word or a filter to narrow them.`,
  empty: (workspace: string, query: string): string =>
    `Nothing in ${workspace} matches "${query}".`,
  emptyFiltered: (workspace: string, query: string): string =>
    `Nothing in ${workspace} matches "${query}". Remove a filter to find more.`,
  requestRefused:
    "Couldn't search inside the scripts. Showing the titles on this device that match.",
  offlineNotice:
    "Offline, search finds titles only, without the Changed filter.",
  tooLong: "Couldn't search: a search holds at most 500 characters.",
  filterButton: "Filter",
  filterGroups: Object.freeze({
    kind: "Kind",
    changed: "Changed",
    folder: "Folder",
  }),
  anyKind: "Any kind",
  documentsSubheading: "Documents",
  projectsSubheading: "Projects",
  docKinds: Object.freeze({
    script: "Script",
    outline: "Outline",
    ink: "Ink",
    room_log: "Room log",
    rundown: "Rundown",
  }),
  projectKinds: Object.freeze({
    film: "Film",
    series: "Series",
    show: "Show",
    news: "News",
    podcast: "Podcast",
    book: "Book",
    game: "Game",
    stage_play: "Stage play",
  }),
  changed: Object.freeze({
    any: "Any time",
    today: "Today",
    last7: "In the last 7 days",
    last30: "In the last 30 days",
    thisYear: "This year",
  }),
  anyFolder: "Any folder",
  folderPath: (names: readonly string[]): string => names.join(" › "),
  resultMeta: (project: string | null, kind: string, when: string): string =>
    project === null ? `${kind} · ${when}` : `${project} · ${kind} · ${when}`,
  paletteOtherWorkspace: (project: string, workspace: string): string =>
    `${project} · ${workspace}`,
  paletteBodyHome: (
    project: string | null,
    workspace: string | null,
  ): string => {
    const parts = [
      ...(project === null ? [] : [project]),
      ...(workspace === null ? [] : [workspace]),
      "in the text",
    ];
    return parts.join(" · ");
  },
});
