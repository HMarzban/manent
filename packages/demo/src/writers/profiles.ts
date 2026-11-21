// The rates at which a simulated person writes, one profile per kind of writer.

export const PROFILE_IDS = [
  "demo",
  "realistic",
  "rewrite_typist",
  "extreme",
] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

/**
 * Rates are per person. A range is [lowest, highest], both included, and is
 * [0, 0] where its rate is 0.
 */
export interface WritingProfile {
  id: ProfileId;
  keysPerSecond: number;
  burstChars: readonly [number, number];
  pauseMs: readonly [number, number];
  sceneMovesPerHour: number;
  pastesPerHour: number;
  pastePages: readonly [number, number];
  offlinePerHour: number;
  offlineMs: readonly [number, number];
  /** It sends its cursor to the others. */
  presence: boolean;
}

function frozen(profile: WritingProfile): WritingProfile {
  for (const value of Object.values(profile))
    if (Array.isArray(value)) Object.freeze(value);
  return Object.freeze(profile);
}

/**
 * `realistic` types as one of a film room's three writers, who share a scene
 * move a minute; `rewrite_typist` is a night of rewrites' fast typist;
 * `extreme` has ten times `realistic`'s rates.
 */
export const PROFILES: Readonly<Record<ProfileId, WritingProfile>> =
  Object.freeze({
    demo: frozen({
      id: "demo",
      keysPerSecond: 4,
      burstChars: [8, 40],
      pauseMs: [1_000, 4_000],
      sceneMovesPerHour: 0,
      pastesPerHour: 0,
      pastePages: [0, 0],
      offlinePerHour: 0,
      offlineMs: [0, 0],
      presence: true,
    }),
    realistic: frozen({
      id: "realistic",
      keysPerSecond: 4,
      burstChars: [8, 40],
      pauseMs: [2_000, 10_000],
      sceneMovesPerHour: 20,
      pastesPerHour: 0,
      pastePages: [0, 0],
      offlinePerHour: 1,
      offlineMs: [60_000, 1_200_000],
      presence: true,
    }),
    rewrite_typist: frozen({
      id: "rewrite_typist",
      keysPerSecond: 6,
      burstChars: [40, 200],
      pauseMs: [500, 2_000],
      sceneMovesPerHour: 6,
      pastesPerHour: 2,
      pastePages: [1, 3],
      offlinePerHour: 0,
      offlineMs: [0, 0],
      presence: true,
    }),
    extreme: frozen({
      id: "extreme",
      keysPerSecond: 40,
      burstChars: [40, 200],
      pauseMs: [200, 1_000],
      sceneMovesPerHour: 600,
      pastesPerHour: 60,
      pastePages: [10, 50],
      offlinePerHour: 10,
      offlineMs: [60_000, 28_800_000],
      presence: true,
    }),
  });
