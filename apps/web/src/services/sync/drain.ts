// Documents synced in the background, a few at a time: those whose changes wait, each time the leader connects, and
// those the Library lists that the device does not hold yet.
import type {
  DocHandle,
  DocStatus,
  LinkFacts,
  Subscribable,
  SyncClient,
} from "@manent/sync-client";

/** Documents a drain holds open at once. */
export const DRAIN_PARALLEL = 3;

// a document parked or read only syncs no further until something changes on the server
const STOPPED_SIDES: readonly DocStatus["side"][number][] = Object.freeze([
  "access_removed",
  "deleted",
  "read_only",
  "view_only",
]);

const isLive = (link: LinkFacts): boolean =>
  link.state === "online" && link.leader;

// a document the device cannot list or open now keeps its changes: the next connection drains it again, and a fetched
// one opens when the person opens it
const passOver = (): void => {};

// the server holds nothing of the document for this person
const REFUSED_SIDES: readonly DocStatus["side"][number][] = Object.freeze([
  "access_removed",
  "deleted",
]);

const isDone = (status: DocStatus): boolean =>
  status.synced || status.side.some((side) => STOPPED_SIDES.includes(side));

/** Resolves once the handle's status is done, or at once when `stopping` has been told. */
function settled(handle: DocHandle, stopping: Set<() => void>): Promise<void> {
  return new Promise((resolve) => {
    if (isDone(handle.status.get())) return resolve();
    const end = (): void => {
      stop();
      stopping.delete(end);
      resolve();
    };
    const stop = handle.status.subscribe((status) => {
      if (isDone(status)) end();
    });
    stopping.add(end);
  });
}

/**
 * Each time `trigger` turns online while this tab leads, opens every document the store lists with changes waiting or
 * never synced, `parallel` at a time, and closes each once it has synced, or is parked or read only. A connection made
 * while a drain runs starts another once it ends. Returns the function that stops it and closes what it holds open.
 */
export function startDrain(options: {
  client: SyncClient;
  parallel: number;
  trigger: Subscribable<LinkFacts>;
}): () => void {
  const { client, trigger } = options;
  const stopping = new Set<() => void>();
  let stopped = false;
  let running = false;
  let again = false;

  const drainOne = async (docId: string): Promise<void> => {
    const handle = await client.open(docId);
    if (!stopped) await settled(handle, stopping);
    await handle.close();
  };
  const drain = async (): Promise<void> => {
    const listed = await client.documents().catch(() => []);
    const queue = listed
      .filter((d) => d.parked === null && (d.waiting > 0 || d.neverSynced))
      .map((d) => d.docId);
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift())
        if (!stopped) await drainOne(id).catch(passOver);
    };
    await Promise.all(Array.from({ length: options.parallel }, worker));
  };
  const run = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      for (let more = true; more; more = again && !stopped) {
        again = false;
        await drain();
      }
    } finally {
      running = false;
    }
  };

  let live = isLive(trigger.get());
  if (live) void run();
  const stop = trigger.subscribe((link) => {
    const was = live;
    live = isLive(link);
    if (live && !was) void run();
  });
  return () => {
    stopped = true;
    stop();
    for (const end of stopping) end();
  };
}

/** Fetches documents in the background; `fetched` and `refused` grow as each fetch ends. */
export interface Fetcher {
  /** Fetches each of `docIds` not asked for before. */
  fetch(docIds: readonly string[]): void;
  /** Documents whose fetch has ended. */
  readonly fetched: ReadonlySet<string>;
  /** Documents whose fetch the server refused. */
  readonly refused: ReadonlySet<string>;
}

/**
 * Opens each document asked for, `parallel` at a time, and closes it once it has synced, or is refused or read only;
 * one that cannot open is passed over. `ended` is told after each.
 */
export function createFetcher(options: {
  client: SyncClient;
  parallel: number;
  ended: () => void;
}): Fetcher {
  const { client } = options;
  const asked = new Set<string>();
  const fetched = new Set<string>();
  const refused = new Set<string>();
  const queue: string[] = [];
  let workers = 0;

  const fetchOne = async (docId: string): Promise<void> => {
    const handle = await client.open(docId);
    await settled(handle, new Set());
    if (handle.status.get().side.some((side) => REFUSED_SIDES.includes(side)))
      refused.add(docId);
    await handle.close();
  };
  const work = async (): Promise<void> => {
    workers += 1;
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      await fetchOne(id).catch(passOver);
      fetched.add(id);
      options.ended();
    }
    workers -= 1;
  };
  return {
    fetch(docIds) {
      for (const docId of docIds)
        if (!asked.has(docId)) {
          asked.add(docId);
          queue.push(docId);
        }
      const idle = Math.min(options.parallel - workers, queue.length);
      for (let n = 0; n < idle; n += 1) void work();
    },
    fetched,
    refused,
  };
}
