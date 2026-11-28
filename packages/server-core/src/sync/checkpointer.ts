// Checkpoints: the state of a document at a sequence, built through a document from the log, on
// the calling thread for tests or on one long-lived worker thread for the server.
import { ORIGIN_LOAD, createDoc, loadDoc, measureDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import type { Checkpointer } from "./ports.ts";

/** Maximum warm CRDT documents kept across consecutive checkpoint jobs on the worker thread. */
const WORKER_DOC_CACHE_MAX = 2;

interface Job {
  home: Home;
  docId: string;
}

interface CachedWorkerDoc {
  generation: number;
  seq: number;
  doc: CrdtDoc;
}

const docKeyOf = (job: Job): string =>
  `${job.home.kind}:${job.home.id}:${job.docId}`;

/**
 * Worker-thread checkpoint runner: reuses a tiny warm LRU of active CRDT documents across
 * consecutive jobs so each checkpoint applies only the incremental tail instead of reloading
 * the full state from SQLite.
 */
function runWorkerCheckpointJob(
  storage: Storage,
  job: Job,
  cache: Map<string, CachedWorkerDoc>,
): { seq: number } | null {
  const file = storage.open(job.home);
  const row = file.log.get(job.docId);
  if (row === null) return null;
  const key = docKeyOf(job);
  let cached = cache.get(key);
  if (cached !== undefined && cached.generation !== row.generation) {
    cached.doc.destroy();
    cache.delete(key);
    cached = undefined;
  }
  let from: number;
  let doc: CrdtDoc;
  if (cached !== undefined) {
    from = cached.seq;
    doc = cached.doc;
    // refresh LRU order
    cache.delete(key);
    cache.set(key, cached);
  } else {
    const checkpoint = file.checkpoints.newest(job.docId, row.generation);
    from = checkpoint?.seq ?? 0;
    doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  }
  const tail = file.log.tail(job.docId, row.generation, from, {
    quarantine: false,
  });
  const last = tail.rows.at(-1);
  if (last === undefined || tail.corrupt.length > 0) {
    if (cached === undefined) doc.destroy();
    return null;
  }
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  const state = doc.encodeState();
  file.checkpoints.put(job.docId, row.generation, last.seq, state);
  const measure = { seq: last.seq, ...measureDoc(doc, state.byteLength) };
  file.measures.put(job.docId, row.generation, measure);
  if (cached !== undefined) {
    cached.seq = last.seq;
  } else {
    cache.set(key, { generation: row.generation, seq: last.seq, doc });
    while (cache.size > WORKER_DOC_CACHE_MAX) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.get(oldestKey)?.doc.destroy();
      cache.delete(oldestKey);
    }
  }
  return { seq: last.seq };
}

/**
 * Builds the document from its newest valid checkpoint and the tail after it, and stores its state
 * and its measure at the last sequence read. Null when nothing is new, or when a row does not
 * verify: the row is left for the serving thread to quarantine on its next load.
 */
export function runCheckpointJob(
  storage: Storage,
  job: { home: Home; docId: string },
): { seq: number } | null {
  const file = storage.open(job.home);
  const row = file.log.get(job.docId);
  if (row === null) return null;
  // no transaction, which would hold the serving thread's writer: the log only grows past a
  // checkpoint's sequence, and the tail is one read, so a commit is wholly in it or wholly after it
  const checkpoint = file.checkpoints.newest(job.docId, row.generation);
  const from = checkpoint?.seq ?? 0;
  const tail = file.log.tail(job.docId, row.generation, from, {
    quarantine: false,
  });
  const last = tail.rows.at(-1);
  if (last === undefined || tail.corrupt.length > 0) return null;
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  const state = doc.encodeState();
  file.checkpoints.put(job.docId, row.generation, last.seq, state);
  const measure = { seq: last.seq, ...measureDoc(doc, state.byteLength) };
  file.measures.put(job.docId, row.generation, measure);
  doc.destroy();
  return { seq: last.seq };
}

/**
 * For tests and the simulation: each job runs on the calling thread when `defer` calls back, and
 * idle() runs whatever is still queued at once.
 */
export function createInlineCheckpointer(options: {
  storage: Storage;
  defer(fn: () => void): void;
}): Checkpointer {
  const { storage, defer } = options;
  const queued: Job[] = [];
  const runQueued = (): void => {
    for (let job = queued.shift(); job !== undefined; job = queued.shift())
      runCheckpointJob(storage, job);
  };
  return {
    request(job) {
      queued.push({ home: { ...job.home }, docId: job.docId });
      defer(runQueued);
    },
    async idle() {
      runQueued();
    },
    async close() {
      runQueued();
    },
  };
}

