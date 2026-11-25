// Declarative draft-send and comment-round schedule for Harbour Lights episodes 201–204.
import {
  FERRY_WORKING_THREADS,
  FERRY_WRITERS_FIRST_THREADS,
  SALT_DANA_GOAHEAD,
  SALT_WHITE_NOTE,
  UNDERTOW_NETWORK_THREADS,
  UNDERTOW_STUDIO_THREADS,
} from "./harbour-lights-room.ts";
import type { EpisodeThread } from "./harbour-lights-room.ts";
import { PRODUCER_EXTRA_IDS } from "./harbour-lights-series.ts";

export type VersionLookup =
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "production"; readonly ordinal: 0 | 1 };

export interface EpisodeSendPlan {
  readonly episode: "201" | "202" | "203" | "204";
  readonly at: string;
  readonly userId: string;
  readonly version: VersionLookup;
  readonly against: VersionLookup | null;
  readonly name: string;
  readonly what: "full" | "changed";
  readonly files: readonly string[];
  readonly groupIds: readonly string[];
  readonly extraUserIds: readonly string[];
  readonly withLink: boolean;
  readonly leoOpenedAt: string | null;
  readonly roundName: string | null;
  readonly roundThreads: readonly EpisodeThread[];
  readonly workingThreads: readonly EpisodeThread[];
}

const DIST_GROUPS = Object.freeze(["production", "cast", "studio", "network"]);
const WHITE: VersionLookup = Object.freeze({ kind: "production", ordinal: 0 });
const BLUE: VersionLookup = Object.freeze({ kind: "production", ordinal: 1 });
const named = (name: string): VersionLookup => ({ kind: "named", name });

export const HARBOUR_LIGHTS_SEND_PLANS: readonly EpisodeSendPlan[] =
  Object.freeze([
    {
      episode: "201",
      at: "D−24 10:30",
      userId: "priya",
      version: WHITE,
      against: null,
      name: "White production draft",
      what: "full",
      files: ["pdf"],
      groupIds: DIST_GROUPS,
      extraUserIds: [],
      withLink: false,
      leoOpenedAt: null,
      roundName: null,
      roundThreads: [],
      workingThreads: [],
    },
    {
      episode: "201",
      at: "D−12 16:00",
      userId: "priya",
      version: BLUE,
      against: WHITE,
      name: "Blue",
      what: "changed",
      files: ["pdf_marked"],
      groupIds: DIST_GROUPS,
      extraUserIds: [],
      withLink: false,
      leoOpenedAt: null,
      roundName: null,
      roundThreads: [],
      workingThreads: [],
    },
    {
      episode: "202",
      at: "D−10 10:30",
      userId: "priya",
      version: WHITE,
      against: null,
      name: "White production draft",
      what: "full",
      files: ["pdf"],
      groupIds: DIST_GROUPS,
      extraUserIds: [],
      withLink: true,
      leoOpenedAt: "D−7 13:30",
      roundName: "Network",
      roundThreads: [SALT_WHITE_NOTE],
      workingThreads: [SALT_DANA_GOAHEAD],
    },
    {
      episode: "203",
      at: "D−9 17:00",
      userId: "dana",
      version: named("Studio draft"),
      against: null,
      name: "Studio draft",
      what: "full",
      files: ["pdf"],
      groupIds: ["studio"],
      extraUserIds: [],
      withLink: false,
      leoOpenedAt: null,
      roundName: "Studio",
      roundThreads: UNDERTOW_STUDIO_THREADS,
      workingThreads: [],
    },
    {
      episode: "203",
      at: "D−5 17:00",
      userId: "dana",
      version: named("Network draft"),
      against: named("Studio draft"),
      name: "Network draft",
      what: "full",
      files: ["pdf"],
      groupIds: ["network"],
      extraUserIds: PRODUCER_EXTRA_IDS,
      withLink: true,
      leoOpenedAt: "D−4 09:30",
      roundName: "Network",
      roundThreads: UNDERTOW_NETWORK_THREADS,
      workingThreads: [],
    },
    {
      episode: "204",
      at: "D−4 18:05",
      userId: "sam",
      version: named("Writer's First"),
      against: null,
      name: "Writer's First",
      what: "full",
      files: ["pdf"],
      groupIds: ["room"],
      extraUserIds: [],
      withLink: false,
      leoOpenedAt: null,
      roundName: "Room",
      roundThreads: FERRY_WRITERS_FIRST_THREADS,
      workingThreads: [],
    },
    {
      episode: "204",
      at: "D−1 17:45",
      userId: "dana",
      version: named("Studio draft"),
      against: named("Writer's First"),
      name: "Studio draft",
      what: "full",
      files: ["pdf"],
      groupIds: ["studio"],
      extraUserIds: ["leo", ...PRODUCER_EXTRA_IDS],
      withLink: true,
      leoOpenedAt: "D−1 18:30",
      roundName: null,
      roundThreads: [],
      workingThreads: FERRY_WORKING_THREADS,
    },
  ]);
