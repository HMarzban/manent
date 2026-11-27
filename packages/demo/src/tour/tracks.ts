// Single source of truth for curated Tour highlights and story tracks across the Demo Stage and Tour panel.

export type TourTrackId =
  | "overview"
  | "screenwriter"
  | "showrunner"
  | "coordinator"
  | "broadcast"
  | "game"
  | "resilience";

export interface TourTrack {
  readonly id: TourTrackId;
  readonly featured: boolean;
  /** Ordered web-runnable scenario IDs forming one cohesive story arc. */
  readonly scenarioIds: readonly string[];
}

/** Six flagship scenarios spanning true pages, live writers, room pitches, offline writing, production locks and rundowns. */
export const TOUR_HIGHLIGHTS: readonly string[] = Object.freeze([
  "write-true-pages",
  "together-add-writers",
  "together-present",
  "offline-write",
  "production-locked-page",
  "rundown-time",
]);

/** Curated story tracks backed directly by the live Tour scenario manifest. */
export const TOUR_TRACKS: readonly TourTrack[] = Object.freeze([
  {
    id: "overview",
    featured: true,
    scenarioIds: TOUR_HIGHLIGHTS,
  },
  {
    id: "screenwriter",
    featured: false,
    scenarioIds: Object.freeze([
      "write-true-pages",
      "write-outline",
      "write-rename-character",
      "write-export",
    ]),
  },
  {
    id: "showrunner",
    featured: false,
    scenarioIds: Object.freeze([
      "write-board",
      "together-cursors",
      "together-comments",
      "together-present",
    ]),
  },
  {
    id: "coordinator",
    featured: false,
    scenarioIds: Object.freeze([
      "production-lock",
      "production-locked-page",
      "production-issue-blue",
      "production-sides",
    ]),
  },
  {
    id: "broadcast",
    featured: false,
    scenarioIds: Object.freeze([
      "rundown-time",
      "rundown-prompter",
      "rundown-send",
      "rundown-remote-prompter",
    ]),
  },
  {
    id: "game",
    featured: false,
    scenarioIds: Object.freeze([
      "write-game-script",
      "write-game-lines",
      "write-ink-play",
    ]),
  },
  {
    id: "resilience",
    featured: false,
    scenarioIds: Object.freeze([
      "offline-overlap",
      "offline-server-stopped",
      "together-add-writers",
      "long-book",
    ]),
  },
]);

/** Finds a story track by id; returns null when unknown. */
export function findTourTrack(id: TourTrackId | null): TourTrack | null {
  if (id === null) return null;
  return TOUR_TRACKS.find((track) => track.id === id) ?? null;
}
