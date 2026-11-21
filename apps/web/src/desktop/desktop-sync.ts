// The window's sync in the desktop app: the node is its server and its store, and the demo's Connection acts on the node.
import { webTransport } from "@manent/client-web";
import { createMemoryStore } from "@manent/sync-client";
import type {
  LocalStore,
  SyncClientOptions,
  Transport,
} from "@manent/sync-client";
import { SLOW_DELAY_MS } from "../demo/connection-transport.ts";
import type { ConnectionControl } from "../demo/connection-transport.ts";
import type { DesktopHost } from "./host.ts";

/**
 * The parts of the window's sync client that differ on desktop: it talks to the node at the page's own origin and keeps
 * nothing itself, because the node is where the person's work is kept. The leader, clock, random and frames stay the web's own.
 */
export function desktopSyncParts(options: {
  origin: string;
  userId: string;
  token: () => string | null;
}): Pick<SyncClientOptions, "via"> & {
  store: LocalStore;
  transport: Transport;
} {
  return {
    via: "local_node",
    store: createMemoryStore(options.userId),
    transport: webTransport({
      baseUrl: options.origin,
      session: options.token,
    }),
  };
}

/** `control`, each choice also sent to the node, which cuts or slows its own link to the cloud: the window's link to the node stays as it is. */
export function connectionAtNode(
  control: ConnectionControl,
  host: Pick<DesktopHost, "setConnection">,
): ConnectionControl {
  return {
    mode: control.mode,
    set(mode) {
      control.set(mode);
      host
        .setConnection(mode, mode === "slow" ? SLOW_DELAY_MS : 0)
        .catch(() => {
          // a node that does not answer has no link to the cloud to cut or slow
        });
    },
  };
}
