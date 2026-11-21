// What this device keeps of a document's production state between sessions.
import type { ProductionState, VersionContent } from "@manent/sync-protocol";

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
