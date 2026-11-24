// The Library's words, and the kinds of project New project offers.

import { formatCount } from "./format.ts";

/** The eight kinds of project, in the order New project shows them. */
export const NEW_PROJECT_CARDS = [
  { kind: "film", label: "Film", description: "One script and its outline" },
  { kind: "series", label: "Series", description: "Seasons and episodes" },
  { kind: "show", label: "Show", description: "A rundown for each show day" },
  { kind: "news", label: "News", description: "A rundown for each newscast" },
  {
    kind: "podcast",
    label: "Podcast",
    description: "Episodes with running times",
  },
  { kind: "book", label: "Book", description: "One manuscript with chapters" },
  { kind: "game", label: "Game", description: "Game Script and Ink" },
  {
    kind: "stage_play",
    label: "Stage play",
    description: "A script for the stage and its outline",
  },
] as const;

type Kind = (typeof NEW_PROJECT_CARDS)[number]["kind"];

const UNTITLED_PROJECT: Readonly<Record<Kind, string>> = {
  film: "Untitled film",
  series: "Untitled series",
  show: "Untitled show",
  news: "Untitled news project",
  podcast: "Untitled podcast",
  book: "Untitled book",
  game: "Untitled game",
  stage_play: "Untitled stage play",
};

const seeding = (done: number, total: number): string =>
  `getting ready, ${formatCount(done)} of ${formatCount(total)} projects`;

export const LIBRARY_WORDS = {
  title: "Library",
  continueHeading: "Continue",
  favouritesHeading: "Favourites",
  privateHeading: "Private",
  trashHeading: "Trash",
  /** What the Favourites, Private and Trash views say while each holds nothing: what the view lists. */
  favouritesEmpty:
    "Scripts you mark as favourites appear here, and only you see them. Continue lists the scripts you opened last.",
  privateEmpty:
    "Scripts you keep in your Private folder appear here, where only you can see them. The workspace's scripts are under Projects.",
  trashEmpty:
    "Scripts moved to the Trash appear here for 30 days, and can be put back in that time.",
  search: "Search this workspace",
  searchPlaceholder: "Search this workspace…",
  /** The heading of what a search for `query` found. */
  searchHeading: (query: string): string => `Matches for '${query}'`,
  /** What a search for `query` says when no project's name holds it. */
  searchNone: (query: string): string =>
    `No project in this workspace has '${query}' in its name. Check the spelling, or clear the search to see every project.`,
  projectsHeading: "Projects",
  projectsRegion: "Projects",
  kindColumn: "Kind",
  lastEditedColumn: "Last edited",
  statusColumn: "Status",
  empty: "No scripts yet",
  problem: "Couldn't load the list. Showing what is on this device.",
  notOnDevice: "Not on this device",
  changedSinceOpened: "Changed since you opened",
  onDevice: (n: number, m: number): string =>
    `${formatCount(n)} of ${formatCount(m)} projects are on this device`,
  seeding,
  /** What the Library says in place of a workspace's lists while it is being seeded. */
  gettingReady: (workspace: string, done: number, total: number): string =>
    `${workspace} is ${seeding(done, total)}.`,
  /** A workspace's second line in the switcher; `lastTitle` is null while its Continue is empty. */
  workspaceLine: (count: number, lastTitle: string | null): string => {
    const projects =
      count === 1 ? "1 project" : `${formatCount(count)} projects`;
    return lastTitle === null ? projects : `${projects} · ${lastTitle}`;
  },
  /** The workspace of a person with no session. */
  yourDesk: "Your desk",
  newScript: "New script",
  newProject: "New project",
  untitledScript: "Untitled script",
  /** A new project's name: the kind's, then `n` from the second one in a workspace on. */
  untitledProject: (kind: Kind, n = 1): string =>
    n === 1
      ? UNTITLED_PROJECT[kind]
      : `${UNTITLED_PROJECT[kind]} ${formatCount(n)}`,
  /** The Last edited cell: who, then `when` from formatWhen. */
  edited: (name: string, when: string): string => `${name}, ${when}`,
  synced: "Synced",
  /** A row whose document is read from the server, as a reader's is, and not kept on this device. */
  onServer: "On the server",
  waiting: (n: number): string => `${formatCount(n)} waiting`,
  /** A row never synced: on desktop, and in a browser. */
  neverSynced: (desktop: boolean): string =>
    desktop ? "On this device only" : "Only in this browser",
  /** The workspace switcher's last row for a person with no session. */
  signIn: "Sign in to sync",
} as const;
