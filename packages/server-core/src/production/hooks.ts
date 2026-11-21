// What the sync service asks the production service: the lock table and active revision a subscriber is
// told, and the rule that only the authority writes a scene number once the script is in production.
import type { BlockJSON, Issue } from "@manent/schema";
import type { DocFile, Storage } from "@manent/storage";
import type { ProductionHooks } from "./ports.ts";
import { isLocked, recordsOf } from "./state.ts";

export interface ProductionHookSet {
  readonly hooks: ProductionHooks;
  /** After each of the service's own commits: the document's issued numbers are read again on its next push. */
  committed(docId: string): void;
}

const numOf = (block: BlockJSON): string | null => {
  const num = block.attrs?.num;
  return typeof num === "string" ? num : null;
};

export function createProductionHooks(options: {
  storage: Storage;
}): ProductionHookSet {
  const { storage } = options;
  /** By document in production: each block's issued scene number, loaded on its first push. */
  const issued = new Map<string, ReadonlyMap<string, string>>();

  function issuedOf(file: DocFile, docId: string): ReadonlyMap<string, string> {
    const held = issued.get(docId);
    if (held !== undefined) return held;
    const numbers = new Map(
      file.production.sceneNumbers(docId).map((n) => [n.blockId, n.num]),
    );
    issued.set(docId, numbers);
    return numbers;
  }

  return {
    hooks: {
      subscribed(docId) {
        const place = storage.directory.placeOf(docId);
        if (place === null) return null;
        const file = storage.open(place.home);
        if (file.production.get(docId) === null) return null;
        if (!isLocked(file, docId))
          return { lockLevel: 0, lockAnchors: null, revision: null };
        const lockAnchors = recordsOf(file.production.anchors(docId));
        const active = file.production.sets(docId).at(-1);
        return {
          lockLevel: lockAnchors.reduce((l, a) => Math.max(l, a.level), 0),
          lockAnchors,
          revision:
            active === undefined
              ? null
              : {
                  setId: active.id,
                  baselineVersionId: active.baselineVersionId,
                },
        };
      },
      checkPush(room, report) {
        if (room.row.locked === 0) return [];
        const numbers = issuedOf(room.file, room.docId);
        const touched = [
          ...report.inserted.map((entry) => entry.block),
          ...report.changed,
        ];
        return touched.flatMap((block): Issue[] => {
          const id = block.attrs?.id;
          if (typeof id !== "string") return [];
          if (numOf(block) === (numbers.get(id) ?? null)) return [];
          return [
            {
              path: `blocks.${id}.num`,
              code: "num_locked",
              severity: "reject",
              message: "scene number written by a client",
            },
          ];
        });
      },
    },
    committed: (docId) => void issued.delete(docId),
  };
}
