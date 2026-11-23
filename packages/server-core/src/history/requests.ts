// History requests: run one at a time per document, and a keyed one answered once.
import type { DocFile } from "@manent/storage";
import type {
  HistoryControl,
  HttpErrorCode,
  VersionItem,
  VersionResponse,
} from "@manent/sync-protocol";
import type { HistoryOutcome } from "./service.ts";
import { readStoredResponse } from "./summaries.ts";
import type { Recorded } from "./summaries.ts";

/** What the room is told of a version made. */
export const controlOf = (
  kind: HistoryControl["kind"],
  item: VersionItem,
): HistoryControl => ({
  kind,
  versionId: item.id,
  userId: item.createdByUserId,
  at: item.createdAt,
  name: item.name,
  versionAt: item.createdAt,
  scene: null,
  beforeVersionId: null,
});

export const failed = (code: HttpErrorCode) => ({ ok: false, code }) as const;

export interface HistoryRequests {
  /** Runs `run` after the document's earlier requests; at once when none is waiting. */
  inChain<T>(docId: string, run: () => Promise<T>): Promise<T>;
  /** A request answered once: its stored answer, else what `make` makes, told to the room. */
  requested(
    file: DocFile,
    userId: string,
    request: { docId: string; key: string; tells: HistoryControl["kind"] },
    make: () => Promise<Recorded> | Recorded,
  ): Promise<HistoryOutcome<VersionResponse>>;
}

export function createHistoryRequests(options: {
  /** A version made: told to the room. */
  announce(docId: string, control: HistoryControl): void;
}): HistoryRequests {
  /** By document: the tail of its requests, which run one at a time. */
  const chains = new Map<string, Promise<void>>();

  function inChain<T>(docId: string, run: () => Promise<T>): Promise<T> {
    const before = chains.get(docId);
    const next = before === undefined ? run() : before.then(run);
    const tail = next.then(
      () => {},
      () => {},
    );
    chains.set(docId, tail);
    void tail.then(() => {
      if (chains.get(docId) === tail) chains.delete(docId);
    });
    return next;
  }

  return {
    inChain,
    requested(file, userId, request, make) {
      const { docId, key } = request;
      return inChain(docId, async () => {
        const stored = file.history.request(docId, key);
        if (stored !== null) {
          const answer =
            stored.userId === userId ? readStoredResponse(stored.result) : null;
          return answer === null
            ? failed("bad_request")
            : { ok: true, value: answer };
        }
        const made = await make();
        if (!made.ok) return made;
        if (made.item === null)
          throw new RangeError("a requested version is always made");
        options.announce(docId, controlOf(request.tells, made.item));
        return { ok: true, value: { version: made.item } };
      });
    },
  };
}
