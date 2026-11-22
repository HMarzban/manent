// What this device keeps of a document's production state between sessions.
import type { ProductionState, VersionContent } from "@manent/sync-protocol";
import { isFields } from "../upstream/events.ts";

export interface CachedProduction {
  state: ProductionState;
  /** The active revision's baseline version; null until it is fetched. */
  baseline: { versionId: string; content: VersionContent } | null;
}

export interface ProductionCache {
  /** Null when nothing is kept for `docId`. */
  read(docId: string): Promise<CachedProduction | null>;
  write(docId: string, value: CachedProduction): Promise<void>;
  clear(docId: string): Promise<void>;
}

/** Checks the version and each top-level field's kind, and nothing deeper, as `isProductionState` does. */
export function isVersionContent(value: unknown): value is VersionContent {
  if (!isFields(value)) return false;
  const { engineVersion, locks } = value;
  return (
    value.v === 1 &&
    Array.isArray(value.blocks) &&
    isFields(value.settings) &&
    typeof value.schemaVersion === "number" &&
    (engineVersion === null || typeof engineVersion === "number") &&
    (locks === null || Array.isArray(locks)) &&
    isFields(value.authors)
  );
}
