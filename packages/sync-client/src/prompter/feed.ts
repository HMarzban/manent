// One rundown's prompter feed: subscription state, snapshots and patches, and 3 s feed-loss detection.
import type { BlockJSON } from "@manent/schema";
import { CODE } from "@manent/sync-protocol";
import type {
  DocumentMessage,
  Message,
  PrompterRow,
  VersionSet,
} from "@manent/sync-protocol";
import type { SyncClient } from "../client/client.ts";
import { HANDSHAKE_TIMEOUT_MS } from "../ports/defaults.ts";
import type { Subscribable, SyncClientPorts } from "../ports/ports.ts";
import { createCell } from "./cell.ts";
import {
  applyPrompterPatch,
  readPrompterFeed,
  readPrompterPatch,
  storiesFromFeed,
} from "./payload.ts";
import { createPrompterSocket } from "./socket.ts";
import type { PrompterSocket } from "./socket.ts";

/** The server heartbeats every 1 s; 3 s without a feed frame reads lost. */
const FEED_LOSS_MS = 3_000;
const RETRY_ERROR_MS = 1_000;

/** `lastReceivedAt`: when the last frame came, null before the first. */
export interface PrompterStatus {
  feed: "waiting" | "live" | "lost" | "refused";
  lastReceivedAt: number | null;
}

export interface PrompterHandle {
  readonly runOrder: Subscribable<readonly PrompterRow[]>;
  /** By story id, the blocks last sent of each story. */
  readonly stories: Subscribable<ReadonlyMap<string, readonly BlockJSON[]>>;
  readonly status: Subscribable<PrompterStatus>;
  close(): void;
}

interface PrompterOptions {
  rundownId: string;
  client: SyncClient;
  ports: SyncClientPorts;
  versions?: VersionSet;
}

type FeedTimer = "handshake" | "loss";

class PrompterFeedClient {
  readonly handle: PrompterHandle;
  private readonly runOrder = createCell<readonly PrompterRow[]>([]);
  private readonly stories = createCell<
    ReadonlyMap<string, readonly BlockJSON[]>
  >(new Map());
  private readonly status = createCell<PrompterStatus>({
    feed: "waiting",
    lastReceivedAt: null,
  });
  private readonly timers = new Map<FeedTimer, () => void>();
  private readonly socket: PrompterSocket;
  private generation = 0;
  private hasSnapshot = false;
  private subscribed = false;
  private refused = false;
  private closed = false;
  private readonly options: PrompterOptions;

  constructor(options: PrompterOptions) {
    this.options = options;
    this.handle = {
      runOrder: this.runOrder.view,
      stories: this.stories.view,
      status: this.status.view,
      close: () => this.close(),
    };
    this.socket = createPrompterSocket({
      ports: options.ports,
      host: {
        versions: () =>
          options.versions ?? options.client.link.get().server?.current ?? null,
        welcomed: () => this.subscribe(),
        message: (message) => this.route(message),
        dropped: () => this.dropped(),
        refused: () => this.markRefused(),
        ponged: () => {
          if (this.status.get().feed === "lost" && this.hasSnapshot)
            this.armLoss();
        },
      },
    });
  }

  private route(message: Message): void {
    if (this.closed || this.refused) return;
    if ("docId" in message) {
      if (message.docId === this.options.rundownId) this.routeDocument(message);
      return;
    }
    if (
      message.type === "ERROR" &&
      (message.doc === null || message.doc.docId === this.options.rundownId)
    )
      this.handleError(message);
  }

  private routeDocument(message: DocumentMessage): void {
    switch (message.type) {
      case "SUBSCRIBED":
        this.arm("handshake", HANDSHAKE_TIMEOUT_MS, () => this.subscribe());
        return;
      case "VIEW_SNAPSHOT":
        this.handleSnapshot(message.content);
        return;
      case "VIEW_PATCH":
        if (this.hasSnapshot) this.handlePatch(message.patch);
        return;
      case "GENERATION_MOVED":
        this.generation = message.newGeneration;
        this.subscribe();
        return;
      case "SUBSCRIBE":
      case "UNSUBSCRIBE":
      case "SYNC":
      case "PUSH":
      case "SET":
      case "ACK":
      case "AWARENESS":
      case "CONTROL":
        return;
      default:
        message satisfies never;
    }
  }

