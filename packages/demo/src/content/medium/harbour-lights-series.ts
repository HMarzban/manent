// Harbour Lights Season 2: project settings, groups, names and the Board's storylines and 22 cards.
import type { GroupEntry } from "@manent/crdt";
import { GENERATED_MEMBERS } from "../../people/members.ts";
import type {
  SeedBoardStoryline,
  SeedProjectName,
} from "../../seed/capabilities/series.ts";

export interface HarbourLightsBoardCard {
  readonly id: string;
  readonly storylineId: string;
  readonly episodeNumber: 201 | 202 | 203 | 204 | 205 | 206;
  readonly text: string;
  /** 1-based scene number in that episode's script, or null when unlinked. */
  readonly scene: number | null;
}

const HEAVY_MEMBER_IDS = GENERATED_MEMBERS.filter(
  (member) => member.workspaceId === "heavy",
).map((member) => member.userId);

const extraCrew = (prefix: string, count: number): readonly string[] =>
  Array.from(
    { length: count },
    (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`,
  );

// 85 distribution recipients: Production (64), Cast (11, watermarked), Studio (6), Network (4 with Leo).
const NETWORK_IDS = Object.freeze(["leo", ...HEAVY_MEMBER_IDS.slice(0, 3)]);
export const PRODUCER_EXTRA_IDS = Object.freeze(HEAVY_MEMBER_IDS.slice(3, 6));
const PRODUCERS_IDS = Object.freeze(["leo", ...PRODUCER_EXTRA_IDS]);
const STUDIO_IDS = Object.freeze(HEAVY_MEMBER_IDS.slice(6, 12));
const CAST_IDS = Object.freeze(HEAVY_MEMBER_IDS.slice(12, 23));
const PRODUCTION_IDS = Object.freeze([
  ...HEAVY_MEMBER_IDS.slice(23, 78),
  ...extraCrew("harbour-lights-crew", 9),
]);

export const HARBOUR_LIGHTS_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: ["dana", "sam", "priya"],
    watermark: false,
  },
  {
    id: "producers",
    name: "Producers",
    role: "comment",
    memberUserIds: PRODUCERS_IDS,
    watermark: false,
  },
  {
    id: "studio",
    name: "Studio",
    role: null,
    memberUserIds: STUDIO_IDS,
    watermark: false,
  },
  {
    id: "network",
    name: "Network",
    role: "comment",
    memberUserIds: NETWORK_IDS,
    watermark: false,
  },
  {
    id: "production",
    name: "Production",
    role: null,
    memberUserIds: PRODUCTION_IDS,
    watermark: false,
  },
  {
    id: "cast",
    name: "Cast",
    role: null,
    memberUserIds: CAST_IDS,
    watermark: true,
  },
]);

/** Project settings for Harbour Lights: one-hour drama, 58-page target, bold scene headings, underlined act headings. */
export const HARBOUR_LIGHTS_SETTINGS: Readonly<Record<string, unknown>> =
  Object.freeze({
    "project.template": "drama",
    "project.acts": Object.freeze([
      "Teaser",
      "Act One",
      "Act Two",
      "Act Three",
      "Act Four",
      "Tag",
    ]),
    "project.targetPages": 58,
    "project.ladder": Object.freeze([
      "Writer's First",
      "Studio",
      "Network",
      "Table",
      "White",
    ]),
    "project.style": Object.freeze({
      scene_heading: Object.freeze({
        capitalized: null,
        underlined: null,
        bold: true,
        colour: null,
        spaceBefore: null,
        indent: null,
        width: null,
      }),
      "act_break.new_act": Object.freeze({
        capitalized: null,
        underlined: true,
        bold: null,
        colour: null,
        spaceBefore: null,
        indent: null,
        width: null,
      }),
    }),
  });

/** Project Names (Mr. Brack deliberately omitted so 202's Issue Blue check flags him). */
export const HARBOUR_LIGHTS_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "Ida Hollis" },
  { kind: "character", name: "Cal Hollis" },
  { kind: "character", name: "Maren Quist" },
  { kind: "character", name: "Pike" },
  { kind: "character", name: "Nora Hollis" },
  { kind: "character", name: "Arne Hollis" },
  { kind: "character", name: "Elspeth Dray" },
  { kind: "character", name: "Finn" },
  { kind: "set", name: "WHEELHOUSE" },
  { kind: "set", name: "CAR DECK" },
  { kind: "set", name: "PASSENGER LOUNGE" },
  { kind: "set", name: "ENGINE ROOM" },
  { kind: "set", name: "FOREDECK" },
  { kind: "set", name: "FERRY SLIP" },
  { kind: "set", name: "FERRY TERMINAL" },
  { kind: "set", name: "TERMINAL OFFICE" },
  { kind: "set", name: "HOLLIS KITCHEN" },
  { kind: "set", name: "BOATYARD" },
  { kind: "set", name: "BOATYARD OFFICE" },
  { kind: "set", name: "HARBOUR MOUTH" },
  { kind: "set", name: "EAST CHANNEL" },
  { kind: "set", name: "THE BAR" },
  { kind: "set", name: "MAINLAND SLIP" },
  { kind: "set", name: "BREAD VAN" },
  { kind: "term", name: "Marguerite" },
  { kind: "term", name: "East Channel" },
  { kind: "term", name: "the Bar" },
  { kind: "term", name: "Ardle slip" },
  { kind: "term", name: "sounder" },
  { kind: "term", name: "fathoms" },
  { kind: "term", name: "the licence review" },
]);

export const HARBOUR_LIGHTS_STORYLINES: readonly SeedBoardStoryline[] =
  Object.freeze([
    { id: "a", title: "A — The licence review" },
    { id: "b", title: "B — Cal comes home" },
    { id: "c", title: "C — Finn" },
    { id: "d", title: "D — Nora's café" },
  ]);

/** 22 Board cards across storylines A–D and episodes 201–206: 17 linked to scenes, 5 unlinked. */
export const HARBOUR_LIGHTS_CARDS: readonly HarbourLightsBoardCard[] =
  Object.freeze([
    // Storyline A — The licence review (6 cards: 5 linked, 1 unlinked on 206)
    {
      id: "c01",
      storylineId: "a",
      episodeNumber: 201,
      text: "Licence review letter arrives in the morning post; spring low strands the Marguerite.",
      scene: 7,
    },
    {
      id: "c02",
      storylineId: "a",
      episodeNumber: 202,
      text: "Salt in the port engine threatens the timetable while the mainland watches.",
      scene: 5,
    },
    {
      id: "c03",
      storylineId: "a",
      episodeNumber: 203,
      text: "Maren threatens to resign over the safety cover during the open-water swim.",
      scene: 33,
    },
    {
      id: "c04",
      storylineId: "a",
      episodeNumber: 204,
      text: "Woman in the green coat boards the first crossing after the fog with exact change.",
      scene: 8,
    },
    {
      id: "c05",
      storylineId: "a",
      episodeNumber: 205,
      text: "Elspeth Dray reveals she is the licence inspector and takes the crossing log.",
      scene: 14,
    },
    {
      id: "c06",
      storylineId: "a",
      episodeNumber: 206,
      text: "Ida takes the Marguerite over the Bar at night to make the moved hearing.",
      scene: null,
    },
    // Storyline B — Cal comes home (6 cards: 5 linked, 1 unlinked on 206)
    {
      id: "c07",
      storylineId: "b",
      episodeNumber: 201,
      text: "Cal walks off the mainland crossing with one holdall after ten years away.",
      scene: 3,
    },
    {
      id: "c08",
      storylineId: "b",
      episodeNumber: 202,
      text: "Cal helps Arne in the boatyard and tries not to ask about the old row.",
      scene: 14,
    },
    {
      id: "c09",
      storylineId: "b",
      episodeNumber: 203,
      text: "Cal pulls a cramping swimmer out of the tide while the safety boat stays in shot.",
      scene: 16,
    },
    {
      id: "c10",
      storylineId: "b",
      episodeNumber: 204,
      text: "Cal steps into the wheelhouse as Ida's mate and reads the sounder twice.",
      scene: 10,
    },
    {
      id: "c11",
      storylineId: "b",
      episodeNumber: 205,
      text: "Cal reads Elspeth's notebook on the lounge bench and owns up to Ida on the slip.",
      scene: 19,
    },
    {
      id: "c12",
      storylineId: "b",
      episodeNumber: 206,
      text: "Cal works the ramp chain in the dark and misreads the East Channel marks once.",
      scene: null,
    },
    // Storyline C — Finn (5 cards: 3 linked, 2 unlinked)
    {
      id: "c13",
      storylineId: "c",
      episodeNumber: 204,
      text: "Cal counts eleven on foot, then finds a pair of bare feet in the bread van.",
      scene: 11,
    },
    {
      id: "c14",
      storylineId: "c",
      episodeNumber: 205,
      text: "Finn eats three breakfasts at the café and slips straight back into the engine room.",
      scene: 4,
    },
    {
      id: "c15",
      storylineId: "c",
      episodeNumber: 205,
      text: "Arne shows Finn how to turn the boatyard winch and recognises a runaway.",
      scene: 8,
    },
    {
      id: "c16",
      storylineId: "c",
      episodeNumber: 205,
      text: "Ida writes Finn into the ship's log by his first name at slack water.",
      scene: null,
    },
    {
      id: "c17",
      storylineId: "c",
      episodeNumber: 206,
      text: "Finn stows away in the bread van a second time for the night run to Ardle.",
      scene: null,
    },
    // Storyline D — Nora's café (5 cards: 4 linked, 1 unlinked on 206)
    {
      id: "c18",
      storylineId: "d",
      episodeNumber: 201,
      text: "Nora hides the envelope of unpaid bills behind the café clock before Cal sees.",
      scene: 22,
    },
    {
      id: "c19",
      storylineId: "d",
      episodeNumber: 202,
      text: "Nora faces the unpaid fish bill and meets Mr. Brack at the Ardle bank.",
      scene: 28,
    },
    {
      id: "c20",
      storylineId: "d",
      episodeNumber: 203,
      text: "Nora and Arne argue over whether the café can carry another quiet quarter.",
      scene: 24,
    },
    {
      id: "c21",
      storylineId: "d",
      episodeNumber: 204,
      text: "Nora feeds Finn and clocks the stranger in the green coat at the window table.",
      scene: 36,
    },
    {
      id: "c22",
      storylineId: "d",
      episodeNumber: 206,
      text: "Nora shuts the café early to back Ida at the mainland hearing.",
      scene: null,
    },
  ]);
