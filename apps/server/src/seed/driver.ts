// The seed driver: people replaying edits through the server's real socket seam and HTTP routes.
import type {
  Clock,
  ManentServer,
  SessionStore,
  SyncService,
} from "@manent/server-core";
import type { Storage } from "@manent/storage";

/** The running server, for the Tour's preparations and the simulated writers. */
export interface LiveTarget {
  server: ManentServer;
  sessions: SessionStore;
  storage: Storage;
  sync: SyncService;
  clock: Clock;
}
