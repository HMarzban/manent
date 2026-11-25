// Ward Nine's series index data: past seasons, Season 4 table, Season 5 episode slots, cut scene and names.
import type { GroupEntry, SeasonEntry } from "@manent/crdt";
import type { SeedProjectName } from "../../seed/capabilities/series.ts";

export interface SeedEpisodeSpec {
  readonly id: string;
  readonly seasonId: string;
  readonly number: number;
  readonly title: string;
  readonly writerUserId: string;
  readonly stage: string;
  /** Relative seed time spec (e.g. "D+4 18:00"), or null when no due date is set. */
  readonly dueAt: string | null;
  /** Fixed page count, or null when unscripted or measured from the document. */
  readonly pages: number | null;
  readonly locked: boolean;
  readonly docKey: string;
  readonly docSlot: "script" | "outline";
}

type EpisodeRow = readonly [
  seasonId: string,
  number: number,
  title: string,
  writerUserId: string,
  stage: string,
  dueAt: string | null,
  pages: number | null,
  locked: boolean,
  docSlot: "script" | "outline",
];

const WARD_NINE_ROWS: readonly EpisodeRow[] = [
  [
    "s4",
    401,
    "Night Rounds",
    "declan-furey",
    "As shot",
    null,
    57,
    true,
    "script",
  ],
  ["s4", 402, "Handover", "yusuf-demirel", "As shot", null, 59, true, "script"],
  [
    "s4",
    403,
    "Nil by Mouth",
    "saoirse-galvin",
    "As shot",
    null,
    58,
    true,
    "script",
  ],
  [
    "s4",
    404,
    "The Long Corridor",
    "amara-nwosu",
    "Pink",
    null,
    60,
    true,
    "script",
  ],
  [
    "s4",
    405,
    "Visiting Hours",
    "declan-furey",
    "White",
    null,
    58,
    true,
    "script",
  ],
  [
    "s4",
    406,
    "Bed Seven",
    "yusuf-demirel",
    "Network",
    "D+4 18:00",
    62,
    false,
    "script",
  ],
  [
    "s4",
    407,
    "Second Opinion",
    "saoirse-galvin",
    "Studio",
    "D+9 18:00",
    59,
    false,
    "script",
  ],
  [
    "s4",
    408,
    "Lights Out",
    "amara-nwosu",
    "Writer's First",
    "D+16 18:00",
    55,
    false,
    "script",
  ],
  [
    "s4",
    409,
    "Discharge",
    "tariq-al-masri",
    "Outline",
    "D+23 18:00",
    null,
    false,
    "script",
  ],
  [
    "s4",
    410,
    "First Light",
    "declan-furey",
    "Outline",
    "D+30 18:00",
    null,
    false,
    "script",
  ],
  [
    "s5",
    501,
    "Night Shift",
    "declan-furey",
    "Outline",
    null,
    null,
    false,
    "outline",
  ],
  [
    "s5",
    502,
    "Relief Cover",
    "yusuf-demirel",
    "Outline",
    null,
    null,
    false,
    "outline",
  ],
  [
    "s5",
    503,
    "Triage",
    "saoirse-galvin",
    "Outline",
    null,
    null,
    false,
    "outline",
  ],
];

export const WARD_NINE_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: [
      "declan-furey",
      "yusuf-demirel",
      "saoirse-galvin",
      "amara-nwosu",
      "tariq-al-masri",
      "niamh-corrigan",
      "mateus-ferreira",
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
  {
    id: "clearance",
    name: "Clearance",
    role: "comment",
    memberUserIds: ["rhys-trevenna"],
    watermark: false,
  },
]);

export const WARD_NINE_SEASONS: readonly SeasonEntry[] = Object.freeze([
  { id: "s1", number: 1, title: null },
  { id: "s2", number: 2, title: null },
  { id: "s3", number: 3, title: null },
  { id: "s4", number: 4, title: null },
  { id: "s5", number: 5, title: null },
]);

export const WARD_NINE_EPISODES: readonly SeedEpisodeSpec[] = Object.freeze(
  WARD_NINE_ROWS.map(
    ([
      seasonId,
      number,
      title,
      writerUserId,
      stage,
      dueAt,
      pages,
      locked,
      docSlot,
    ]): SeedEpisodeSpec => ({
      id: `ep-${number}`,
      seasonId,
      number,
      title,
      writerUserId,
      stage,
      dueAt,
      pages,
      locked,
      docKey: `heavy/h24/${number}`,
      docSlot,
    }),
  ),
);

/** Scene cut from Ward Nine 403 ("Mick's tea round") that 406 brings back. */
export const WARD_NINE_403_CUT = Object.freeze([
  {
    element: "scene_heading" as const,
    text: "INT. WARD NINE - STAFF ROOM - NIGHT",
  },
  {
    element: "action" as const,
    text: "MICK DOYLE wheels the battered tea trolley through the swing door, six mismatched mugs rattling on the top shelf.",
  },
  { element: "character" as const, text: "MICK" },
  {
    element: "dialogue" as const,
    text: "Before anyone asks, the decaf ran out on Tuesday and the kettle on seven has blown its fuse again.",
  },
  { element: "character" as const, text: "AUDREY" },
  {
    element: "dialogue" as const,
    text: "Leave the blue mug for Bea, Mick. She hasn't sat down since handover.",
  },
]);

export const WARD_NINE_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "Sister Audrey Kane" },
  { kind: "character", name: "Dr. Omar Hadid" },
  { kind: "character", name: "Dr. Bea Lindsay" },
  { kind: "character", name: "Mick Doyle" },
  { kind: "character", name: "Nurse Tayo Bankole" },
  { kind: "character", name: "Nurse Ella Shaw" },
  { kind: "set", name: "Lannick General" },
  { kind: "set", name: "Ward Nine" },
]);
