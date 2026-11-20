// When a document has grown over budget: the triggers a measure is judged by.
import type { GenerationRow, MeasureRow } from "@manent/storage";
import type { SyncLimits } from "../sync/ports.ts";

export type RebuildReason = "client_ids" | "bytes" | "section";

/**
 * The first trigger that holds, in this order: client_ids, bytes (only at rebuildMinBytes or more, and above twice the
 * previous rebuild's nextInitialBytes when there was one), section. null when none holds or there is no measure.
 */
export function rebuildReason(
  measure: MeasureRow | null,
  limits: SyncLimits,
  previous: GenerationRow | null,
): RebuildReason | null {
  if (measure === null) return null;
  const { liveBytes, plainBytes, clientIds, largestSection } = measure;
  if (clientIds > limits.rebuildClientIds) return "client_ids";
  // a document just rebuilt is already as small as its content allows
  const grown = previous === null || liveBytes > 2 * previous.nextInitialBytes;
  if (
    liveBytes > limits.rebuildBytesRatio * plainBytes &&
    liveBytes >= limits.rebuildMinBytes &&
    grown
  )
    return "bytes";
  if (largestSection > limits.rebuildSectionBlocks) return "section";
  return null;
}
