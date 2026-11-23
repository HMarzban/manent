// Who drives a script presented to the room, as the server sequences it.
import type { SyncClient } from "../client/client.ts";
import type { SyncClientPorts } from "../ports/ports.ts";

export interface DriverHandle {}

/** A handle that holds nothing. */
export function createDriverHandle(_options: {
  docId: string;
  client: SyncClient;
  ports: SyncClientPorts;
}): DriverHandle {
  return {};
}
