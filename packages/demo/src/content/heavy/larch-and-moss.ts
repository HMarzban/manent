// Series index data for Number Twelve, Larch Road (multi-camera nightly drafts) and Moss & Pebble (animation ladder).
import type { GroupEntry, SeasonEntry } from "@manent/crdt";
import type { SeedProjectName } from "../../seed/capabilities/series.ts";
import type { SeedEpisodeSpec } from "./ward-nine-series.ts";

export interface NightlySendSpec {
  readonly draftName: string;
  readonly againstName: string | null;
  readonly sentAt: string;
  readonly groupIds: readonly string[];
  readonly files: readonly string[];
  readonly openedBy: readonly {
    readonly userId: string;
    readonly at: string;
  }[];
}

export const ANIMATION_LADDER: readonly string[] = Object.freeze([
  "Writer's First",
  "Studio",
  "Network",
  "Table",
  "White",
  "Record",
  "Animatic",
  "Conformed",
]);

export const LARCH_ROAD_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: [
      "arjun-mehra",
      "fenella-pryce",
      "callum-rafferty",
      "leilani-kahale",
    ],
    watermark: false,
  },
  {
    id: "producers",
    name: "Producers",
    role: "comment",
    memberUserIds: ["ama-asiedu", "dana"],
    watermark: false,
  },
  {
    id: "network",
    name: "Network",
    role: "comment",
    memberUserIds: ["ayesha-qureshi"],
    watermark: false,
  },
]);

export const LARCH_ROAD_SEASONS: readonly SeasonEntry[] = Object.freeze([
  { id: "s1", number: 1, title: null },
  { id: "s2", number: 2, title: null },
  { id: "s3", number: 3, title: null },
]);

type LarchRow = readonly [
  number: number,
  title: string,
  writerUserId: string,
  stage: string,
  dueAt: string | null,
];

const LARCH_ROAD_ROWS: readonly LarchRow[] = [
  [301, "The New Fence", "arjun-mehra", "Recorded", null],
  [302, "Grandad's Shed", "fenella-pryce", "Recorded", null],
  [303, "Bin Night", "callum-rafferty", "Recorded", null],
  [304, "The Quiz", "fenella-pryce", "Recorded", null],
  [
    305,
    "Two Birthdays",
    "callum-rafferty",
    "Network run-through draft",
    "D+2 18:00",
  ],
  [306, "The Leak", "arjun-mehra", "Table draft", "D+5 18:00"],
  [307, "Driving Lessons", "fenella-pryce", "Writer's First", "D+12 18:00"],
  [308, "Number Fourteen", "callum-rafferty", "Outline", "D+19 18:00"],
];

export const LARCH_ROAD_EPISODES: readonly SeedEpisodeSpec[] = Object.freeze(
  LARCH_ROAD_ROWS.map(
    ([number, title, writerUserId, stage, dueAt]): SeedEpisodeSpec => ({
      id: `ep-${number}`,
      seasonId: "s3",
      number,
      title,
      writerUserId,
      stage,
      dueAt,
      pages: null,
      locked: false,
      docKey: `heavy/h25/${number}`,
      docSlot: "script",
    }),
  ),
);

export const LARCH_ROAD_305_SENDS: readonly NightlySendSpec[] = Object.freeze([
  {
    draftName: "Table draft",
    againstName: null,
    sentAt: "D−3 22:15",
    groupIds: ["room", "producers"],
    files: ["pdf"],
    openedBy: [{ userId: "ama-asiedu", at: "D−3 22:40" }],
  },
  {
    draftName: "Rehearsal draft",
    againstName: "Table draft",
    sentAt: "D−2 22:15",
    groupIds: ["room", "producers"],
    files: ["pdf_asterisks"],
    openedBy: [{ userId: "ama-asiedu", at: "D−2 22:35" }],
  },
  {
    draftName: "Network run-through draft",
    againstName: "Rehearsal draft",
    sentAt: "D−1 22:15",
    groupIds: ["room", "producers", "network"],
    files: ["pdf_asterisks"],
    openedBy: [{ userId: "ayesha-qureshi", at: "D−1 22:45" }],
  },
]);

export const LARCH_ROAD_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "Des Lowe" },
  { kind: "character", name: "Priti Lowe" },
  { kind: "character", name: "Nana June" },
  { kind: "character", name: "Kai Lowe" },
  { kind: "character", name: "Molly Lowe" },
  { kind: "character", name: "Gerald" },
  { kind: "set", name: "Number Twelve, Larch Road" },
]);

export const MOSS_AND_PEBBLE_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: ["jiahui-wen", "clemence-aubry", "gwen-treharne"],
    watermark: false,
  },
  {
    id: "voice",
    name: "Voice",
    role: "comment",
    memberUserIds: ["kenji-arakawa"],
    watermark: false,
  },
  {
    id: "network",
    name: "Network",
    role: "comment",
    memberUserIds: ["ayesha-qureshi"],
    watermark: false,
  },
]);

export const MOSS_AND_PEBBLE_SEASONS: readonly SeasonEntry[] = Object.freeze([
  { id: "s1", number: 1, title: null },
  { id: "s2", number: 2, title: null },
]);

const MOSS_AND_PEBBLE_TITLES = [
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

function mossStageFor(episodeNumber: number): string {
  if (episodeNumber <= 208) return "Conformed";
  if (episodeNumber <= 214) return "Animatic";
  if (episodeNumber <= 220) return "Record";
  if (episodeNumber <= 224) return "Writer's draft";
  return "Outline";
}

export const MOSS_AND_PEBBLE_EPISODES: readonly SeedEpisodeSpec[] =
  Object.freeze(
    MOSS_AND_PEBBLE_TITLES.map((title, index): SeedEpisodeSpec => {
      const number = 201 + index;
      return {
        id: `ep-${number}`,
        seasonId: "s2",
        number,
        title,
        writerUserId: index % 2 === 0 ? "jiahui-wen" : "clemence-aubry",
        stage: mossStageFor(number),
        dueAt: number >= 215 && number <= 220 ? "D+3 18:00" : null,
        pages: null,
        locked: false,
        docKey: `heavy/h26/${number}`,
        docSlot: "script",
      };
    }),
  );

export const MOSS_AND_PEBBLE_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "Moss" },
  { kind: "character", name: "Pebble" },
  { kind: "character", name: "Zip" },
  { kind: "character", name: "Old Newt" },
  { kind: "character", name: "The Heron" },
  { kind: "character", name: "Mrs. Hartley" },
  { kind: "set", name: "Mrs. Hartley's garden" },
]);
