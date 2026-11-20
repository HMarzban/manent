// A document made elsewhere, placed on the node as the cloud describes it, so a window can open it here.
import { SCHEMA_VERSION } from "@manent/schema";
import type { Storage } from "@manent/storage";
import { parseHome } from "@manent/storage";
import { ConnectError } from "@manent/sync-client";
import type { CloudApi } from "../node/ports.ts";
import type { NodeRecords } from "../records/ports.ts";

export interface Mirror {
  ensure(
    userId: string,
    docId: string,
  ): Promise<
    { ok: true } | { ok: false; code: "unreachable" | "forbidden" | "deleted" }
  >;
}

type MirrorRefusal = Extract<
  Awaited<ReturnType<Mirror["ensure"]>>,
  { ok: false }
>["code"];

const REFUSALS: Readonly<
  Record<
    "unauthenticated" | "forbidden" | "deleted" | "bad_request",
    MirrorRefusal
  >
> = Object.freeze({
  // a session the cloud no longer takes: the person reaches it again once signed in
  unauthenticated: "unreachable",
  forbidden: "forbidden",
  deleted: "deleted",
  bad_request: "forbidden",
});

/**
 * Describes the document at the cloud as that person, then records it as synced at the described
 * generation before anything else is written, places it with the cloud's kind and home, and gives
 * the person the cloud's role. A person with no cloud session cannot reach the cloud.
 */
export function createMirror(options: {
  storage: Storage;
  records: NodeRecords;
  cloud: CloudApi;
  tokenOf: (userId: string) => string | null;
}): Mirror {
  const { storage, records, cloud } = options;
  return {
    async ensure(userId, docId) {
      const token = options.tokenOf(userId);
      if (token === null) return { ok: false, code: "unreachable" };
      let described;
      try {
        described = await cloud.describe(token, { docId });
      } catch (error) {
        if (!(error instanceof ConnectError)) throw error;
        return { ok: false, code: "unreachable" };
      }
      if (!described.ok) return { ok: false, code: REFUSALS[described.code] };
      const { kind, home, generation, role, capabilities } = described.body;
      const placed = parseHome(home);
      if (placed === null) return { ok: false, code: "forbidden" };
      if (records.docState(docId) === null)
        records.setDocState(docId, userId, "synced", generation);
      storage.directory.place(docId, placed, kind, userId);
      storage.open(placed).log.create({
        id: docId,
        kind,
        ownerUserId: kind === "private" ? userId : null,
        schemaVersion: SCHEMA_VERSION,
        engineVersion: null,
      });
      storage.directory.setRole(docId, userId, role, capabilities);
      return { ok: true };
    },
  };
}
