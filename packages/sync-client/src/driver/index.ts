// Who drives a script presented to the room, as the server sequences it.
import type { SyncClient } from "../client/client.ts";
import { ConnectError } from "../ports/ports.ts";
import type {
  DriverCurrentOutcome,
  DriverReleaseOutcome,
  DriverTakeOutcome,
  DriverTransport,
  SyncClientPorts,
} from "../ports/ports.ts";

export interface DriverHandle {
  get(): Promise<DriverCurrentOutcome>;
  take(expectedDriverUserId: string | null): Promise<DriverTakeOutcome>;
  release(): Promise<DriverReleaseOutcome>;
}

function transportOf(ports: SyncClientPorts): DriverTransport {
  const { driver } = ports.transport;
  if (driver === undefined) throw new ConnectError("unreachable");
  return driver;
}

/** Control handle for `/api/driver/*` on `docId` over `ports.transport.driver`. */
export function createDriverHandle(options: {
  docId: string;
  client: SyncClient;
  ports: SyncClientPorts;
}): DriverHandle {
  const { docId, ports } = options;
  return {
    get: () => transportOf(ports).current(docId),
    take: (expectedDriverUserId) =>
      transportOf(ports).take({ docId, expectedDriverUserId }),
    release: () => transportOf(ports).release({ docId }),
  };
}
