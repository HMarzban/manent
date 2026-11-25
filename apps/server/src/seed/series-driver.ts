// The seed driver's series and project index: settings, seasons, episodes, names, facts and the Board.
import {
  ORIGIN_REMOTE,
  createDoc,
  mergeUpdates,
  orderKeyBetween,
  writeEpisode,
  writeProjectKey,
  writeSeason,
} from "@manent/crdt";
import type { CrdtDoc, ProjectIndexMap } from "@manent/crdt";
import type { SeedSeries, SeedWorkspaceId } from "@manent/demo";
import { docIdV7, indexDocId, projectHome } from "@manent/sync-protocol";
import type { Driving } from "./driving.ts";

const V7_RANDOM_BYTES = 10;

const nextId = (d: Driving): string =>
  docIdV7(d.target.clock.now(), d.bytes(V7_RANDOM_BYTES));

const mapOfSetting = (key: string): ProjectIndexMap => {
  if (key === "project.style") return "style";
  if (key === "project.ladder") return "ladder";
  return "template";
};

/** Ensures the project's index document exists on the server, returning its docId. */
async function ensureProjectIndex(
  d: Driving,
  userId: string,
  project: { projectId: string; workspaceId: SeedWorkspaceId },
): Promise<string> {
  const docId = indexDocId("project", project.projectId);
  if (d.target.storage.directory.placeOf(docId) === null) {
    await d.call(userId, {
      method: "POST",
      path: "/api/docs",
      body: {
        docId,
        kind: "index",
        home: projectHome(project.projectId),
        workspaceId: project.workspaceId,
      },
    });
  }
  return docId;
}

/** Subscribes `userId` to the project index, runs `fn`, pushes its update, and unsubscribes. */
async function pushIndex<T>(
  d: Driving,
  userId: string,
  project: { projectId: string; workspaceId: SeedWorkspaceId },
  fn: (doc: CrdtDoc) => T,
): Promise<T> {
  const docId = await ensureProjectIndex(d, userId, project);
  const link = await d.link(userId);
  const doc = createDoc({ clientId: d.clientId() });
  const { state } = await link.subscribe(docId, doc.clientId);
  try {
    doc.applyUpdate(state, ORIGIN_REMOTE);
    const made: Uint8Array[] = [];
    const stop = doc.subscribe((update) => made.push(update));
    let result: T;
    try {
      result = fn(doc);
    } finally {
      stop();
    }
    if (made.length > 0) await link.push(docId, mergeUpdates(made));
    return result;
  } finally {
    await link.unsubscribe(docId);
    doc.destroy();
    await d.runDue();
  }
}

/** Series and project-index driver over the project index document's maps. */
export function createSeriesDriver(d: Driving): SeedSeries {
  return {
    async setSettings(userId, project, settings) {
      await pushIndex(d, userId, project, (doc) => {
        for (const [key, value] of Object.entries(settings))
          writeProjectKey(doc, mapOfSetting(key), key, value);
      });
    },
    async setSeasons(userId, project, seasons) {
      await pushIndex(d, userId, project, (doc) => {
        for (const season of seasons) writeSeason(doc, season);
      });
    },
    async setEpisodes(userId, project, episodes) {
      await pushIndex(d, userId, project, (doc) => {
        for (const episode of episodes) writeEpisode(doc, episode);
      });
    },
    setNames(userId, project, names) {
      return pushIndex(d, userId, project, (doc) => {
        const ids: string[] = [];
        for (const entry of names) {
          const id = nextId(d);
          writeProjectKey(doc, "names", id, {
            kind: entry.kind,
            name: entry.name,
          });
          ids.push(id);
        }
        return ids;
      });
    },
    setFacts(userId, project, facts) {
      return pushIndex(d, userId, project, (doc) => {
        const ids: string[] = [];
        for (const fact of facts) {
          const id = nextId(d);
          writeProjectKey(doc, "facts", id, {
            docId: fact.docId,
            episodeId: fact.episodeId,
            sceneHeadingId: fact.sceneHeadingId,
            sceneLabel: fact.sceneLabel,
            anchor: fact.anchor,
            byUserId: fact.byUserId,
            at: fact.at,
          });
          ids.push(id);
        }
        return ids;
      });
    },
    async setBoard(userId, project, board) {
      await pushIndex(d, userId, project, (doc) => {
        let lastStorylineOrder: string | null = null;
        for (const storyline of board.storylines) {
          const order = orderKeyBetween(lastStorylineOrder, null);
          lastStorylineOrder = order;
          writeProjectKey(doc, "board", `storyline:${storyline.id}`, {
            title: storyline.title,
            order,
          });
        }
        const cellLastOrder = new Map<string, string>();
        for (const card of board.cards) {
          const cell = `${card.storylineId}\0${card.episodeId}`;
          const order = orderKeyBetween(cellLastOrder.get(cell) ?? null, null);
          cellLastOrder.set(cell, order);
          writeProjectKey(doc, "board", `card:${card.id}`, {
            storylineId: card.storylineId,
            episodeId: card.episodeId,
            text: card.text,
            order,
            link:
              card.linkBlockId === null ? null : { blockId: card.linkBlockId },
          });
        }
      });
    },
  };
}
