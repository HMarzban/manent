// The desktop in one seeded world: a window on a real node core, which relays to a simulated cloud
// over a link that can be cut, on storage that can crash or fill; moved only by the clock, deferred
// work and network steps.
import { createRng, seededIdSource } from "@manent/demo";
import type { Rng } from "@manent/demo";
import type { NodeCore, NodeRecords } from "@manent/local-node";
import { createMemoryRecords } from "@manent/local-node/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import type { DocHandle, DocStatus, Random } from "@manent/sync-client";
import type { SyncClient } from "@manent/sync-client";
import {
  createFakeClock,
  createMemoryNetwork,
  createMemoryStoreSpace,
} from "@manent/sync-client/testing";
import type { FakeClock } from "@manent/sync-client/testing";
import { SimCloud } from "./desktop-cloud.ts";
import { Collaborators, askSetting, editScript } from "./desktop-edits.ts";
import {
  firstDesktopBroken,
  heldMarkers,
  historyFault,
  logText,
  unsyncedMarker,
} from "./desktop-invariants.ts";
import type { DesktopFacts } from "./desktop-invariants.ts";
import { CloudLink, VERSIONS, randomFrom } from "./desktop-node.ts";
import { createNodeProcess } from "./desktop-node.ts";
import type { NodeLife } from "./desktop-node.ts";
import { WindowLink } from "./desktop-window.ts";
import { DOC, Device, createBooks } from "./device.ts";
import { seedScript } from "./script.ts";
import type { Tools } from "./script.ts";

export interface DesktopWorld {
  readonly seed: number;
  readonly clock: FakeClock;
  readonly cloudStorage: MemoryStorage;
  readonly nodeStorage: MemoryStorage;
  readonly window: {
    client: SyncClient;
    handle: DocHandle;
    typed: string[];
    settingsAsked: number;
  };
  /**
   * One random action: type, type into a block, delete a block, ask a setting, cut or join the
   * node's network, a cloud collaborator types, fill or free the node's disk, sign in to sync
   * (once), the cloud rebuilds the script, or the cloud refuses the node's next push for good.
   */
  act(): void;
  /** Until nothing is queued or deferred and the window is as far on as the network and the disk let it; throws after 100,000 steps. */
  settle(): Promise<void>;
  /** The node's next commit dies before or after it lands, or the node dies now. */
  crashNode(when: "before_commit" | "after_commit" | "now"): void;
  /** Once the armed crash has come (at the latest when the world is quiet): a new core over the same storages and records. */
  restartNode(): Promise<void>;
  /** The script's lines as each log alone rebuilds it. */
  cloudText(): string[];
  nodeText(): string[];
  /** D1–D7; throws naming the seed and the first broken. */
  check(): void;
}

const START_AT = 1_767_225_600_000;
const MAX_STEPS = 100_000;
const IDLE_ADVANCE_MS = 1_000;
/** After an answer that did not sign the person in to sync, they ask again this much later. */
const ASK_AGAIN_MS = 5_000;
const ACTIONS = [
  "type",
  "type_into",
  "delete_block",
  "ask_setting",
  "network",
  "collaborator_types",
  "disk",
  "sign_in_to_sync",
  "cloud_rebuild",
  "cloud_refuse",
] as const;
type Action = (typeof ACTIONS)[number];

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

class SimDesktop implements DesktopWorld {
  readonly clock = createFakeClock(START_AT);
  readonly cloudStorage = createMemoryStorage({ now: this.clock.clock.now });
  readonly nodeStorage = createMemoryStorage({ now: this.clock.clock.now });
  private readonly rng: Rng;
  private readonly books = createBooks();
  private readonly cloud: SimCloud;
  private readonly link: CloudLink;
  private readonly windowLink: WindowLink;
  private readonly records: NodeRecords;
  private readonly empty = this.nodeStorage.snapshot();
  private upstreamStores = createMemoryStoreSpace();
  private node: { life: NodeLife; core: NodeCore };
  private opened: Device | null = null;
  private settingsAsked = 0;
  private readonly collaborators: Collaborators;
  private readonly tools: Tools;
  private full = false;
  private signing = false;
  private quietOwed = false;
  private firstKey: string | null = null;
  private readonly acked = new Set<string>();
  private readonly found: DesktopFacts["found"] = { d5: null, d7: null };

