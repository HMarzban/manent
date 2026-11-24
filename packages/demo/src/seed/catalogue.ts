// Every seeded workspace, project and document, with the ids the same in every seed.
import type { DocKind } from "@manent/sync-protocol";
import { projectHome, seedDocId, workspaceHome } from "@manent/sync-protocol";
import type { FormatId } from "@manent/schema";
import type { DemoWorkspace } from "../people.ts";
import { HEAVY_DOCS, HEAVY_PROJECTS } from "./catalogue-heavy.ts";
import { HEAVY_RUNDOWNS } from "./catalogue-heavy-rundowns.ts";
import { HEAVY_SERIES_DOCS } from "./catalogue-heavy-series.ts";

export type SeedWorkspaceId = DemoWorkspace["id"];

type ProjectKind =
  | "film"
  | "series"
  | "show"
  | "news"
  | "podcast"
  | "book"
  | "game"
  | "stage_play";

export interface SeedProject {
  /** `<workspace>/<slug>`. */
  key: string;
  workspaceId: SeedWorkspaceId;
  title: string;
  kind: ProjectKind;
  /** seedDocId(`project:${key}`). */
  projectId: string;
}

export interface SeedDoc {
  /** `<projectKey>/<doc>`. */
  key: string;
  projectKey: string;
  title: string;
  kind: DocKind;
  format: FormatId;
  /** seedDocId(key). */
  docId: string;
  /** Holds fixed text. */
  hero: boolean;
}

const project = (
  workspaceId: SeedWorkspaceId,
  slug: string,
  title: string,
  kind: ProjectKind,
): SeedProject => {
  const key = `${workspaceId}/${slug}`;
  return {
    key,
    workspaceId,
    title,
    kind,
    projectId: seedDocId(`project:${key}`),
  };
};

const doc = (
  projectKey: string,
  suffix: string,
  title: string,
  format: FormatId,
  options: { kind?: DocKind; hero?: boolean } = {},
): SeedDoc => {
  const key = `${projectKey}/${suffix}`;
  return {
    key,
    projectKey,
    title,
    kind: options.kind ?? "script",
    format,
    docId: seedDocId(key),
    hero: options.hero ?? false,
  };
};

// The Late Desk's scripted rows of today's rundown other than the Monologue: row number and item title.
const LATE_DESK_SEGMENTS: readonly (readonly [string, string])[] = [
  [
    "1",
    "Cold open: Benny tries to return a library book to the Tolle Exchange pigeons",
  ],
  ["4", "Desk piece: Things We Learned"],
  ["5", "Benny's Mailbag"],
  ["7", "Guest one intro"],
  ["9", "Sketch: The Quiet Carriage"],
  ["10", "Guest two intro"],
  ["12", "Field piece throw"],
  ["14", "Musical guest intro"],
  ["16", "Goodnights"],
];

// Lannick One News' scripted stories of today: every row but 37, the weather, which is presented live.
const NEWS_STORIES: readonly (readonly [string, string])[] = [
  ["01", "01 Tolle Exchange library: council votes yes"],
  ["02", "02 Library: what happens to Mercer Street"],
  ["03", "03 Library: voices from Exchange Square"],
  ["04", "04 Tram line 3 extension: first-week passenger figures"],
  ["05", "05 Halse Road roadworks extended by two weeks"],
  ["06", "06 Tolle Bridge to close overnight for resurfacing"],
  ["07", "07 Gale warning: Wrenna ferries cancelled after eight"],
  ["08", "08 Gale: what to expect on the roads"],
  ["09", "09 Flood boards go up at Ardle Quay"],
  ["10", "10 Lannick General car park charges to be reviewed"],
  ["11", "11 New school meals menu trialled in twelve primaries"],
  ["12", "12 Bus timetable app outage: operator apologises"],
  ["13", "13 Forty new tram drivers to start training"],
  ["14", "14 Water main replacement on Linnet Street"],
  ["15", "15 Night market opens tomorrow on Exchange Square"],
  ["16", "16 Gull Point lighthouse museum to reopen"],
  ["17", "17 Ardle fish market changes its opening hours"],
  ["18", "18 140 homes approved on the old dye works site"],
  ["19", "19 Coast line: engineering works next week"],
  ["20", "20 Animal shelter appeals for foster homes"],
  ["21", "21 New rules for e-scooter hire come into force"],
  ["22", "22 Rail fares review published"],
  ["23", "23 Record applications to the national apprenticeship scheme"],
  ["24", "24 New coastal path waymarks unveiled"],
  ["25", "25 Census: Lannick fourth-fastest-growing city"],
  ["26", "26 Gale warnings along the north coast"],
  ["27", "27 Kittiwake-1 sends its first photograph of Earth"],
  ["28", "28 Kittiwake-1: Dr. Halima Sarr in the studio"],
  ["29", "29 Otters in the Tolle: the first pictures of cubs"],
  ["30", "30 Lannick Philharmonic announces its new season"],
  ["31", "31 Book festival line-up announced"],
  ["32", "32 Lannick Athletic 2, Port Allard 0: reaction"],
  ["33", "33 Athletic injury news before the Harrowfield Town game"],
  ["34", "34 Tolle Valley Herons go top of the league"],
  ["35", "35 University crews take to the Tolle"],
  ["36", "36 Junior swimming gala: the results"],
  ["38", "38 Tomorrow in Lannick: the diary"],
  ["39", "39 Headlines again"],
  ["40", "40 Closer: the umbrella that came home"],
];