  private handleSnapshot(content: Uint8Array): void {
    const feed = readPrompterFeed(content);
    if (feed === null) {
      this.subscribe();
      return;
    }
    this.disarm("handshake");
    this.socket.cancelProbe();
    this.hasSnapshot = true;
    const now = this.options.ports.clock.now();
    this.armLoss();
    this.publish(feed.runOrder, storiesFromFeed(feed), {
      feed: "live",
      lastReceivedAt: now,
    });
  }

  private handlePatch(bytes: Uint8Array): void {
    const patch = readPrompterPatch(bytes);
    if (patch === null) {
      this.subscribe();
      return;
    }
    this.socket.cancelProbe();
    const nextRunOrder = patch.runOrder ?? this.runOrder.get();
    const nextStories = applyPrompterPatch(this.stories.get(), patch);
    const now = this.options.ports.clock.now();
    this.armLoss();
    this.publish(nextRunOrder, nextStories, {
      feed: "live",
      lastReceivedAt: now,
    });
  }

  private handleError(message: Extract<Message, { type: "ERROR" }>): void {
    if (
      message.code === CODE.FORBIDDEN ||
      message.code === CODE.DOCUMENT_DELETED ||
      message.permanent
    ) {
      this.refuse();
      return;
    }
    if (message.code === CODE.GENERATION_MISMATCH) this.generation = 0;
    this.hasSnapshot = false;
    this.disarm("loss");
    this.socket.cancelProbe();
    if (this.status.get().feed === "live") this.setFeed("lost");
    this.arm("handshake", message.retryAfterMs ?? RETRY_ERROR_MS, () =>
      this.subscribe(),
    );
  }

  private subscribe(): void {
    if (this.closed || this.refused) return;
    this.hasSnapshot = false;
    this.subscribed = true;
    this.socket.send({
      type: "SUBSCRIBE",
      docId: this.options.rundownId,
      generation: this.generation,
      mode: "prompter",
      clientIds: [],
      lastServerSeq: 0,
    });
    this.arm("handshake", HANDSHAKE_TIMEOUT_MS, () => this.subscribe());
  }

  private dropped(): void {
    if (this.closed || this.refused) return;
    this.hasSnapshot = false;
    this.subscribed = false;
    this.disarmAll();
    this.setFeed("lost");
  }

  private markRefused(): void {
    this.refused = true;
    this.hasSnapshot = false;
    this.subscribed = false;
    this.disarmAll();
    this.setFeed("refused");
  }

  private refuse(): void {
    this.markRefused();
    this.socket.close();
  }

  private armLoss(): void {
    this.arm("loss", FEED_LOSS_MS, () => {
      this.setFeed("lost");
      this.socket.probe();
    });
  }

  private publish(
    runOrder: readonly PrompterRow[],
    stories: ReadonlyMap<string, readonly BlockJSON[]>,
    status: PrompterStatus,
  ): void {
    const notifyRunOrder = this.runOrder.stage(runOrder);
    const notifyStories = this.stories.stage(stories);
    const notifyStatus = this.status.stage(status);
    notifyRunOrder?.();
    notifyStories?.();
    notifyStatus?.();
  }

  private setFeed(feed: PrompterStatus["feed"]): void {
    const notify = this.status.stage({
      feed,
      lastReceivedAt: this.status.get().lastReceivedAt,
    });
    notify?.();
  }

  private arm(timer: FeedTimer, delayMs: number, fn: () => void): void {
    this.disarm(timer);
    this.timers.set(
      timer,
      this.options.ports.clock.schedule(() => {
        this.timers.delete(timer);
        fn();
      }, delayMs),
    );
  }

  private disarm(timer: FeedTimer): void {
    this.timers.get(timer)?.();
    this.timers.delete(timer);
  }

  private disarmAll(): void {
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    const wasSubscribed = this.subscribed;
    this.hasSnapshot = false;
    this.subscribed = false;
    this.disarmAll();
    this.socket.close((send) => {
      if (wasSubscribed)
        send({
          type: "UNSUBSCRIBE",
          docId: this.options.rundownId,
          generation: this.generation,
        });
    });
  }
}

/** Opens an independent prompter feed subscription for `rundownId` over the client's transport and clock. */
export function createPrompterHandle(options: {
  rundownId: string;
  client: SyncClient;
  ports: SyncClientPorts;
  versions?: VersionSet;
}): PrompterHandle {
  return new PrompterFeedClient(options).handle;
}