  constructor(
    readonly seed: number,
    private readonly person: string,
    collaborators: readonly string[],
  ) {
    this.rng = createRng(seed);
    const ids = seededIdSource(this.rng);
    this.tools = { rng: this.rng, ids };
    if (person !== "you") {
      const users = [person, ...collaborators];
      seedScript(this.cloudStorage, users, VERSIONS, ids);
    }
    const network = createMemoryNetwork({ random: this.rng.next });
    const parts = { clock: this.clock, random: this.rng.next };
    this.cloud = new SimCloud(this.cloudStorage, network, parts);
    this.link = new CloudLink(network, () => this.cloud.api());
    this.collaborators = new Collaborators(collaborators, {
      cloud: this.cloud,
      books: this.books,
      tools: this.tools,
      clock: this.clock,
      random: () => this.random(),
    });
    this.windowLink = new WindowLink(() => this.node);
    const records = createMemoryRecords();
    this.records = {
      ...records,
      startHandoff: (handoff) => {
        records.startHandoff(handoff);
        this.firstKey ??= records.handoff(handoff.docId)?.key ?? null;
      },
    };
    this.node = this.startNode();
  }

  get window(): DesktopWorld["window"] {
    const { client, handle, typed } = this.device;
    return { client, handle, typed, settingsAsked: this.settingsAsked };
  }

  private get device(): Device {
    if (this.opened === null) throw new RangeError("the window is not open");
    return this.opened;
  }

  /** The person chooses themselves at the node, then the window opens the script, making it for You. */
  async begin(): Promise<void> {
    await this.windowLink.signIn(this.person);
    // a registered person's cloud session comes before the window opens the script
    for (let step = 0; this.person !== "you" && step < MAX_STEPS; step++)
      if (this.hasSession() || !(await this.step())) break;
    this.opened = await this.windowLink.open({
      userId: this.person,
      books: this.books,
      clock: this.clock.clock,
      random: () => this.random(),
      create: this.person === "you",
    });
    this.opened.handle.status.subscribe((status) => this.heard(status));
    await this.settle();
  }

  act(): void {
    const weights = this.weights();
    const total = ACTIONS.reduce((sum, action) => sum + weights[action], 0);
    let roll = this.rng.next() * total;
    const rolled = ACTIONS.find((action) => {
      roll -= weights[action];
      return roll < 0;
    });
    this.perform(rolled ?? "type");
  }

  async settle(): Promise<void> {
    if (await this.move(() => false)) return this.witness();
    const status = JSON.stringify(this.device.handle.status.get());
    throw new Error(
      `seed ${this.seed}: the desktop did not settle in ${MAX_STEPS} steps: ${status}`,
    );
  }

  crashNode(when: "before_commit" | "after_commit" | "now"): void {
    if (when === "now") return this.node.life.die();
    this.nodeStorage.crashOnCommit(
      when === "before_commit" ? "before" : "after",
    );
  }

  async restartNode(): Promise<void> {
    if (!(await this.move(() => !this.node.life.alive)))
      throw new Error(`seed ${this.seed}: the node's crash never came`);
    this.nodeStorage.crashOnCommit(null);
    this.node.life.die();
    this.node = this.startNode();
  }

  cloudText(): string[] {
    return logText(this.cloudStorage);
  }

  nodeText(): string[] {
    return logText(this.nodeStorage);
  }

  check(): void {
    const broken = firstDesktopBroken({
      person: this.person,
      cloud: this.cloudStorage,
      node: this.nodeStorage,
      window: this.device,
      books: this.books,
      records: this.records,
      acked: this.acked,
      up: this.isUp(),
      session: this.hasSession(),
      firstKey: this.firstKey,
      refusals: {
        heard: this.link.refusals,
        caused: this.cloud.refusalsCaused,
      },
      found: this.found,
    });
    if (broken !== null) throw new Error(`seed ${this.seed}: ${broken}`);
  }

  /** D1's books and D5, at each change of the window's status. */
  private heard(status: DocStatus): void {
    if (status.saved)
      for (const marker of heldMarkers(this.books, this.device))
        this.acked.add(marker);
    if (!status.synced || this.found.d5 !== null) return;
    const missing = unsyncedMarker(this.books, this.device, this.cloudStorage);
    if (missing !== null)
      this.found.d5 = `D5: the window said synced while ${missing} was not in the cloud's log`;
  }

  /** D7, once settled. */
  private async witness(): Promise<void> {
    const store = this.upstreamStores.store(this.person);
    this.found.d7 = historyFault({
      person: this.person,
      node: this.nodeStorage,
      records: this.records,
      upstream: await store.load(DOC),
    });
  }

  private isUp(): boolean {
    return !this.link.cut && !this.full && this.node.life.alive;
  }

