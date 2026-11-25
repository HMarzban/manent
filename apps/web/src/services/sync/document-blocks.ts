// The blocks of a document this device holds, read locally without fetching remote scripts.
import { scriptBody } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { SyncClient } from "@manent/sync-client";

/**
 * The blocks of `docId` as this device holds them; null when this device does not hold the document,
 * it has never synced with nothing waiting, or access was removed.
 */
export async function documentBlocks(
  client: Promise<SyncClient>,
  docId: string,
): Promise<readonly BlockJSON[] | null> {
  const sync = await client;
  const held = (await sync.documents()).some((doc) => doc.docId === docId);
  if (!held) return null;
  const handle = await sync.open(docId);
  try {
    const status = handle.status.get();
    if (
      status.side.includes("access_removed") ||
      status.side.includes("deleted")
    )
      return null;
    if (status.neverSynced && status.waiting === 0) return null;
    const view = handle.readOnly.get();
    if (view !== null)
      return view.status.get().live ? [...view.blocks.get()] : null;
    return (scriptBody(handle.doc()).materialize().content ?? []).flatMap(
      (section) => section.content ?? [],
    );
  } finally {
    await handle.close();
  }
}
