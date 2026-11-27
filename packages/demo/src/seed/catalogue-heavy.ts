// Lanternfield Studios' forty projects and their documents, in folder order: Film — Production,
// Film — Development, Film — Archive, Television, Live, then Audio, Books & Games.
import type { FormatId } from "@manent/schema";
import { seedDocId } from "@manent/sync-protocol";
import type { SeedDoc, SeedProject } from "./catalogue.ts";

/** A document's key suffix and title. */
type Part = readonly [suffix: string, title: string];

type Row = readonly [
  slug: string,
  title: string,
  kind: SeedProject["kind"],
  format: FormatId,
  parts?: readonly Part[],
];

/** Episode `first` onwards, titled "401 Night Rounds" and keyed by `prefix` and the number. */
const numbered = (
  first: number,
  titles: readonly string[],
  prefix = "",
): Part[] =>
  titles.map((title, i) => [`${prefix}${first + i}`, `${first + i} ${title}`]);

/** Each title keyed `<prefix>/<nn>`, numbered from 01 in order. */
const listed = (prefix: string, titles: readonly string[]): Part[] =>
  titles.map((title, i) => [
    `${prefix}/${String(i + 1).padStart(2, "0")}`,
    title,
  ]);

const PILOT: readonly Part[] = [["101", "101 Pilot"]];

// The lead segment of each day's rundown, D−9 to D+4.
const EVENING_SEGMENTS = [
  "Bertie learns to drive a tram, badly",
  "Who winds the Tolle Exchange clock?",
  "Tram line 3 opening-day special from Halse Park",
  "School dinners taste test with twelve nine-year-olds",
  "The lighthouse restorers of Gull Point",
  "The car park song (listeners' verses)",
  "Otters! With an ecologist and a very long lens",
  "Build-a-satellite with the university's student team",
  "Cup replay: fans' reaction from the Athletic supporters' club",
  '"What should the new library have?" phone-in; the gale; the umbrella',
  "Live from the night market on Exchange Square",
  "The lighthouse museum reopens, live from Gull Point",
  "The Kittiwake-1 picture of your street",
  "Athletic preview with the manager",
] as const;

// The lead story of each newscast, D−7 to D+7, the 13:00 before the 18:30; a newscast still planned has none.
const TODAY_STORIES = [
  "Tram line 3: first passengers",
  "Tram line 3 opens to Halse Park",
  "Library report published",
  "School meals trial: twelve schools",
  "Lighthouse restoration finished",
  "Lighthouse museum to reopen",
  "Hospital car park charges: patients' group",
  "Car park review promised",
  "Otters breeding in the Tolle",
  "Otter survey: forty years on",
  "Kittiwake-1 reaches final orbit",
  "Night market licence approved",
  "Bridge resurfacing dates announced",
  "Athletic win the cup replay",
  "Library vote expected this afternoon",
  "Tolle Exchange to become library",
  "Night market opens",
  "Night market: first night",
  "Lighthouse museum reopens",
  "Rail engineering works begin",
  "Athletic: team news",
  "Athletic v Harrowfield Town preview",
  "Library consultation opens",
  "Tram fares review",
] as const;

const DOWN_THE_TOLLE_EPISODES = [
  "The Spring on Harrow Fell",
  "The Shepherd's Bridge",
  "A Mill with No Miller",
  "Otter Pool",
  "The Drover's Ford",
  "Three Villages, One Bell",
  "The Hermit of Linnet Wood",
  "Bridges Built for Carts",
  "The Paper Mill",
  "A Flood Mark on a Barn",
  "The Orchards at Hessle End",
  "The Lock-Keeper's Daughter",
  "Kingfishers",
  "The Canal That Never Opened",
  "Church on an Island",
  "The Gravel Barges",
  "Harrow Fell Quarry",
  "The Water Meadows",
  "The Ferryman of Linnet",
  "Where the River Meets the City",
  "The Weir at Halse",
  "Halse Park Before the Trams",
  "The Dye Works",
  "The Callow Street Floods",
  "Exchange Square",
  "The Tolle Exchange Clock",
  "Mercer Street Library",
  "The Tolle Bridge",
  "Under the Tolle Bridge",
  "The Rowing Clubs",
  "The Tram Depot",
  "Central Station's Cellars",
  "The Night Market",
  "Two Football Grounds",
  "The University Boathouse",
  "The Last Ropewalk",
  "The Fish Hall",
  "The Floating Chapel",
  "The Harbour Cranes",
  "Callow House",
  "Where the Tide Turns",
  "The Mudflats Choir",
  "Eel Fishers of Saltcote",
  "The Ardle Ferry",
  "Ship Graveyard",
  "The Custom House",
  "Gull Point Light",
  "The Lifeboat House",
  "Wrenna Island",
  "The Bar",
  "Salt Pans",
  "The Lightship",
  "Smugglers, Mostly Exaggerated",
  "The Seal Count",
  "Storm Wall",
  "The Fog Signal",
  "The Pilot Cutter",
  "The Bar at Low Water",
  "Out Past the Light",
  "The Sea",
] as const;

const MOSS_AND_PEBBLE_EPISODES = [
  "The Puddle That Wasn't There",
  "Pebble Rolls Away",
  "Moss Counts the Stars",
  "The Very Loud Rain",
  "Lily Pad Picnic",
  "A Hat for the Heron",
  "Too Many Tadpoles",
  "The Sound in the Reeds",
  "Pebble Gets Wet",
  "Moss's Big Jump",
  "The Lost Echo",
  "Fog on the Pond",
  "Old Newt's Birthday",
  "Snail Mail",
  "The Upside-Down Day",
  "Zip Can't Stop",
  "Moonlight on the Water",
  "Pebble's Shadow",
  "The Wobbly Stepping Stone",
  "Moss Says Sorry",
  "The Bubble Race",
  "A Visit from the Ducks",
  "The Quietest Game",
  "Moss and the Moth",
  "Pebble's Collection",
  "The Longest Day",
] as const;

