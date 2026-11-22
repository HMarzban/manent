// A simulated world whose services keep a history and sequence production: each person's production
// client reaches them over a line of requests and answers that can be lost, doubled or reordered, as
// HTTP between a browser and the server can be.
import { createDoc, scriptBody, scriptSettings } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createRng } from "@manent/demo";
import type { Rng } from "@manent/demo";
import { deriveNumbers, revisedPages } from "@manent/revisions";
import type { BlockMark, LockedLayout } from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import type { FlatBlock } from "@manent/schema";
import {
  PRODUCTION_EXTRAS,
  PRODUCT_SETTING_RULES,
  activeSet,
  createHistoryService,
  createProductionService,
  documentOf,
  layoutUnder,
  marksSince,
  overridesOf,
  productionState,
  scriptAt,
  scriptPages,
  versionContent,
} from "@manent/server-core";
import type { ProductionService, SyncService } from "@manent/server-core";
import type { DocFile } from "@manent/storage";
import type { MemoryStorage } from "@manent/storage/testing";
import { ConnectError, createProductionClient } from "@manent/sync-client";
import type {
  Clock,
  ProductionClient,
  ProductionTransport,
} from "@manent/sync-client";
import { createMemoryProductionCache } from "@manent/sync-client/testing";
import type { ProductionState, VersionSet } from "@manent/sync-protocol";
import { createWorld } from "../sync/index.ts";
import type { SimClient, World } from "../sync/index.ts";
import {
  answerRequest,
  personName,
  setRoles,
  typeOnPage,
  writeScript,
} from "./fixtures.ts";
import type { LineAnswer, LineRequest, WorldServices } from "./fixtures.ts";

export interface ProductionWorld extends World {
  readonly production: ProductionService;
  /** Also delivers the production line, interleaved with the frames, and advances while a production request waits to be tried again. */
  settle(): Promise<void>;
  /** The production client of `userId`'s first device. */
  productionOf(userId: string): ProductionClient;
  /** The chance a frame or a production request is delivered twice, and that the line serves out of order. */
  faults(plan: { duplicate?: number; reorder?: number }): void;
  /** The next answer made for one of `userId`'s production requests is lost: the client hears that the server cannot be reached. */
  loseNextAnswer(userId: string): void;
  /** `userId` types a word on `page` as the script was written; the id of the action typed into. */
  typeOnPage(userId: string, page: number): string;
  /** The production state the server holds. */
  serverState(): ProductionState;
  /** The active revision at the server's head: its marks by block id, and the pages an issue of it would send. */
  activeRevision(): { marks: ReadonlyMap<string, BlockMark>; pages: string[] };
  /** The labels of the server's pages at its head. */
  serverLabels(): string[];
  /** The labels `userId`'s device lays its own script out with, under the anchors and numbers its production state holds. */
  labelsOf(userId: string): string[];
}

/** Engine 1 everywhere: production lays pages out with it. */
const ENGINE_1: VersionSet = Object.freeze({
  protocol: 1,
  schema: 1,
  engine: 1,
  table: 0,
});
/** The line, the typing and the request keys draw their numbers apart from the simulation's own. */
const LINE_SEED = 0x5eed;
/** The chance that the line, rather than the frames, moves next while it holds something. */
const LINE_SHARE = 0.5;
const MAX_ROUNDS = 1_000;
const IDLE_ADVANCE_MS = 1_000;

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/**
 * Requests waiting to be served and answers waiting to be delivered, one at a time when stepped. A
 * request is refused at once while its device's link is offline, as a browser's is.
 */
class ProductionLine {
  private readonly waiting: (() => void)[] = [];
  private readonly losing = new Set<string>();
  private duplicate = 0;
  private reorder = 0;

  constructor(
    private readonly rng: Rng,
    private readonly serve: (
      userId: string,
      request: LineRequest,
    ) => Promise<LineAnswer>,
  ) {}

  transport(userId: string, reachable: () => boolean): ProductionTransport {
    return {
      post: (path, body) =>
        this.ask(userId, reachable, {
          method: "POST",
          path,
          body: JSON.stringify(body),
        }),
      get: (path) => this.ask(userId, reachable, { method: "GET", path }),
    };
  }

  faults(plan: { duplicate?: number; reorder?: number }): void {
    this.duplicate = plan.duplicate ?? 0;
    this.reorder = plan.reorder ?? 0;
  }

  loseNextAnswer(userId: string): void {
    this.losing.add(userId);
  }

