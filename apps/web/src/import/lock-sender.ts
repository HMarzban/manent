// The import lock a script waits for: sent while the script is open, once it has synced, until the authority answers.
import { IMPORT_MAP, IMPORT_RECORD_KEY, jsonMap } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { ImportRecord, ImportedProduction } from "@manent/formats";
import type { ProductionClient } from "@manent/sync-client";
import type { ImportLockRequest } from "@manent/sync-protocol";

/** Between tries of a waiting import lock while the script is open. */
export const IMPORT_RETRY_MS = 30_000;

type Request = Omit<ImportLockRequest, "docId" | "key">;

/** The record's production as the authority is asked to lock it, on `lockedOn`. */
function requestOf(production: ImportedProduction, lockedOn: string): Request {
  return {
    lockedOn,
    numbering: production.numbering,
    anchors: production.anchors.map((anchor) => ({ ...anchor })),
    sceneNumbers: production.sceneNumbers.map((scene) => ({ ...scene })),
    sets: production.sets.map((set) => ({
      sourceName: set.sourceName,
      colour: set.colour,
      mark: set.mark,
      fullDraft: set.fullDraft,
      blocks: set.blocks.map((block) => ({
        blockId: block.blockId,
        inserted: block.inserted.map(([start, end]) => [start, end]),
        deletedAt: [...block.deletedAt],
      })),
    })),
  };
}

/**
 * While a script is open, sends its waiting import lock (importLock waits for the sync), tries again every
 * IMPORT_RETRY_MS after "offline" or "busy", and stops once answered, writing the record's lockKey null; a lock
 * already made counts as answered. Any other refusal stops this watch with the key kept, so a person the
 * authority lets lock still sends it. The returned function stops it.
 */
export function watchImportLock(options: {
  client: ProductionClient;
  doc: CrdtDoc;
  today: () => string;
  timers: { every(ms: number, run: () => void): () => void };
}): () => void {
  const imported = jsonMap(options.doc, IMPORT_MAP);
  let sending = false;
  let stopped = false;
  /** The record waiting to lock; null when there is none, or nothing waits. */
  const waiting = async (): Promise<ImportRecord | null> => {
    // most scripts were never imported: formats is loaded only for one that was
    if (imported.get(IMPORT_RECORD_KEY) === null) return null;
    const { parseImportRecord } = await import("@manent/formats");
    const record = parseImportRecord(imported.get(IMPORT_RECORD_KEY));
    return record?.lockKey === null ? null : record;
  };
  /** True when the watch is done: the lock answered, or refused in a way a retry cannot change. */
  const ask = async (): Promise<boolean> => {
    const record = await waiting();
    const key = record?.lockKey ?? null;
    if (record === null || key === null || record.production === null)
      return false;
    const request = requestOf(record.production, options.today());
    const outcome = await options.client.importLock({ key, ...request });
    if (stopped) return false;
    if (outcome.ok || outcome.code === "already_locked") {
      // the record as it is now, so a write made meanwhile is kept
      const current = (await waiting()) ?? record;
      imported.set(IMPORT_RECORD_KEY, { ...current, lockKey: null });
      return true;
    }
    return outcome.code !== "offline" && outcome.code !== "busy";
  };
  const stopTimer = options.timers.every(IMPORT_RETRY_MS, () => void send());
  const stop = (): void => {
    stopped = true;
    stopTimer();
  };
  async function send(): Promise<void> {
    if (sending || stopped) return;
    sending = true;
    try {
      if (await ask()) stop();
    } finally {
      sending = false;
    }
  }
  void send();
  return stop;
}
