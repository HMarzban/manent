// The demo's seed: its workspaces, built by steps that share one seeded generator.
import type { IdSource } from "@manent/schema";
import { DEMO_PEOPLE, DEMO_WORKSPACES } from "../people.ts";
import type { DemoPerson } from "../people.ts";
import { createRng, seededIdSource } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { SEED_STEPS } from "./steps/index.ts";

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
  /** Progress, for a step that runs in the background. */
  report(done: number, total: number): void;
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

export interface SeedOptions {
  seed?: number;
  steps?: readonly SeedStep[];
  dataDir?: string;
  serverUrl?: string;
  /** Which steps run; default "foreground". */
  phase?: "foreground" | "background" | "all";
  onProgress?(workspace: string, done: number, total: number): void;
}

/**
 * Runs the steps of `phase` in order, each adding its entries to its own
 * workspace. Defaults: `DEMO_SEED`, the package's steps, no data directory, no
 * server, the foreground phase. Rejects with a RangeError naming a step whose
 * workspace does not exist, before any step runs.
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
      report: (done, total) =>
        options.onProgress?.(step.workspace, done, total),
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
