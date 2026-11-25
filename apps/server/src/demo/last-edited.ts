// Who last edited a script, written in its workspace's index as the app writes a person's own changes.
import { jsonMap } from "@manent/crdt";
import { DEMO_WORKSPACES } from "@manent/demo";
import { indexDocId } from "@manent/sync-protocol";
import { setEdited } from "../seed/driver.ts";
import type { Edit, LiveTarget } from "../seed/driver.ts";

/**
 * Writes `edit` of `docId` in the first demo workspace index that lists the document, as the authority; an index
 * this server has not placed is passed over, and an entry holding a later edit is left as it is.
 */
export async function markEdited(
  live: LiveTarget,
  docId: string,
  edit: Edit,
): Promise<void> {
  for (const { id } of DEMO_WORKSPACES) {
    const indexId = indexDocId("workspace", id);
    if (live.storage.directory.placeOf(indexId) === null) continue;
    let listed = false;
    await live.sync.authorityWrite(indexId, {
      userId: edit.userId,
      origin: "system",
      edit(doc) {
        const documents = jsonMap(doc, "documents");
        listed = documents.get(docId) !== null;
        return setEdited(documents, docId, edit)
          ? { ok: true }
          : { ok: false, reason: "not listed, or a later edit is" };
      },
      inTransaction() {
        // an index keeps no rows beside its update
      },
    });
    // a write that did not commit leaves Last edited as it was, until the next edit is written
    if (listed) return;
  }
}
