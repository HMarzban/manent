// The seed driver's start-from links: records `source` and `chapters` in the copy's project index.
import {
  ORIGIN_REMOTE,
  createDoc,
  mergeUpdates,
  writeSource,
} from "@manent/crdt";
import type { SourceEntry } from "@manent/crdt";
import { SeedDriverError } from "@manent/demo";
import type { SeedStartFrom } from "@manent/demo";
import { indexDocId, projectHome } from "@manent/sync-protocol";
import type { Driving } from "./driving.ts";
import { isFields } from "./link.ts";

/** Start-from driver over the copy project's index `source` map and `/api/versions`. */
export function createStartFromDriver(d: Driving): SeedStartFrom {
  return {
    async linkSource(userId, copy, source) {
      const indexId = indexDocId("project", copy.projectId);
      if (d.target.storage.directory.placeOf(indexId) === null) {
        await d.call(userId, {
          method: "POST",
          path: "/api/docs",
          body: {
            docId: indexId,
            kind: "index",
            home: projectHome(copy.projectId),
            workspaceId: copy.workspaceId,
          },
        });
      }
      const link = await d.link(userId);
      const doc = createDoc({ clientId: d.clientId() });
      const { state } = await link.subscribe(indexId, doc.clientId);
      try {
        doc.applyUpdate(state, ORIGIN_REMOTE);
        const made: Uint8Array[] = [];
        const stop = doc.subscribe((update) => made.push(update));
        try {
          const entry: SourceEntry =
            source.chapters === undefined
              ? {
                  docId: source.docId,
                  versionId: source.versionId,
                  copiedAt: source.copiedAt,
                }
              : {
                  docId: source.docId,
                  versionId: source.versionId,
                  copiedAt: source.copiedAt,
                  chapters: source.chapters,
                };
          writeSource(doc, copy.docId, entry);
        } finally {
          stop();
        }
        if (made.length > 0) await link.push(indexId, mergeUpdates(made));
      } finally {
        await link.unsubscribe(indexId);
        doc.destroy();
        await d.runDue();
      }
    },
    async latestVersionAt(userId, docId, at) {
      let best: { id: string; createdAt: number } | null = null;
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ docId });
        if (cursor !== null) query.set("cursor", cursor);
        const path = `/api/versions?${query}`;
        const body = await d.call(userId, { method: "GET", path });
        if (!isFields(body) || !Array.isArray(body.versions))
          throw new SeedDriverError("unavailable", `${path} is not a list`);
        for (const item of body.versions) {
          if (
            !isFields(item) ||
            typeof item.id !== "string" ||
            typeof item.createdAt !== "number"
          )
            continue;
          if (
            item.createdAt <= at &&
            (best === null || item.createdAt > best.createdAt)
          )
            best = { id: item.id, createdAt: item.createdAt };
        }
        cursor = typeof body.next === "string" ? body.next : null;
      } while (cursor !== null);
      return best?.id ?? null;
    },
  };
}
