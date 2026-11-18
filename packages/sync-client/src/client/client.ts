// The client: one link to the server for every open document, and the lead among one user's tabs.
import { docIdV7 } from "@manent/sync-protocol";
import type {
  DocumentMessage,
  Message,
  ServerVersions,
  VersionSet,
} from "@manent/sync-protocol";
import type { LinkIssue } from "../link/machine.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import type {
  DeviceVersion,
  LinkState,
  Subscribable,
  SyncClientPorts,
} from "../ports/ports.ts";
import type { DocHandle } from "../session/doc-handle.ts";
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

/** Without `uploadVersion`, device versions stay on the device. */
export interface SyncClientOptions {
  userId: string;
  deviceId: string;
  build: string;
  versions: VersionSet;
  minServer: VersionSet;
  ports: SyncClientPorts;
  uploadVersion?: (version: DeviceVersion) => Promise<boolean>;
}

export interface SyncClient {
  readonly link: Subscribable<LinkFacts>;
  /** The local copy is loaded before anything is sent. */
  open(docId: string): Promise<DocHandle>;
  /** A new document under a version 7 ID, usable at once with no connection. */
  create(request: { kind: string; home: string }): Promise<DocHandle>;
  /** True at the start. */
  setOnline(wanted: boolean): void;
  /** The app calls it on online, visibility and focus events. */
  retryNow(): void;
  /** SUBSCRIBE with mode `view`: no document, no outbox, nothing stored. */
  view(docId: string): ViewHandle;
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
  private readonly driver: LinkDriver;
  private readonly replicas: Replicas;
  private readonly viewers = new Map<string, Viewer>();
  private leading = false;
  private resign: () => void;
  private readonly unlisten: () => void;
  private readonly options: SyncClientOptions;

  constructor(options: SyncClientOptions) {
    this.options = options;
    const { ports } = options;
    this.driver = createLinkDriver({
      versions: options.versions,
      minServer: options.minServer,
      build: options.build,
      deviceId: options.deviceId,
      ports,
      host: this,
    });
    this.replicas = createReplicas({
      ports,
      link: this.driver,
      uploadVersion: options.uploadVersion ?? null,
      leading: () => this.leading,
      view: (docId) => this.view(docId),
      lostLead: () => this.stepDown(),
    });
    this.resign = this.campaign();
    this.unlisten = ports.leader.listen((value) => this.replicas.heard(value));
  }

  open(docId: string): Promise<DocHandle> {
    return this.replicas.hold(docId, null);
  }

  create(request: { kind: string; home: string }): Promise<DocHandle> {
    const { clock, random } = this.options.ports;
    const docId = docIdV7(clock.now(), random.bytes(10));
    return this.replicas.hold(docId, request);
  }

  /** A tab that does not lead only remembers what is wanted, for when it leads. */
  setOnline(wanted: boolean): void {
    if (this.leading) this.driver.input({ type: "want", online: wanted });
    else this.driver.remember(wanted);
  }

  retryNow(): void {
    if (this.leading)
      this.driver.input({
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
    viewer.link(this.driver.sessionLink().state);
    if (this.driver.sessionLink().state === "online")
      viewer.connected((m) => this.driver.send(m));
    return viewer.handle;
  }

  async close(): Promise<void> {
    await this.replicas.close();
    for (const viewer of this.viewers.values()) viewer.handle.close();
    this.resign();
    this.unlisten();
    this.driver.close();
  }

  opening(): Promise<unknown>[] {
    return [...this.replicas.opening.values()];
  }

  online(): void {
    const { driver } = this;
    for (const session of this.replicas.sessions.values())
      session.connected((m) => driver.send(m), driver.gate);
    for (const viewer of this.viewers.values())
      viewer.connected((m) => driver.send(m));
  }

  dropped(): void {
    for (const session of this.replicas.sessions.values())
      session.disconnected();
    for (const viewer of this.viewers.values()) viewer.disconnected();
  }

  welcomed(): void {
    for (const session of this.replicas.sessions.values())
      session.writeSchema(this.driver.writeSchema());
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
    const facts = this.driver.sessionLink();
    this.link.set({
      ...facts,
      server: this.driver.server,
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
    this.driver.lead();
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
    this.driver.detach();
    this.replicas.deposed();
    this.resign = this.campaign();
    this.publish();
  }
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  return new Client(options);
}
