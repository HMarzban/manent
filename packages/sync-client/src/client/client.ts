// The client: one link to the server for every open document, and the lead among one user's tabs.
import { docIdV7 } from "@manent/sync-protocol";
import type {
  DocumentMessage,
  Message,
  ServerVersions,
  VersionSet,
} from "@manent/sync-protocol";
import { createDriverHandle } from "../driver/index.ts";
import type { DriverHandle } from "../driver/index.ts";
import type { LinkIssue } from "../link/machine.ts";
import { waitingCount } from "../outbox/plan.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import type {
  DeviceVersion,
  DocMeta,
  DocSummary,
  LinkState,
  Subscribable,
  SyncClientPorts,
} from "../ports/ports.ts";
import { createPrivateCopyHandle } from "../private-copy/index.ts";
import type { PrivateCopyHandle } from "../private-copy/index.ts";
import { createPrompterHandle } from "../prompter/index.ts";
import type { PrompterHandle } from "../prompter/index.ts";
import type { DocHandle } from "../session/doc-handle.ts";
import type { Via } from "../upstream/window.ts";
import { createViewer } from "../view/view.ts";
import type { ViewHandle, Viewer } from "../view/view.ts";
import { createLinkDriver } from "./link-driver.ts";
import type { LinkDriver, LinkDriverHost } from "./link-driver.ts";
import { createReplicas } from "./replicas.ts";
import type { Replicas } from "./replicas.ts";

/** `server`: the versions the last WELCOME named, kept while offline; null before any. */
export interface LinkFacts {
  state: LinkState;
  issue: LinkIssue;
  server: ServerVersions | null;
  wentOfflineAt: number | null;
  leader: boolean;
}

/** Without `uploadVersion`, device versions stay on the device. `via` is "server" unless given. */
export interface SyncClientOptions {
  userId: string;
  deviceId: string;
  build: string;
  versions: VersionSet;
  minServer: VersionSet;
  ports: SyncClientPorts;
  uploadVersion?: (version: DeviceVersion) => Promise<boolean>;
  via?: Via;
}

export interface SyncClient {
  readonly link: Subscribable<LinkFacts>;
  /**
   * The local copy is loaded before anything is sent. With `create`, a document
   * the store does not hold is new: it is created on the server at its first sync.
   */
  open(
    docId: string,
    options?: { create: NonNullable<DocMeta["create"]> },
  ): Promise<DocHandle>;
  /**
   * A new document under a version 7 ID, usable at once with no connection. One
   * with a `workspaceId` is created on the server only once the store holds that
   * workspace's index as the server named it.
   */
  create(request: NonNullable<DocMeta["create"]>): Promise<DocHandle>;
  /** Every document the store holds, read from the store in any tab without opening one. */
  documents(): Promise<readonly DocSummary[]>;
  /** True at the start. */
  setOnline(wanted: boolean): void;
  /** The app calls it on online, visibility and focus events. */
  retryNow(): void;
  /** SUBSCRIBE with mode `view`: no document, no outbox, nothing stored. */
  view(docId: string): ViewHandle;
  /** The prompter feed of the rundown `rundownId`. */
  prompter(rundownId: string): PrompterHandle;
  /** The person's private copy of the script `docId`. */
  privateCopy(docId: string): PrivateCopyHandle;
  /** Who drives the script `docId` when it is presented to the room. */
  driver(docId: string): DriverHandle;
  close(): Promise<void>;
}

class Client implements SyncClient, LinkDriverHost {
  readonly link = createSubscribable<LinkFacts>({
    state: "offline",
    issue: "none",
    server: null,
    wentOfflineAt: null,
    leader: false,
  });
  private readonly linkDriver: LinkDriver;
  private readonly replicas: Replicas;
  private readonly viewers = new Map<string, Viewer>();
  private leading = false;
  private resign: () => void;
  private readonly unlisten: () => void;
  private readonly options: SyncClientOptions;

  constructor(options: SyncClientOptions) {
    this.options = options;
    const { ports } = options;
    this.linkDriver = createLinkDriver({
      versions: options.versions,
      minServer: options.minServer,
      build: options.build,
      deviceId: options.deviceId,
      ports,
      host: this,
    });
    this.replicas = createReplicas({
      ports,
      via: options.via ?? "server",
      link: this.linkDriver,
      uploadVersion: options.uploadVersion ?? null,
      leading: () => this.leading,
      view: (docId) => this.view(docId),
      lostLead: () => this.stepDown(),
    });
    this.resign = this.campaign();
    this.unlisten = ports.leader.listen((value) => this.replicas.heard(value));
  }

  open(
    docId: string,
    options?: { create: NonNullable<DocMeta["create"]> },
  ): Promise<DocHandle> {
    return this.replicas.hold(docId, options?.create ?? null);
  }