/** The messages between the main thread and the checkpoint worker. */
type ToWorker =
  | { t: "init"; data: unknown }
  | { t: "job"; id: number; job: Job }
  | { t: "stop" };
type FromWorker = { t: "done"; id: number } | { t: "stopped" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readHome(value: unknown): Home | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (value.kind === "project") return { kind: "project", id: value.id };
  if (value.kind === "user") return { kind: "user", id: value.id };
  return null;
}

function readToWorker(
  message: unknown,
): Exclude<ToWorker, { t: "init" }> | null {
  if (!isRecord(message)) return null;
  if (message.t === "stop") return { t: "stop" };
  if (message.t !== "job" || typeof message.id !== "number") return null;
  const { job } = message;
  if (!isRecord(job) || typeof job.docId !== "string") return null;
  const home = readHome(job.home);
  return home === null
    ? null
    : { t: "job", id: message.id, job: { home, docId: job.docId } };
}

function readFromWorker(message: unknown): FromWorker | null {
  if (!isRecord(message)) return null;
  if (message.t === "stopped") return { t: "stopped" };
  return message.t === "done" && typeof message.id === "number"
    ? { t: "done", id: message.id }
    : null;
}

/**
 * The worker's side: answers each job with `done` once it has run or failed, and `stop` with
 * `stopped` after the last job, closing the storage first. Reading `init` and opening the storage
 * is the entry file's, since only a composition root names a storage driver.
 */
export function serveCheckpointJobs(
  storage: Storage,
  port: {
    onMessage(handler: (message: unknown) => void): void;
    post(message: unknown): void;
  },
): void {
  const cache = new Map<string, CachedWorkerDoc>();
  port.onMessage((raw) => {
    const message = readToWorker(raw);
    if (message === null) return;
    if (message.t === "stop") {
      for (const entry of cache.values()) entry.doc.destroy();
      cache.clear();
      storage.close();
      port.post({ t: "stopped" } satisfies FromWorker);
      return;
    }
    try {
      runWorkerCheckpointJob(storage, message.job, cache);
    } catch {
      // a job that failed (a file busy or unreadable) is ignored: a checkpoint is a disposable
      // cache, the log stays whole and the next load replays it, so the worker serves the next job
      const key = docKeyOf(message.job);
      cache.get(key)?.doc.destroy();
      cache.delete(key);
    }
    port.post({ t: "done", id: message.id } satisfies FromWorker);
  });
}

/**
 * One long-lived worker thread running `entry`, which is sent `{ t: "init", data }` first. close()
 * waits for the worker to finish its jobs and lets its thread end; it never terminates it. A worker
 * that ends on an uncaught error lets every waiter go, and later jobs are dropped.
 */
export function createWorkerCheckpointer(options: {
  entry: string | URL;
  data: unknown;
}): Checkpointer {
  const worker = new Worker(options.entry);
  // a worker has no origin: the second argument is the (empty) transfer list
  const post = (message: ToWorker): void => worker.postMessage(message, []);
  const unfinished = new Set<number>();
  let waiting: (() => void)[] = [];
  let stopped: (() => void) | null = null;
  let jobs = 0;
  let ended = false;
  const settle = (): void => {
    if (unfinished.size > 0) return;
    const resolved = waiting;
    waiting = [];
    for (const resolve of resolved) resolve();
  };
  // dropping what a dead worker held is safe: a checkpoint only shortens the next load
  const end = (): void => {
    ended = true;
    unfinished.clear();
    settle();
    stopped?.();
  };
  worker.addEventListener("error", end);
  worker.addEventListener("close", end);
  worker.addEventListener("message", (event: MessageEvent) => {
    const message = readFromWorker(event.data);
    if (message?.t === "done") {
      unfinished.delete(message.id);
      settle();
    }
    if (message?.t === "stopped") stopped?.();
  });
  post({ t: "init", data: options.data });
  const idle = (): Promise<void> =>
    new Promise((resolve) => {
      waiting.push(resolve);
      settle();
    });
  return {
    request(job) {
      if (ended) return;
      const id = ++jobs;
      unfinished.add(id);
      post({ t: "job", id, job: { home: { ...job.home }, docId: job.docId } });
    },
    idle,
    async close() {
      await idle();
      if (ended) return;
      await new Promise<void>((resolve) => {
        stopped = resolve;
        post({ t: "stop" });
      });
    },
  };
}
