// Device versions: the document as this device holds it, kept in its store, and offered for upload.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DeviceVersion, LocalStore } from "../ports/ports.ts";

/** The document's content now, in the canonical form, as a version not yet uploaded. */
export function deviceVersion(
  doc: CrdtDoc,
  version: Pick<DeviceVersion, "id" | "docId" | "kind" | "label" | "createdAt">,
): DeviceVersion {
  return {
    ...version,
    content: scriptBody(doc).materialize(),
    uploaded: false,
  };
}

/** Offers every version of the document not yet uploaded, one after the other; `true` marks it uploaded. */
export async function offerVersions(
  store: LocalStore,
  docId: string,
  upload: (version: DeviceVersion) => Promise<boolean>,
): Promise<void> {
  for (const version of await store.versions(docId))
    if (!version.uploaded && (await upload(version)))
      await store.markUploaded(version.id);
}
