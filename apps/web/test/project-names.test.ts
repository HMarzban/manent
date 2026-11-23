import { expect, test } from "bun:test";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { ProjectIndex } from "../src/project/project-index.ts";
import { documentNames } from "../src/names/project-names.ts";
import { liveMap } from "../src/services/sync/private-index.ts";
import { createIndexWorld } from "./index.fixtures.ts";
import { until } from "./sync.fixtures.ts";

const YOU = Object.freeze({ token: null, userId: "you", name: "You" });

/** `handle`, recording its document in `closed` when it is closed. */
function noting(handle: DocHandle, closed: string[]): DocHandle {
  return new Proxy(handle, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (key === "close")
        return () => {
          closed.push(target.docId);
          return target.close();
        };
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

test("a page's names are looked up and added without closing the indexes the rest of the tab holds", async () => {
  const w = await createIndexWorld();
  const tab = await w.personServices({ person: YOU });
  const made = await tab.library.createProject("you", "film");
  const own = await tab.openHandle(indexDocId("user", "you"));
  liveMap(own, "continue").set(made.docId, {
    workspaceId: "you",
    openedAt: 0,
  });
  await w.settleAll();

  // closing a handle ends its document's session for every holder in the tab
  const closed: string[] = [];
  const names = documentNames(
    {
      ...tab,
      openHandle: async (docId) => noting(await tab.openHandle(docId), closed),
      projectIndex(projectId): ProjectIndex {
        const index = tab.projectIndex(projectId);
        return {
          ...index,
          async close() {
            closed.push(indexDocId("project", projectId));
            await index.close();
          },
        };
      },
    },
    made.docId,
  );
  const stop = names.subscribe(() => {});
  expect(await names.add("Marguerite", "character")).toBe(true);
  await until(() => names.spellings().includes("Marguerite"));
  stop();
  await w.settleAll();
  expect(closed).toEqual([]);
});