  /** Serves the next request or delivers the next answer, the oldest unless the line reorders; false when none waits. */
  step(): boolean {
    const last = this.waiting.length - 1;
    if (last < 0) return false;
    const at = this.rng.next() < this.reorder ? this.rng.int(0, last) : 0;
    this.waiting.splice(at, 1)[0]?.();
    return true;
  }

  queued(): number {
    return this.waiting.length;
  }

  private ask(
    userId: string,
    reachable: () => boolean,
    request: LineRequest,
  ): Promise<LineAnswer> {
    if (!reachable()) return Promise.reject(new ConnectError("unreachable"));
    const { promise, resolve, reject } = Promise.withResolvers<LineAnswer>();
    // a request delivered twice is served twice; its client takes the first answer to arrive
    const run = (): void => {
      void this.serve(userId, request).then((answer) => {
        const lost = this.losing.delete(userId);
        this.waiting.push(() =>
          lost ? reject(new ConnectError("unreachable")) : resolve(answer),
        );
      });
    };
    this.waiting.push(run);
    if (this.rng.next() < this.duplicate) this.waiting.push(run);
    return promise;
  }
}

/** A clock that counts the timers set through it and neither run nor cancelled. */
function countingClock(clock: Clock): { clock: Clock; pending(): number } {
  let pending = 0;
  const schedule = (fn: () => void, delayMs: number): (() => void) => {
    pending += 1;
    let done = false;
    const finish = (): void => {
      if (!done) pending -= 1;
      done = true;
    };
    const cancel = clock.schedule(() => {
      finish();
      fn();
    }, delayMs);
    return () => {
      finish();
      cancel();
    };
  };
  return { clock: { now: clock.now, schedule }, pending: () => pending };
}

/** The history and production services every server the world starts hooks in. */
function createServices(parts: {
  service: () => SyncService;
  storage: MemoryStorage;
  clock: Clock;
}): WorldServices {
  let made = 0;
  const ids = (): string => `production-${++made}`;
  const { service, storage, clock } = parts;
  const history = createHistoryService({
    sync: service,
    storage,
    clock,
    ids,
    extras: PRODUCTION_EXTRAS,
  });
  const production = createProductionService({
    storage,
    sync: service,
    history,
    now: clock.now,
    ids,
    names: personName,
    renderPdf: () =>
      Promise.reject(new RangeError("the simulation draws no files")),
    rules: PRODUCT_SETTING_RULES,
  });
  return { history, production };
}

/** The document as the server's log holds it now, every root map included. */
function headDoc(file: DocFile, docId: string): CrdtDoc {
  const { generation } = documentOf(file, docId);
  const doc = createDoc();
  for (const { update } of file.log.tail(docId, generation, 0).rows)
    doc.applyUpdate(update);
  return doc;
}

const pageLabels = (layout: LockedLayout): string[] =>
  layout.pagination.pages.map((page) => page.label);

/** The headings that carry a scene number, in document order. */
const numberedHeadings = (flat: readonly FlatBlock[]) =>
  flat.flatMap(({ attrs }) =>
    (attrs.type === "scene_heading" || attrs.type === "slug") &&
    attrs.id !== null
      ? [{ blockId: attrs.id, num: attrs.num }]
      : [],
  );

/** The labels a device's script gives under the anchors, scheme and numbers of its production state. */
function deviceLabels(client: SimClient, state: ProductionState): string[] {
  const doc = client.handle.doc();
  const engineVersion = state.sets.at(-1)?.engineVersion ?? null;
  const under = layoutUnder(scriptSettings(doc).entries(), engineVersion);
  if (!under.ok)
    throw new RangeError(`${client.device} cannot lay out: ${under.reason}`);
  const flat = blocksOf(scriptBody(doc).materialize());
  const used = new Set(state.sceneNumbers.map((n) => n.num));
  const numbers = deriveNumbers(numberedHeadings(flat), state.numbering, used);
  const { engine, profile } = under;
  return pageLabels(scriptPages(flat, numbers, profile, state.anchors, engine));
}

/** The active revision at the head of `file`'s document. */
function activeRevisionOf(file: DocFile, docId: string) {
  const doc = headDoc(file, docId);
  const active = activeSet(file, docId);
  const read = scriptAt(doc, file, docId, active.engineVersion);
  if (!read.ok) throw new RangeError(`${docId} cannot lay out: ${read.reason}`);
  const { content, flat, layout } = read.script;
  const baseline = versionContent(file, active.baselineVersionId).blocks;
  const overrides = overridesOf(doc, active.id);
  const marks = marksSince(baseline, content, flat, overrides);
  doc.destroy();
  return { marks, pages: revisedPages(layout.pagination, marks) };
}