const HANDED_IN_EPISODES = [
  "1 The Umbrella with a Name",
  "2 A Trombone, Slightly Dented",
  "3 Forty Keys on a Ring",
  "4 The Wedding Album",
] as const;

const HARBOUR_LIGHTS_EPISODES = [
  "201 Low Tide",
  "202 Salt",
  "203 Undertow",
  "204 The Ferry",
  "205 Slack Water",
  "206 The Bar",
] as const;

// The episodes and stories that hold fixed text; every other one is written from its bank.
const HARBOUR_LIGHTS_HEROES: ReadonlySet<string> = new Set([
  "202",
  "204",
  "205",
]);
const NEWS_HEROES: ReadonlySet<string> = new Set(["01", "07", "40"]);

/** Every seeded project, Small's and Medium's in Library order, then Heavy's. */
export const SEED_PROJECTS: readonly SeedProject[] = Object.freeze([
  project("small", "every-key-but-one", "Every Key But One", "film"),
  project("small", "jumpox", "Jumpox — Spark & Looki", "book"),
  project("small", "handed-in", "Handed In", "podcast"),
  project(
    "small",
    "down-the-back",
    "Down the Back of Everything",
    "stage_play",
  ),
  project("medium", "the-long-night", "The Long Night", "film"),
  project("medium", "harbour-lights", "Harbour Lights", "series"),
  project("medium", "the-late-desk", "The Late Desk", "show"),
  project("medium", "lannick-one-news", "Lannick One News", "news"),
  project("medium", "game-samples", "Game samples", "game"),
  project("medium", "the-lamp-room", "The Lamp Room", "film"),
  ...HEAVY_PROJECTS,
]);

/** Every seeded document, each project's in Library order. */
export const SEED_DOCS: readonly SeedDoc[] = Object.freeze([
  doc("small/every-key-but-one", "script", "Every Key But One", "screenplay", {
    hero: true,
  }),
  doc("small/jumpox", "manuscript", "Jumpox — Spark & Looki", "manuscript", {
    hero: true,
  }),
  ...HANDED_IN_EPISODES.map((title, i) =>
    doc("small/handed-in", `ep${i + 1}`, title, "variety", { hero: i === 0 }),
  ),
  doc(
    "small/down-the-back",
    "script",
    "Down the Back of Everything",
    "stage_play",
    { hero: true },
  ),
  doc("medium/the-long-night", "script", "The Long Night", "screenplay", {
    hero: true,
  }),
  ...HARBOUR_LIGHTS_EPISODES.map((title) =>
    doc("medium/harbour-lights", title.slice(0, 3), title, "screenplay", {
      hero: HARBOUR_LIGHTS_HEROES.has(title.slice(0, 3)),
    }),
  ),
  doc("medium/the-late-desk", "monologue", "Monologue", "variety", {
    hero: true,
  }),
  ...LATE_DESK_SEGMENTS.map(([row, title]) =>
    doc("medium/the-late-desk", `segments/${row}`, title, "variety"),
  ),
  ...NEWS_STORIES.map(([row, title]) =>
    doc("medium/lannick-one-news", `stories/${row}`, title, "variety", {
      hero: NEWS_HEROES.has(row),
    }),
  ),
  doc(
    "medium/game-samples",
    "twelve-on-foot-1",
    "Twelve on Foot — Chapter 1: Fog Bell",
    "game",
    { hero: true },
  ),
  doc(
    "medium/game-samples",
    "barks",
    "Twelve on Foot — Barks: Car Deck",
    "game",
  ),
  doc("medium/game-samples", "keepers-logbook", "The Keeper's Logbook", "ink", {
    kind: "ink",
    hero: true,
  }),
  doc("medium/the-lamp-room", "script", "The Lamp Room", "screenplay", {
    hero: true,
  }),
  ...HEAVY_DOCS,
  doc("medium/the-late-desk", "rundowns/day", "The Late Desk", "variety", {
    kind: "rundown",
  }),
  doc(
    "medium/the-late-desk",
    "rundowns/day-minus-1",
    "The Late Desk",
    "variety",
    { kind: "rundown" },
  ),
  doc(
    "medium/the-late-desk",
    "rundowns/day-plus-1",
    "The Late Desk",
    "variety",
    { kind: "rundown" },
  ),
  doc(
    "medium/lannick-one-news",
    "rundowns/day",
    "Lannick One News",
    "variety",
    { kind: "rundown" },
  ),
  doc(
    "medium/lannick-one-news",
    "rundowns/day-plus-7",
    "Lannick One News",
    "variety",
    { kind: "rundown" },
  ),
  ...HEAVY_RUNDOWNS,
  ...HEAVY_SERIES_DOCS,
]);

/** The document `key` names; throws RangeError for a key the catalogue lacks. */
export function seedDoc(key: string): SeedDoc {
  const found = SEED_DOCS.find((d) => d.key === key);
  if (found === undefined)
    throw new RangeError(`the seed has no document ${key}`);
  return found;
}

/** The project `key` names; throws RangeError for a key the catalogue lacks. */
export function seedProject(key: string): SeedProject {
  const found = SEED_PROJECTS.find((p) => p.key === key);
  if (found === undefined)
    throw new RangeError(`the seed has no project ${key}`);
  return found;
}

/** The app path of the document `key` names; throws as seedDoc does. */
export function docPath(key: string): string {
  return `/s/${seedDoc(key).docId}`;
}

/** The homes of Lanternfield Studios' documents: its index's, then one per project. */
export function heavyHomes(): ReadonlySet<string> {
  return new Set([
    workspaceHome("heavy"),
    ...HEAVY_PROJECTS.map((p) => projectHome(p.projectId)),
  ]);
}
