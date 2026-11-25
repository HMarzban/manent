// A draft named: the document at its head, or a listed version's content, kept again under a name.
import type { DocFile, VersionRow } from "@manent/storage";
import { isReplayKey } from "@manent/sync-protocol";
import type { HttpErrorCode } from "@manent/sync-protocol";
import type { Clock } from "../sync/ports.ts";
import { openVersion } from "./content.ts";
import type { LocksAt } from "./content.ts";
import type { DraftEvents } from "./draft-events.ts";
import { failed } from "./requests.ts";
import type { HistoryRequests } from "./requests.ts";
import type { HistoryService } from "./service.ts";
import type { Recorded, Recorder } from "./summaries.ts";

/** The longest draft name, in characters, once trimmed. */
const NAME_MAX_CHARS = 120;

export function createNamedVersions(options: {
  clock: Clock;
  ids(): string;
  recorder: Recorder;
  locksAt: LocksAt;
  requested: HistoryRequests["requested"];
  draftEvents?: DraftEvents;
  /** The placed document's file, if `userId` may edit it. */
  authorize(
    userId: string,
    docId: string,
    need: "edit",
  ): { ok: true; file: DocFile } | { ok: false; code: HttpErrorCode };
}): Pick<HistoryService, "name"> {
  const { clock, ids, recorder, locksAt } = options;

  /** A listed version's content kept again under a name, at its position. */
  function nameListed(
    file: DocFile,
    source: VersionRow | null,
    made: { docId: string; userId: string; name: string; key: string },
  ): Recorded {
    const base =
      source?.docId === made.docId ? openVersion(file, source, locksAt) : null;
    if (source === null || base === null) return failed("not_found");
    const version: VersionRow = {
      ...source,
      id: ids(),
      kind: "named",
      name: made.name,
      createdByUserId: made.userId,
      createdAt: clock.now(),
      deviceId: null,
    };
    const how = { carry: false, snapshot: true, key: made.key };
    return recorder.recordAlone(file, version, base, how);
  }

  return {
    async name(userId, body) {
      const { docId, key, fromVersionId } = body;
      const access = options.authorize(userId, docId, "edit");
      if (!access.ok) return access;
      const name = body.name.trim();
      if (!isReplayKey(key) || name === "" || [...name].length > NAME_MAX_CHARS)
        return failed("bad_request");
      const { file } = access;
      const request = { docId, key, tells: "draft_named" } as const;
      const made = {
        docId,
        kind: "named",
        name,
        createdByUserId: userId,
      } as const;
      const how = { carry: true, snapshot: true, key, onlyWhenNew: false };
      return options.requested(file, userId, request, async () => {
        const recorded =
          fromVersionId === null
            ? await recorder.atHead(file, made, how)
            : nameListed(file, file.history.get(fromVersionId), {
                docId,
                userId,
                name,
                key,
              });
        if (recorded.ok && recorded.item !== null)
          options.draftEvents?.named(docId, recorded.item.id, userId);
        return recorded;
      });
    },
  };
}