  private hasSession(): boolean {
    return (this.records.person(this.person)?.cloudToken ?? null) !== null;
  }

  /** The window is as far on as the node, the disk and the network let it be. */
  private isQuiet(): boolean {
    const status = this.device.handle.status.get();
    if (this.full || !this.node.life.alive) return true;
    if (!status.saved) return false;
    if (this.link.cut || !(this.signing || this.hasSession())) return true;
    return status.synced && this.collaborators.isSynced();
  }

  /** Until `until` holds or the world is quiet; false when MAX_STEPS ran out first. */
  private async move(until: () => boolean): Promise<boolean> {
    let calm = false;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (until()) return true;
      // a step that leaves the window as far on keeps the calm: a full disk is retried every second
      if (await this.step()) {
        calm &&= this.isQuiet();
        continue;
      }
      const quiet = this.isQuiet();
      if (quiet && calm) {
        if (!this.quietOwed) return true;
        // a requested rebuild waits for a quiet moment, which a calm world lets pass
        this.quietOwed = false;
        calm = false;
        this.clock.advance(this.cloud.server.limits.rebuildQuietMs);
        continue;
      }
      calm = quiet;
      this.clock.advance(IDLE_ADVANCE_MS);
    }
    return false;
  }

  /** Runs deferred work, or delivers one frame, call or replay; false when nothing waited. */
  private async step(): Promise<boolean> {
    await turn();
    const deferred = this.node.life.runDeferred();
    if (deferred || this.cloud.server.runDeferred()) return true;
    // the window's socket, the node's calls and the cloud's network each go first as the seed picks
    const lines = [this.windowLink, this.link, this.cloud];
    const first = this.rng.int(0, lines.length - 1);
    for (let i = 0; i < lines.length; i++)
      if (lines[(first + i) % lines.length]?.step(this.rng.next)) return true;
    await turn();
    const queued = this.link.queued() + this.cloud.queued();
    return this.windowLink.isQueued() || queued > 0;
  }

  private weights(): Record<Action, number> {
    const placed = this.cloud.holdsScript();
    return {
      type: 24,
      type_into: 20,
      delete_block: 8,
      ask_setting: 6,
      network: this.link.cut ? 9 : 3,
      collaborator_types: this.collaborators.size > 0 ? 10 : 0,
      disk: this.full ? 6 : 2,
      sign_in_to_sync: this.signing || this.hasSession() ? 0 : 3,
      cloud_rebuild: placed ? 2 : 0,
      cloud_refuse: placed ? 2 : 0,
    };
  }

  private perform(action: Action): void {
    switch (action) {
      case "type":
      case "type_into":
      case "delete_block":
        return editScript(this.device, action, this.tools);
      case "ask_setting":
        this.settingsAsked += 1;
        return askSetting(this.device, this.rng);
      case "network":
        return this.link.setCut(!this.link.cut, this.node.life);
      case "collaborator_types":
        return this.collaborators.type();
      case "disk":
        this.full = !this.full;
        return this.nodeStorage.fillDisk(this.full);
      case "sign_in_to_sync":
        this.signing = true;
        return this.askToSync();
      case "cloud_rebuild":
        this.quietOwed = true;
        return this.cloud.server.requestRebuild();
      case "cloud_refuse":
        return this.cloud.refuseNextPush();
      default:
        return action satisfies never;
    }
  }

  /** The person asks until the node has a cloud session for them. */
  private askToSync(): void {
    void this.windowLink.post("/api/local/sign-in-to-sync").then(() => {
      if (this.hasSession()) return;
      this.clock.clock.schedule(() => this.askToSync(), ASK_AGAIN_MS);
    });
  }

  private startNode(): { life: NodeLife; core: NodeCore } {
    return createNodeProcess({
      clock: this.clock,
      storage: this.nodeStorage,
      records: this.records,
      stores: () => this.upstreamStores,
      link: this.link,
      random: () => this.random(),
      wipe: async () => {
        this.nodeStorage.restore(this.empty);
        this.upstreamStores = createMemoryStoreSpace();
      },
    });
  }

  private random(): Random {
    return randomFrom(this.rng);
  }
}

/** One script; resolves once the window has opened it and the world has settled. */
export async function createDesktopWorld(options: {
  seed: number;
  person: "you" | "sam";
  collaborators?: readonly string[];
}): Promise<DesktopWorld> {
  const { seed, person } = options;
  const world = new SimDesktop(seed, person, options.collaborators ?? []);
  await world.begin();
  return world;
}
