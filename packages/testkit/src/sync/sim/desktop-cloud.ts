// The desktop world's cloud: the simulated server whose process serves a whole server, so the node
// reaches its HTTP routes as well as its sockets, and which refuses the node's next push on demand.
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import type { CloudApi } from "@manent/local-node";
import { createFakeCloud } from "@manent/local-node/testing";
import {
  PRODUCT_SETTING_RULES,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "@manent/server-core";
import type { SyncService, SyncSettings } from "@manent/server-core";
import type { MemoryStorage } from "@manent/storage/testing";
import type { FakeClock, MemoryNetwork } from "@manent/sync-client/testing";
import { CODE } from "@manent/sync-protocol";
import { VERSIONS } from "./desktop-node.ts";
import { DOC } from "./device.ts";
import { createSimServer } from "./network.ts";
import type { SimServer } from "./network.ts";

const CLOUD_URL = "http://127.0.0.1";

export class SimCloud {
  readonly server: SimServer;
  /** Pushes the cloud refused because it was asked to. */
  refusalsCaused = 0;
  private refuseNext = false;
  private http: CloudApi | null = null;

  constructor(
    readonly storage: MemoryStorage,
    readonly network: MemoryNetwork,
    parts: { clock: FakeClock; random: () => number },
  ) {
    this.server = createSimServer({
      network,
      storage,
      clock: parts.clock,
      versions: VERSIONS,
      random: parts.random,
      service: (settings) => this.serve(settings),
    });
    this.server.start();
  }

  /** The cloud's HTTP, as the node calls it. */
  api(): CloudApi {
    if (this.http === null) throw new TypeError("the cloud has not started");
    return this.http;
  }

  /** The next push of the script from the node is refused for good. */
  refuseNextPush(): void {
    this.refuseNext = true;
  }

  holdsScript(): boolean {
    return this.storage.directory.placeOf(DOC) !== null;
  }

  /** Serves one replay or delivers one frame, the order picked by `random`; false when none waits. */
  step(random: () => number): boolean {
    const { server, network } = this;
    const waiting = server.replaysQueued() > 0;
    const replay = waiting && (network.queued() === 0 || random() < 0.5);
    return replay ? server.stepReplay() : network.step();
  }

  queued(): number {
    return this.network.queued() + this.server.replaysQueued();
  }

  private serve(settings: SyncSettings): SyncService {
    const { now } = settings.clock;
    const secret = new Uint8Array(32).fill(7);
    const server = createServer({
      http: { allowedHosts: ["127.0.0.1"], openUrl: CLOUD_URL, webDir: null },
      auth: {
        signIn: createDemoSignIn(),
        directory: createDemoDirectory(),
        sessions: createSignedSessionStore({ secret, now }),
      },
      demo: { seedId: () => "seed-1", control: null, controls: null },
      socket: {
        tickets: createTicketStore({ now }),
        versions: VERSIONS,
        allowedOrigins: [CLOUD_URL],
      },
      sync: { ...settings, registry: PRODUCT_SETTING_RULES },
    });
    const { sync } = server;
    if (sync === null) throw new TypeError("the cloud serves no documents");
    this.http = createFakeCloud({ server });
    return {
      ...sync,
      receive: (peer, message) => {
        const fromNode = peer.deviceId.startsWith("node-");
        if (!this.refuseNext || message.type !== "PUSH" || !fromNode)
          return sync.receive(peer, message);
        this.refuseNext = false;
        this.refusalsCaused += 1;
        const { docId, generation, clientSeq } = message;
        peer.send({
          type: "ERROR",
          code: CODE.VALIDATION_FAILED,
          message: "invalid",
          retryAfterMs: null,
          permanent: true,
          doc: { docId, generation },
          clientSeq,
        });
      },
    };
  }
}
