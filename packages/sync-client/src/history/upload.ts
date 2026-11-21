// What a device version is sent as, once the device is online and synced.
import type { UploadRequest } from "@manent/sync-protocol";
import type { DeviceVersion } from "../ports/ports.ts";

const KIND_OF_LABEL: Readonly<
  Record<DeviceVersion["label"], UploadRequest["version"]["kind"]>
> = Object.freeze({
  session_end: "device",
  hourly: "device",
  manual: "saved",
  named: "named",
  before_restore: "pre_restore",
  before_reconnect: "pre_merge",
  rejected: "recovered",
  past_window: "recovered",
});

/** The upload of a device version: its kind follows from its label, and its content goes as it is kept, canonical. */
export function uploadRequestOf(
  version: DeviceVersion,
  deviceId: string,
  schemaVersion: number,
): UploadRequest {
  return {
    docId: version.docId,
    version: {
      id: version.id,
      kind: KIND_OF_LABEL[version.label],
      name: version.name,
      deviceId,
      content: version.content,
      schemaVersion,
    },
  };
}
