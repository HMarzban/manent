// The seed driver's rundowns: creating rundowns, initialising their fields and linking their stories.
import {
  ORIGIN_REMOTE,
  createDoc,
  initRundown,
  jsonMap,
  mergeUpdates,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import {
  SEED_DOCS,
  SEED_PROJECTS,
  SeedDriverError,
  seedProject,
} from "@manent/demo";
import type { SeedRundowns } from "@manent/demo";
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import type { Driving } from "./driving.ts";
import { isFields } from "./link.ts";

const DEFAULT_WINDOW_LEAD_MS = 3_600_000;
const PROJECT_HOME_PREFIX = "project:";

/** Subscribes `userId` to `docId`, runs `fn` capturing its CRDT update, pushes it, and unsubscribes. */
async function pushDoc(
  d: Driving,
  userId: string,
  docId: string,
  fn: (doc: CrdtDoc) => void,
): Promise<void> {
  const link = await d.link(userId);
  const doc = createDoc({ clientId: d.clientId() });
  let subscribed = false;
  try {
    const { state } = await link.subscribe(docId, doc.clientId);
    subscribed = true;
    doc.applyUpdate(state, ORIGIN_REMOTE);
    const made: Uint8Array[] = [];
    const stop = doc.subscribe((update) => made.push(update));
    try {
      fn(doc);
    } finally {
      stop();
    }
    if (made.length > 0) await link.push(docId, mergeUpdates(made));
  } finally {
    if (subscribed) await link.unsubscribe(docId);
    doc.destroy();
    await d.runDue();
  }
}

/** Rundown driver over `POST /api/docs`, the rundown document's roots, and the workspace index. */
export function createRundownsDriver(d: Driving): SeedRundowns {
  return {
    async create(userId, rundown) {
      await d.call(userId, {
        method: "POST",
        path: "/api/docs",
        body: {
          docId: rundown.docId,
          kind: "rundown",
          home: rundown.home,
          workspaceId: rundown.workspaceId,
        },
      });
      const projectId = rundown.home.slice(PROJECT_HOME_PREFIX.length);
      const catalogDoc = SEED_DOCS.find(
        (entry) => entry.docId === rundown.docId,
      );
      const catalogProject =
        catalogDoc !== undefined
          ? seedProject(catalogDoc.projectKey)
          : SEED_PROJECTS.find((project) => project.projectId === projectId);
      const columns =
        catalogProject?.kind === "news" ? NEWS_COLUMNS : SHOW_COLUMNS;
      await pushDoc(d, userId, rundown.docId, (doc) => {
        initRundown(
          doc,
          {
            airDate: rundown.airDate,
            airAt: rundown.airAt,
            windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
            targetMs: rundown.targetMs,
          },
          columns,
        );
      });
      const indexId = indexDocId("workspace", rundown.workspaceId);
      await pushDoc(d, userId, indexId, (doc) => {
        const project = jsonMap(doc, "projects").get(projectId);
        const projectTitle =
          isFields(project) && typeof project.title === "string"
            ? project.title
            : null;
        const title =
          catalogDoc?.title ??
          projectTitle ??
          catalogProject?.title ??
          rundown.airDate;
        jsonMap(doc, "documents").set(rundown.docId, {
          projectId,
          title,
          kind: "rundown",
          createdAt: d.target.clock.now(),
          editedAt: null,
          editedByUserId: null,
          airDate: rundown.airDate,
          rundownId: null,
        });
      });
    },
    async link(userId, workspaceId, { rundownId, storyDocIds }) {
      if (storyDocIds.length === 0) return;
      const indexId = indexDocId("workspace", workspaceId);
      await pushDoc(d, userId, indexId, (doc) => {
        const documents = jsonMap(doc, "documents");
        for (const storyDocId of storyDocIds) {
          const entry = documents.get(storyDocId);
          if (!isFields(entry))
            throw new SeedDriverError(
              "unavailable",
              `workspace ${workspaceId} index has no entry for ${storyDocId}`,
            );
          documents.set(storyDocId, { ...entry, rundownId });
        }
      });
    },
  };
}