  create(request: NonNullable<DocMeta["create"]>): Promise<DocHandle> {
    const { clock, random } = this.options.ports;
    const docId = docIdV7(clock.now(), random.bytes(10));
    return this.replicas.hold(docId, request);
  }

  async documents(): Promise<readonly DocSummary[]> {
    const { store } = this.options.ports;
    if (store.summaries !== undefined) return store.summaries();
    const metas = await store.documents();
    return Promise.all(
      metas.map(async ({ docId, neverSynced, parked }) => {
        const [loaded, recovered] = await Promise.all([
          store.load(docId),
          store.recovered(docId),
        ]);
        const waiting = waitingCount(loaded?.entries ?? []);
        return {
          docId,
          neverSynced,
          waiting,
          parked,
          recovered: recovered.length,
        };
      }),
    );
  }

  /** A tab that does not lead only remembers what is wanted, for when it leads. */
  setOnline(wanted: boolean): void {
    if (this.leading) this.linkDriver.input({ type: "want", online: wanted });
    else this.linkDriver.remember(wanted);
  }

  retryNow(): void {
    if (this.leading)
      this.linkDriver.input({
        type: "retry_now",
        random: this.options.ports.random.next(),
      });
  }

  view(docId: string): ViewHandle {
    const known = this.viewers.get(docId);
    if (known !== undefined) return known.handle;
    const viewer = createViewer({
      docId,
      clock: this.options.ports.clock,
      closed: () => this.viewers.delete(docId),
    });
    this.viewers.set(docId, viewer);
    viewer.link(this.linkDriver.sessionLink().state);
    if (this.linkDriver.sessionLink().state === "online")
      viewer.connected((m) => this.linkDriver.send(m));
    return viewer.handle;
  }

  prompter(rundownId: string): PrompterHandle {
    return createPrompterHandle({
      rundownId,
      client: this,
      ports: this.options.ports,
    });
  }

  privateCopy(docId: string): PrivateCopyHandle {
    return createPrivateCopyHandle({
      docId,
      client: this,
      ports: this.options.ports,
    });
  }

  driver(docId: string): DriverHandle {
    return createDriverHandle({
      docId,
      client: this,
      ports: this.options.ports,
    });
  }

  async close(): Promise<void> {
    await this.replicas.close();
    for (const viewer of this.viewers.values()) viewer.handle.close();
    this.resign();
    this.unlisten();
    this.linkDriver.close();
  }

  online(): void {
    const { linkDriver } = this;
    for (const session of this.replicas.sessions.values())
      session.connected((m) => linkDriver.send(m), linkDriver.gate);
    for (const viewer of this.viewers.values())
      viewer.connected((m) => linkDriver.send(m));
  }

  dropped(): void {
    for (const session of this.replicas.sessions.values())
      session.disconnected();
    for (const viewer of this.viewers.values()) viewer.disconnected();
  }

  welcomed(): void {
    for (const session of this.replicas.sessions.values())
      session.writeSchema(this.linkDriver.writeSchema());
  }

  receive(message: DocumentMessage): void {
    const viewer = this.viewers.get(message.docId);
    if (viewer === undefined)
      this.replicas.sessions.get(message.docId)?.receive(message);
    else viewer.receive(message);
  }

  error(docId: string, message: Extract<Message, { type: "ERROR" }>): void {
    (this.viewers.get(docId) ?? this.replicas.sessions.get(docId))?.error(
      message,
    );
  }

  skipped(docId: string): void {
    this.replicas.sessions.get(docId)?.skipped();
  }

  publish(): void {
    const facts = this.linkDriver.sessionLink();
    this.link.set({
      ...facts,
      server: this.linkDriver.server,
      leader: this.leading,
    });
    for (const session of this.replicas.sessions.values()) session.link(facts);
    for (const viewer of this.viewers.values()) viewer.link(facts.state);
  }

  private campaign(): () => void {
    return this.options.ports.leader.campaign({
      onElected: () => this.elected(),
      onDeposed: () => this.deposed(),
    });
  }

  /** The documents this tab followed are opened from the store, and the link connects once they are loaded. */
  private elected(): void {
    this.leading = true;
    this.replicas.elected();
    this.linkDriver.lead();
    this.publish();
  }

  /** A store write was refused because another tab leads: this one gives the lead up as if deposed. */
  private stepDown(): void {
    if (!this.leading) return;
    this.resign();
    this.deposed();
  }

  /** The lead was taken: the connection closes, the store is left, and each document this tab's app holds is followed. */
  private deposed(): void {
    this.leading = false;
    this.linkDriver.detach();
    this.replicas.deposed();
    this.resign = this.campaign();
    this.publish();
  }
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  return new Client(options);
}
