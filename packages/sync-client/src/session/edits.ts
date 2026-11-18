// An edit made on this device: the blocks a change touched, and an edit as a tab that does not
// lead hands it on.
import type { TransactionReport } from "@manent/crdt";

/** An edit a tab that does not lead made and the store does not hold yet, as its `edit` message carries it. */
export interface UnsavedEdit {
  update: Uint8Array;
  elements: string[];
}

/** Ids of the blocks a change inserted, changed or removed. */
export function elementsOf(report: TransactionReport): string[] {
  const ids = [...report.inserted.map((i) => i.block), ...report.changed].map(
    (b) => b.attrs?.id,
  );
  return [
    ...new Set(
      [...ids, ...report.removed].filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];
}
