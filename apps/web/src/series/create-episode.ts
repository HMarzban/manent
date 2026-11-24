// Creates a new season or episode in a series project index and waits for an online script to sync so it opens privately.
import { writeEpisode, writeSeason } from "@manent/crdt";
import type { EpisodeEntry, SeasonEntry } from "@manent/crdt";
import type { DocStatus } from "@manent/sync-client";
import { SERIES_WORDS } from "@manent/ui";
import type { ProjectIndex } from "../project/project-index.ts";
import type { PersonServices } from "../services/ports.ts";
import { startScript } from "../services/sync/create-script.ts";

const SYNC_WAIT_MS = 2_500;

const isReadyForPrivateOpen = (status: DocStatus): boolean =>
  (status.synced && !status.neverSynced) ||
  status.link === "offline" ||
  status.side.length > 0;

/**
 * Waits briefly while online until `docId` has synced its creation to the server so `16:PW`'s private-open path sees
 * it as synced; returns immediately when offline or after `SYNC_WAIT_MS`.
 */
async function waitUntilSynced(
  services: Pick<PersonServices, "openHandle">,
  docId: string,
  online: () => boolean,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<void> {
  if (!online()) return;
  const handle = await services.openHandle(docId);
  try {
    if (isReadyForPrivateOpen(handle.status.get())) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        stop();
        cancel();
        resolve();
      };
      const stop = handle.status.subscribe((status) => {
        if (isReadyForPrivateOpen(status)) finish();
      });
      const cancel = schedule(finish, SYNC_WAIT_MS);
    });
  } finally {
    await handle.close();
  }
}

export interface NewEpisodeOptions {
  services: PersonServices;
  index: ProjectIndex;
  workspaceId: string;
  projectId: string;
  season: SeasonEntry;
  episodes: readonly EpisodeEntry[];
  language: string;
  online: () => boolean;
  randomId: () => string;
  schedule: (fn: () => void, delayMs: number) => () => void;
}

/**
 * Adds a new episode to `season` numbered one past its highest (or `season.number * 100 + 1` when empty), names the
 * current person its writer, and returns its new script's doc id.
 */
export async function createSeriesEpisode(
  options: NewEpisodeOptions,
): Promise<string> {
  const { services, index, workspaceId, projectId, season, episodes } = options;
  const seasonEpisodes = episodes.filter((ep) => ep.seasonId === season.id);
  const nextNumber =
    seasonEpisodes.length === 0
      ? season.number * 100 + 1
      : Math.max(...seasonEpisodes.map((ep) => ep.number)) + 1;
  const projectDoc = (await index.handle()).doc();
  const title = `${nextNumber} ${SERIES_WORDS.untitledEpisode}`;
  const created = await services.library.addCopy(
    workspaceId,
    projectId,
    "series",
    title,
    {
      docKind: "script",
      airDate: null,
      rundownId: null,
      start: (handle) => startScript(handle, options.language, "screenplay"),
    },
  );
  writeEpisode(projectDoc, {
    id: options.randomId(),
    seasonId: season.id,
    number: nextNumber,
    title: null,
    writerUserId: services.userId,
    stage: null,
    dueAt: null,
    pages: null,
    openCount: null,
    locked: false,
    docIds: { script: created.docId, outline: null, roomLog: null },
  });
  await waitUntilSynced(
    services,
    created.docId,
    options.online,
    options.schedule,
  );
  return created.docId;
}

/** Adds an empty season numbered one past the highest existing season (1 when none). */
export async function createSeriesSeason(options: {
  index: ProjectIndex;
  seasons: readonly SeasonEntry[];
  randomId: () => string;
}): Promise<SeasonEntry> {
  const nextNumber =
    options.seasons.length === 0
      ? 1
      : Math.max(...options.seasons.map((s) => s.number)) + 1;
  const season: SeasonEntry = {
    id: options.randomId(),
    number: nextNumber,
    title: null,
  };
  writeSeason((await options.index.handle()).doc(), season);
  return season;
}
