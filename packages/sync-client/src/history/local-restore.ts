// A restore made on the device, for when the request cannot reach the server: the script as it is
// kept first as a device version, then the version's blocks written as this device's own changes.
import { ORIGIN_RESTORE, applyBlockOps } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { planRestore } from "@manent/revisions";
import type { RestoreScope } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import type { Random } from "../ports/ports.ts";

/** The document a restore on the device writes, and how it keeps what that document held before. */
export interface LocalRestoreHost {
  readonly doc: CrdtDoc;
  /** Keeps the document as it is now as a device version; `stored` settles once it is written. */
  recordVersion(
    kind: "device",
    label: "before_restore",
  ): { id: string; content: DocJSON; stored: Promise<void> };
}

/**
 * Plans against the content kept as Before restore and writes the plan at
 * once, under ORIGIN_RESTORE, which no undo scope tracks; resolves once that
 * version is stored. A block copied into a restored scene from outside it
 * gets an ID from `random`.
 */
export async function restoreLocally(
  host: LocalRestoreHost,
  target: DocJSON,
  scope: RestoreScope,
  random: Random,
): Promise<{ beforeVersionId: string; applied: number }> {
  const before = host.recordVersion("device", "before_restore");
  const plan = planRestore(before.content, target, scope, {
    newId: () => random.bytes(16).toHex(),
  });
  applyBlockOps(host.doc, plan.ops, ORIGIN_RESTORE);
  await before.stored;
  return { beforeVersionId: before.id, applied: plan.applied };
}
