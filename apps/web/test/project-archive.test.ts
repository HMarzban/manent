import { expect, test } from "bun:test";
import { createDoc, jsonMap } from "@manent/crdt";
import type { DocStatus } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { writeProjectArchive } from "../src/archive/project-archive.ts";
import { fakeApi } from "./services.fixtures.ts";
import { SYNCED_STATUS, fakeHandle } from "./sync.fixtures.ts";

const USER = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";
const PROJECT = "project-tidewater";
const SCRIPT = "5d6e7f80-9123-4456-8789-9abcdef01234";

const unread = (): never => {
  throw new RangeError("history is not read for a script that cannot be read");
};

/** The archive of a one-script project whose script's handle has `status`. */
function exportWith(status: DocStatus): Promise<unknown> {
  const index = createDoc();
  jsonMap(index, "projects").set(PROJECT, {
    title: "Tidewater",
    kind: "series",
    createdAt: 1,
    createdByUserId: USER,
  });
  jsonMap(index, "documents").set(SCRIPT, {
    projectId: PROJECT,
    title: "Low Water",
    kind: "script",
    createdAt: 1,
    editedAt: null,
    editedByUserId: null,
  });
  const script = fakeHandle(SCRIPT, createDoc());
  script.status.set(status);
  return writeProjectArchive(
    {
      api: fakeApi(),
      userId: USER,
      openHandle: async (docId) =>
        docId === indexDocId("workspace", USER)
          ? fakeHandle(docId, index)
          : script,
      history: { rows: unread, content: unread },
    },
    SCRIPT,
    () => 2,
  );
}

test("a script the device cannot read whole stops the export instead of being written empty", async () => {
  const neverFetched: DocStatus = {
    ...SYNCED_STATUS,
    synced: false,
    link: "offline",
    docSync: "local",
    neverSynced: true,
  };
  const removed: DocStatus = {
    ...SYNCED_STATUS,
    synced: false,
    docSync: "local",
    side: ["access_removed"],
  };
  const refusal = `${SCRIPT} cannot be read whole on this device`;
  await expect(exportWith(neverFetched)).rejects.toThrow(refusal);
  await expect(exportWith(removed)).rejects.toThrow(refusal);
});