// Production is H01, H05, H08 and H13; Archive is H18, H19 and H21; every other film is in Development.
// A row without parts is one document titled as its project: a manuscript for a book, a script otherwise.
const ROWS: readonly Row[] = [
  ["h01", "Ned Ashby and the Lantern of Hours", "film", "screenplay"],
  [
    "h05",
    "The Keeper of the Last Bell: The Silent Valley",
    "film",
    "screenplay",
  ],
  ["h08", "Paper Moons", "film", "animation"],
  ["h13", "Highwire", "film", "screenplay"],
  ["h02", "Ned Ashby and the Glass Orchard", "film", "screenplay"],
  ["h03", "Ember Fleet: Across the Hollow", "film", "screenplay"],
  ["h04", "Ember Fleet: The Far Shore", "film", "screenplay"],
  [
    "h06",
    "The Keeper of the Last Bell: The Founding Road",
    "film",
    "screenplay",
  ],
  ["h07", "The Keeper of the Last Bell: Carrow Height", "film", "screenplay"],
  ["h09", "Salt and Sons", "film", "screenplay"],
  ["h10", "Overtime at the Observatory", "film", "screenplay"],
  ["h11", "Quiet Water", "film", "screenplay"],
  ["h12", "Sixteen Bridges", "film", "screenplay"],
  ["h14", "The Understudy's Understudy", "film", "screenplay"],
  ["h15", "A House for the Winter", "film", "screenplay"],
  ["h16", "The Beekeeper's Accounts", "film", "screenplay"],
  ["h17", "Cold Reading", "film", "screenplay"],
  ["h20", "Snowline", "film", "screenplay"],
  ["h22", "Second Unit", "film", "screenplay"],
  ["h23", "Gentle Machines", "film", "screenplay"],
  ["h37", "Lowlight", "film", "screenplay"],
  ["h38", "Rooftop Summer", "film", "screenplay"],
  ["h39", "The Archivist", "film", "screenplay"],
  ["h40", "The Glassblower", "film", "screenplay"],
  ["h18", "Matchday", "film", "screenplay"],
  ["h19", "The Last Tram to Orrin Street", "film", "screenplay"],
  ["h21", "Pigeon Post", "film", "screenplay"],
  [
    "h24",
    "Ward Nine",
    "series",
    "screenplay",
    numbered(401, [
      "Night Rounds",
      "Handover",
      "Nil by Mouth",
      "The Long Corridor",
      "Visiting Hours",
      "Bed Seven",
      "Second Opinion",
      "Lights Out",
      "Discharge",
      "First Light",
    ]),
  ],
  [
    "h25",
    "Number Twelve, Larch Road",
    "series",
    "multicam",
    numbered(301, [
      "The New Fence",
      "Grandad's Shed",
      "Bin Night",
      "The Quiz",
      "Two Birthdays",
      "The Leak",
      "Driving Lessons",
      "Number Fourteen",
    ]),
  ],
  [
    "h26",
    "Moss & Pebble",
    "series",
    "animation",
    numbered(201, MOSS_AND_PEBBLE_EPISODES),
  ],
  ["h27", "Small Claims", "series", "screenplay", PILOT],
  ["h28", "The Night Porter", "series", "screenplay", PILOT],
  ["h29", "Tidecallers", "series", "screenplay", PILOT],
  [
    "h30",
    "Good Evening, Lannick",
    "show",
    "variety",
    listed("segments", EVENING_SEGMENTS),
  ],
  ["h31", "Lannick Today", "news", "variety", listed("stories", TODAY_STORIES)],
  [
    "h32",
    "Down the Tolle",
    "podcast",
    "variety",
    numbered(1, DOWN_THE_TOLLE_EPISODES, "ep"),
  ],
  [
    "h33",
    "The Keeper of the Last Bell: The Complete Manuscript",
    "book",
    "manuscript",
  ],
  ["h34", "Ned Ashby and the Lantern of Hours", "book", "manuscript"],
  ["h35", "Ember Fleet: Wayfinder", "game", "game"],
  ["h36", "Moss & Pebble: Puddle Hunt", "game", "ink"],
  ["h41", "The Watchman's Lamp", "stage_play", "stage_play"],
];

const projectKey = (slug: string): string => `heavy/${slug}`;

export const HEAVY_PROJECTS: readonly SeedProject[] = Object.freeze(
  ROWS.map(([slug, title, kind]): SeedProject => ({
    key: projectKey(slug),
    workspaceId: "heavy",
    title,
    kind,
    projectId: seedDocId(`project:${projectKey(slug)}`),
  })),
);

/** One document per listed episode, segment and story; an Ink project's document is of kind `ink`. */
export const HEAVY_DOCS: readonly SeedDoc[] = Object.freeze(
  ROWS.flatMap(([slug, title, , format, parts]) =>
    (parts ?? [[format === "manuscript" ? "manuscript" : "script", title]]).map(
      ([suffix, partTitle]): SeedDoc => {
        const key = `${projectKey(slug)}/${suffix}`;
        return {
          key,
          projectKey: projectKey(slug),
          title: partTitle,
          kind: format === "ink" ? "ink" : "script",
          format,
          docId: seedDocId(key),
          hero: false,
        };
      },
    ),
  ),
);
