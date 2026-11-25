// A person's private copy of a script, written apart from the room until it is handed in.
import type { SyncClient } from "../client/client.ts";
import type { SyncClientPorts } from "../ports/ports.ts";

export interface PrivateCopyHandle {}

/** A handle that holds nothing. */
export function createPrivateCopyHandle(_options: {
  docId: string;
  client: SyncClient;
  ports: SyncClientPorts;
}): PrivateCopyHandle {
  return {};
}
