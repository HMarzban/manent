// The demo's seed: its workspaces, built by steps that share one seeded generator.
import type { IdSource } from "@manent/schema";
import type { PageMeter } from "../generate/fit.ts";
import { DEMO_PEOPLE, DEMO_WORKSPACES } from "../people.ts";
import type { DemoPerson } from "../people.ts";
import type { SeedCapability, SeedDriver } from "./driver.ts";
import { createRng, seededIdSource } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { SEED_STEPS } from "./steps/index.ts";
import { createSeedTime } from "./time.ts";
import type { SeedTime } from "./time.ts";

export const DEMO_SEED = 4747;

export interface SeedEntry {
  project: string;
  documents: number;
}

export interface SeedWorkspace {
  id: string;
  name: string;
  memberUserIds: string[];
  projects: SeedEntry[];
}

export interface SeedContext {
  rng: Rng;
  ids: IdSource;
  people: readonly DemoPerson[];
  workspace: SeedWorkspace;
  /** Where a step writes; null when the seed is built without a data directory. */
  dataDir: string | null;
  /** The server a step replays edits through; null when there is none. */
  serverUrl: string | null;
  /** Null when only the manifest is built: the step then returns its entries and writes nothing. */
  driver: SeedDriver | null;
  time: SeedTime;
  /** Records an action left out because the server lacks `capability`; `what` says it in a few words. */
  skip(capability: SeedCapability, what: string): void;
  /** Progress, for a step that runs in the background; nothing hears it in the foreground. */
  report(done: number, total: number): void;
  /** Lays blocks out as the engine does; null when only the manifest is built. */
  meter: PageMeter | null;
}

export interface SeedStep {
  id: string;
  /** The id of the workspace whose projects it adds to. */
  workspace: string;
  /** True: runs after the app has opened; false: before. */
  background: boolean;
  run(context: SeedContext): Promise<SeedEntry[]>;
}

export interface SeedManifest {
  formatVersion: 1;
  seed: number;
  userIds: string[];
  workspaces: SeedWorkspace[];
}

/** An action a step left out because the server lacked its capability. */
export interface SkippedAction {
  step: string;
  capability: SeedCapability;
  what: string;
}

export interface SeedOptions {
  seed?: number;
  steps?: readonly SeedStep[];
  dataDir?: string;
  serverUrl?: string;
  /** Which steps run; default "foreground". */
  phase?: "foreground" | "background" | "all";
  onProgress?(done: number, total: number): void;
  driver?: SeedDriver;
  /** The moment the seed runs, epoch ms; default 0. */
  seedAt?: number;
  /** The local offset east of UTC at `seedAt`; default 0. */
  zoneOffsetMs?: number;
  onSkipped?(entry: SkippedAction): void;
  meter?: PageMeter;
}

/**
 * Runs the steps of `phase` in order, each adding its entries to its own
 * workspace. Defaults: `DEMO_SEED`, the package's steps, no data directory, no
 * server, no driver, no meter, the foreground phase. Rejects with a RangeError naming a
 * step whose workspace does not exist, before any step runs.
 */
export async function buildSeed(
  options: SeedOptions = {},
): Promise<SeedManifest> {
  const seed = options.seed ?? DEMO_SEED;
  const steps = options.steps ?? SEED_STEPS;
  const phase = options.phase ?? "foreground";
  const workspaces: SeedWorkspace[] = DEMO_WORKSPACES.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    memberUserIds: [...workspace.memberUserIds],
    projects: [],
  }));
  const homes = steps.map((step) => {
    const home = workspaces.find(
      (workspace) => workspace.id === step.workspace,
    );
    if (home === undefined)
      throw new RangeError(
        `the seed step ${step.id} adds to a workspace that does not exist: ${step.workspace}`,
      );
    return home;
  });
  const rng = createRng(seed);
  const ids = seededIdSource(rng);
  const time = createSeedTime({
    seedAt: options.seedAt ?? 0,
    zoneOffsetMs: options.zoneOffsetMs ?? 0,
  });
  for (const [i, step] of steps.entries()) {
    if (phase !== "all" && step.background !== (phase === "background"))
      continue;
    const workspace = homes[i]!;
    const entries = await step.run({
      rng,
      ids,
      people: DEMO_PEOPLE,
      workspace,
      dataDir: options.dataDir ?? null,
      serverUrl: options.serverUrl ?? null,
      driver: options.driver ?? null,
      time,
      skip: (capability, what) =>
        options.onSkipped?.({ step: step.id, capability, what }),
      report: (done, total) => options.onProgress?.(done, total),
      meter: options.meter ?? null,
    });
    workspace.projects.push(...entries);
  }
  return {
    formatVersion: 1,
    seed,
    userIds: DEMO_PEOPLE.map((person) => person.userId),
    workspaces,
  };
}
