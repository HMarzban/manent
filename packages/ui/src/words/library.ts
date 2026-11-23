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

export const LIBRARY_WORDS = {
  title: "Library",
  continueHeading: "Continue",
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
  seeding: (done: number, total: number): string =>
    `getting ready, ${formatCount(done)} of ${formatCount(total)} projects`,
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
  waiting: (n: number): string => `${formatCount(n)} waiting`,
  /** A row never synced: on desktop, and in a browser. */
  neverSynced: (desktop: boolean): string =>
    desktop ? "On this device only" : "Only in this browser",
  /** The workspace switcher's last row for a person with no session. */
  signIn: "Sign in to sync",
} as const;
