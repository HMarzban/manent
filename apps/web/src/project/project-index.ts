// A project's index: its template, style, seasons, episodes, names, facts, groups, board, ladder and sources.
import { writeGroup } from "@manent/crdt";
import type { GroupEntry, JsonMapView, ProjectIndexMap } from "@manent/crdt";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { indexDocId, projectHome } from "@manent/sync-protocol";
import type { ProjectCreated } from "../services/sync/library-index.ts";
import { liveMap } from "../services/sync/private-index.ts";

/** One open of a project's index: it opens from the device first when it is first asked for, and stays open until `close`. */
export interface ProjectIndex {
  readonly projectId: string;
  /** Rejects when the person's sync could not start or the index could not be opened. */
  handle(): Promise<DocHandle>;
  /** The map `name` of whichever document the handle holds: one replaced under it is followed. */
  map(name: ProjectIndexMap): Promise<JsonMapView>;
  close(): Promise<void>;
}

export function openProjectIndex(options: {
  client: Promise<SyncClient>;
  projectId: string;
}): ProjectIndex {
  const { projectId } = options;
  let opened: Promise<DocHandle> | null = null;
  const handle = (): Promise<DocHandle> => {
    opened ??= options.client.then((client) =>
      client.open(indexDocId("project", projectId)),
    );
    return opened;
  };
  return {
    projectId,
    handle,
    map: async (name) => liveMap(await handle(), name),
    async close() {
      const closing = opened;
      opened = null;
      if (closing !== null) await (await closing).close();
    },
  };
}

/** The groups every project starts with. */
const PRESET_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: [],
    watermark: false,
  },
  {
    id: "producers",
    name: "Producers",
    role: "comment",
    memberUserIds: [],
    watermark: false,
  },
  {
    id: "readers",
    name: "Readers",
    role: null,
    memberUserIds: [],
    watermark: false,
  },
  {
    id: "guests",
    name: "Guests",
    role: null,
    memberUserIds: [],
    watermark: false,
  },
]);

/** A new project's index, made on the device with the preset groups. */
export const projectIndexCreated: ProjectCreated = {
  id: "project_index",
  async made({ sync, workspaceId, projectId }) {
    const handle = await sync.client.open(indexDocId("project", projectId), {
      create: { kind: "index", home: projectHome(projectId), workspaceId },
    });
    for (const group of PRESET_GROUPS) writeGroup(handle.doc(), group);
    await handle.close();
  },
  // the device's store has no way to discard a document, so the index stays in it
  removed: () => {},
};
