// Bundled series configs and combined open-thread list for Lanternfield Studios' background step.
import type { GroupEntry, SeasonEntry } from "@manent/crdt";
import type { FormatId } from "@manent/schema";
import type { SeedProjectName } from "../../seed/capabilities/series.ts";
import { DEVELOPMENT_SLATE_OPEN_THREADS } from "./development-slate-threads.ts";
import { FLAGSHIP_FILM_OPEN_THREADS } from "./film-threads.ts";
import type { HeavyThreadSpec } from "./film-threads.ts";
import {
  ANIMATION_LADDER,
  LARCH_ROAD_EPISODES,
  LARCH_ROAD_GROUPS,
  LARCH_ROAD_NAMES,
  LARCH_ROAD_SEASONS,
  MOSS_AND_PEBBLE_EPISODES,
  MOSS_AND_PEBBLE_GROUPS,
  MOSS_AND_PEBBLE_NAMES,
  MOSS_AND_PEBBLE_SEASONS,
} from "./larch-and-moss.ts";
import { LIVE_AND_BOOKS_OPEN_THREADS } from "./live-and-books-threads.ts";
import { PILOTS_AND_LATE_SLATE_OPEN_THREADS } from "./pilots-and-late-slate-threads.ts";
import {
  ANIMATION_OPEN_THREADS,
  DRAMA_AND_COMEDY_OPEN_THREADS,
} from "./series-threads.ts";
import {
  WARD_NINE_EPISODES,
  WARD_NINE_GROUPS,
  WARD_NINE_NAMES,
  WARD_NINE_SEASONS,
} from "./ward-nine-series.ts";
import type { SeedEpisodeSpec } from "./ward-nine-series.ts";

export interface SeriesIndexConfig {
  readonly projectKey: string;
  readonly at: string;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly groups: readonly GroupEntry[];
  readonly names: readonly SeedProjectName[];
  readonly seasons: readonly SeasonEntry[];
  readonly episodes: readonly SeedEpisodeSpec[];
  readonly measureFormat: FormatId | null;
}

const WARD_NINE_TARGET_PAGES = 58;

export const HEAVY_SERIES_CONFIGS: readonly SeriesIndexConfig[] = Object.freeze(
  [
    {
      projectKey: "heavy/h24",
      at: "D−5 14:00",
      settings: {
        "project.template": "drama",
        "project.targetPages": WARD_NINE_TARGET_PAGES,
      },
      groups: WARD_NINE_GROUPS,
      names: WARD_NINE_NAMES,
      seasons: WARD_NINE_SEASONS,
      episodes: WARD_NINE_EPISODES,
      measureFormat: null,
    },
    {
      projectKey: "heavy/h25",
      at: "D−4 18:00",
      settings: { "project.template": "multi_camera" },
      groups: LARCH_ROAD_GROUPS,
      names: LARCH_ROAD_NAMES,
      seasons: LARCH_ROAD_SEASONS,
      episodes: LARCH_ROAD_EPISODES,
      measureFormat: "multicam",
    },
    {
      projectKey: "heavy/h26",
      at: "D−4 19:00",
      settings: {
        "project.template": "animation",
        "project.ladder": ANIMATION_LADDER,
      },
      groups: MOSS_AND_PEBBLE_GROUPS,
      names: MOSS_AND_PEBBLE_NAMES,
      seasons: MOSS_AND_PEBBLE_SEASONS,
      episodes: MOSS_AND_PEBBLE_EPISODES,
      measureFormat: "animation",
    },
  ],
);

/** All 201 non-round open threads across Heavy (together with H03's 4 and H24 406's 7 = 212 open threads). */
export const ALL_HEAVY_OPEN_THREADS: readonly HeavyThreadSpec[] = Object.freeze(
  [
    ...FLAGSHIP_FILM_OPEN_THREADS,
    ...DRAMA_AND_COMEDY_OPEN_THREADS,
    ...ANIMATION_OPEN_THREADS,
    ...LIVE_AND_BOOKS_OPEN_THREADS,
    ...DEVELOPMENT_SLATE_OPEN_THREADS,
    ...PILOTS_AND_LATE_SLATE_OPEN_THREADS,
  ],
);
