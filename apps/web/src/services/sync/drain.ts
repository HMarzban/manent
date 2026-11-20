// The documents whose changes wait, synced without being opened: a few at a time each time the leader connects.
import type {
  DocHandle,
  DocStatus,
  LinkFacts,
  Subscribable,
  SyncClient,
} from "@manent/sync-client";

// a document parked or read only syncs no further until something changes on the server
const STOPPED_SIDES: readonly DocStatus["side"][number][] = Object.freeze([
  "access_removed",
  "deleted",
  "read_only",
  "view_only",
]);

const isLive = (link: LinkFacts): boolean =>
  link.state === "online" && link.leader;

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
    const listed = await client.documents();
    const queue = listed
      .filter((d) => d.parked === null && (d.waiting > 0 || d.neverSynced))
      .map((d) => d.docId);
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift())
        if (!stopped) await drainOne(id);
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
