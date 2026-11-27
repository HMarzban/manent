// The person's sync as this page starts it: what only the page knows, given to the sync's options, apart from the entry.
import { ENGINE_VERSIONS, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import type { SyncClientOptions } from "@manent/sync-client";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { DesktopHost } from "../../desktop/host.ts";
import type { TabPerson } from "../../session.ts";
import { createPersonSync } from "./create-sync.ts";
import type { PersonSync } from "./create-sync.ts";
import { browserStores, createDeviceMemory } from "./device-memory.ts";

// the build's define; absent outside a build
declare const MANENT_VERSION: string | undefined;

/** The parts of the person's sync that differ on desktop, where the node is the window's server and store. */
async function nodeSync(
  person: TabPerson,
): Promise<Pick<SyncClientOptions, "via" | "ports">> {
  const [web, node] = await Promise.all([
    import("@manent/client-web"),
    import("../../desktop/desktop-sync.ts"),
  ]);
  const { via, store, transport } = node.desktopSyncParts({
    origin: location.origin,
    userId: person.userId,
    token: () => person.token,
  });
  // the leader, clock, random and frames stay the web's own
  const leader = web.webLeader({
    userId: person.userId,
    tabId: crypto.randomUUID(),
  });
  return {
    via,
    ports: {
      store,
      transport,
      leader,
      clock: web.browserClock,
      random: web.browserRandom,
      frames: web.browserFrames,
    },
  };
}

function readWelcomeWebBuildId(facts: unknown): string | null {
  if (typeof facts !== "object" || facts === null) return null;
  const direct: unknown = Reflect.get(facts, "webBuildId");
  if (typeof direct === "string" && direct.length > 0) return direct;
  const server: unknown = Reflect.get(facts, "server");
  if (typeof server === "object" && server !== null) {
    const nested: unknown = Reflect.get(server, "webBuildId");
    if (typeof nested === "string" && nested.length > 0) return nested;
  }
  return null;
}

/** `person`'s sync on `deviceId`, in this browser, or through the node of `desktop` when there is one. */
export async function startBrowserSync(options: {
  desktop: DesktopHost | null;
  person: TabPerson;
  deviceId: string;
  now: () => number;
  onBuildId?: (buildId: string) => void;
}): Promise<PersonSync> {
  const { desktop, person, onBuildId } = options;
  const versions = {
    protocol: PROTOCOL_VERSION,
    schema: SCHEMA_VERSION,
    engine: ENGINE_VERSIONS.at(-1)!,
    table: TABLE_VERSION,
  };
  const sync = await createPersonSync({
    person,
    baseUrl: location.origin,
    deviceId: options.deviceId,
    build: typeof MANENT_VERSION === "undefined" ? "0.0.0" : MANENT_VERSION,
    versions,
    // the server that serves this build runs the same versions
    minServer: versions,
    memory: createDeviceMemory(browserStores()),
    onlineEvents: window,
    visible: () => document.visibilityState === "visible",
    now: options.now,
    ...(desktop === null ? {} : await nodeSync(person)),
  });
  if (onBuildId === undefined) return sync;
  let lastSeen: string | null = null;
  const notify = (facts: unknown): void => {
    const webBuildId = readWelcomeWebBuildId(facts);
    if (webBuildId !== null && webBuildId !== lastSeen) {
      lastSeen = webBuildId;
      onBuildId(webBuildId);
    }
  };
  notify(sync.link.get());
  const stopBuildWatch = sync.link.subscribe(notify);
  return {
    ...sync,
    async dispose() {
      stopBuildWatch();
      await sync.dispose();
    },
  };
}