/**
 * A world of `people` on the ten-page script, not yet locked, written by the first person's device
 * and synced everywhere, with Priya coordinating and Dana able to issue; each person's production
 * client runs on the world's clock, not on their device's, with its cache in memory.
 */
export async function createProductionWorld(options: {
  seed: number;
  people: readonly string[];
}): Promise<ProductionWorld> {
  const made: WorldServices[] = [];
  const world = await createWorld({
    seed: options.seed,
    users: options.people,
    serverVersions: { current: ENGINE_1, min: ENGINE_1 },
    clientVersions: () => ENGINE_1,
    hooks({ service, storage, clock }) {
      const services = createServices({ service, storage, clock: clock.clock });
      made.push(services);
      return [services.history, services.production.hooks];
    },
  });
  const [services] = made;
  if (services === undefined)
    throw new RangeError("the world made no services");
  const { storage, docId, clock } = world;
  const file = (): DocFile => {
    const place = storage.directory.placeOf(docId);
    if (place === null) throw new RangeError(`${docId} is not placed`);
    return storage.open(place.home);
  };
  const clientOf = (userId: string): SimClient => {
    const found = world.clients.find((c) => c.userId === userId);
    if (found === undefined) throw new RangeError(`no device of ${userId}`);
    return found;
  };
  setRoles(storage, docId, options.people);
  const [writer] = world.clients;
  if (writer === undefined) throw new RangeError("a world needs a device");
  writeScript(writer);
  const settleWorld = world.settle.bind(world);
  await settleWorld();

  const rng = createRng(options.seed ^ LINE_SEED);
  const line = new ProductionLine(rng, (userId, request) =>
    answerRequest(services, userId, request),
  );
  const clocks: { pending(): number }[] = [];
  const productions = new Map<string, ProductionClient>();
  for (const userId of new Set(options.people)) {
    const client = clientOf(userId);
    const counted = countingClock(clock.clock);
    clocks.push(counted);
    const reachable = (): boolean =>
      client.handle.status.get().link !== "offline";
    const bytes = (n: number): Uint8Array =>
      Uint8Array.from({ length: n }, () => rng.int(0, 255));
    const production = createProductionClient({
      docId,
      handle: client.handle,
      transport: line.transport(userId, reachable),
      cache: createMemoryProductionCache(),
      random: { bytes },
      clock: counted.clock,
    });
    productions.set(userId, production);
  }
  const busy = (): boolean =>
    line.queued() > 0 || clocks.some((c) => c.pending() > 0);

  async function settle(): Promise<void> {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      while (line.queued() > 0) {
        if (rng.next() < LINE_SHARE || !world.network.step()) line.step();
        await turn();
      }
      await settleWorld();
      if (line.queued() > 0) continue;
      if (!busy()) return;
      clock.advance(IDLE_ADVANCE_MS);
    }
    throw new Error(
      `seed ${world.seed}: the production line did not settle in ${MAX_ROUNDS} rounds`,
    );
  }

  const productionWorld: ProductionWorld = Object.assign(world, {
    production: services.production,
    settle,
    productionOf(userId: string): ProductionClient {
      const found = productions.get(userId);
      if (found === undefined) throw new RangeError(`no client of ${userId}`);
      return found;
    },
    faults(plan: { duplicate?: number; reorder?: number }): void {
      world.network.faults({ duplicate: plan.duplicate });
      line.faults(plan);
    },
    loseNextAnswer: (userId: string) => line.loseNextAnswer(userId),
    typeOnPage: (userId: string, page: number) =>
      typeOnPage(clientOf(userId), page, rng),
    serverState: () => productionState(file(), docId, personName),
    activeRevision: () => activeRevisionOf(file(), docId),
    serverLabels(): string[] {
      const at = file();
      const doc = headDoc(at, docId);
      const read = scriptAt(
        doc,
        at,
        docId,
        documentOf(at, docId).engineVersion,
      );
      doc.destroy();
      if (!read.ok)
        throw new RangeError(`${docId} cannot lay out: ${read.reason}`);
      return pageLabels(read.script.layout);
    },
    labelsOf(userId: string): string[] {
      const held = productionWorld.productionOf(userId).current().get();
      if (held === null)
        throw new RangeError(`${userId} holds no production state`);
      return deviceLabels(clientOf(userId), held.state);
    },
  });
  await settle();
  return productionWorld;
}
