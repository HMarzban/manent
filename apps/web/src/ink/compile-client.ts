// Per-document Ink compile and live-story client (150 ms debounce, single queued follow-up, Web Worker host).
import type {
  InkActionResult,
  InkChoice,
  InkCompiled,
  InkFault,
  InkProblem,
  InkStepResult,
  InkVariable,
  InkVariableValue,
} from "@manent/formats";
import type { InkWorkerRequest, InkWorkerResponse } from "./compile.worker.ts";

/** Settled compile host strategy: dedicated classic Web Worker precached by the service worker. */
export const INK_COMPILE = "worker" as const;
/** Settled runtime strategy: live Story kept alongside Compiler in the worker for 1-based line metadata. */
export const INK_RUNTIME = "with-compiler" as const;
export const INK_COMPILE_DEBOUNCE_MS = 150;
export const INK_WORKER_URL = "/ink-compile.worker.js";

export interface InkCompileSnapshot {
  readonly state: "up_to_date" | "compiling";
  readonly problems: readonly InkProblem[];
  /** Compiled JSON of the last successful compile, or null if never compiled. */
  readonly lastGood: string | null;
  /** Increments on each successful compile so the player knows when to replay. */
  readonly version: number;
}

export interface InkStepSnapshot {
  readonly result: InkStepResult;
  readonly choices: readonly InkChoice[];
  readonly variables: readonly InkVariable[];
  readonly ended: boolean;
  readonly fault: InkFault | null;
}

export interface InkChoicesSnapshot {
  readonly choices: readonly InkChoice[];
  readonly ended: boolean;
  readonly fault: InkFault | null;
}

export interface InkCompileClient {
  snapshot(): InkCompileSnapshot;
  subscribe(listener: () => void): () => void;
  /** Debounces compilation by 150 ms; at most one follow-up compile queues while a compile is in flight. */
  scheduleCompile(readSource: () => string): void;
  /** Compiles `source` immediately (or queues as the single follow-up if one is already running). */
  compileNow(source: string): Promise<InkCompiled>;
  restart(): Promise<InkActionResult>;
  proceed(): Promise<InkStepSnapshot>;
  choices(): Promise<InkChoicesSnapshot>;
  choose(index: number): Promise<InkActionResult>;
  goTo(knot: string): Promise<InkActionResult>;
  variables(): Promise<readonly InkVariable[]>;
  setVariable(name: string, value: InkVariableValue): Promise<InkActionResult>;
  save(): Promise<string | null>;
  restore(saved: string): Promise<InkActionResult>;
  dispose(): void;
}

const EMPTY_PROBLEMS: readonly InkProblem[] = Object.freeze([]);
const EMPTY_VISITED: ReadonlySet<number> = new Set();
const NO_STORY_FAULT: InkFault = Object.freeze({
  line: null,
  message: "Story has not compiled yet.",
});
const NO_STORY_ACTION: InkActionResult = Object.freeze({
  ok: false,
  ...NO_STORY_FAULT,
});
const NO_STORY_STEP: InkStepSnapshot = Object.freeze({
  result: NO_STORY_ACTION,
  choices: [],
  variables: [],
  ended: true,
  fault: NO_STORY_FAULT,
});
const INITIAL_SNAPSHOT: InkCompileSnapshot = Object.freeze({
  state: "up_to_date",
  problems: EMPTY_PROBLEMS,
  lastGood: null,
  version: 0,
});

interface RpcTransport {
  send(request: InkWorkerRequest): Promise<InkWorkerResponse>;
  close(): void;
}

function createWorkerTransport(): RpcTransport {
  const worker = new Worker(INK_WORKER_URL);
  const pending = new Map<
    number,
    {
      resolve: (res: InkWorkerResponse) => void;
      reject: (err: unknown) => void;
    }
  >();
  worker.addEventListener(
    "message",
    (event: MessageEvent<InkWorkerResponse>) => {
      const entry = pending.get(event.data.id);
      if (entry === undefined) return;
      pending.delete(event.data.id);
      entry.resolve(event.data);
    },
  );
  worker.addEventListener("error", (event) => {
    const cause = new Error(event.message || "Ink worker stopped");
    for (const entry of pending.values()) entry.reject(cause);
    pending.clear();
  });
  return {
    send(request) {
      return new Promise((resolve, reject) => {
        pending.set(request.id, { resolve, reject });
        worker.postMessage(request, []);
      });
    },
    close() {
      for (const entry of pending.values())
        entry.reject(new Error("Ink compile client closed"));
      pending.clear();
      worker.terminate();
    },
  };
}

/** In-process fallback for non-browser unit tests where global `Worker` is absent. */
function createFallbackTransport(): RpcTransport {
  let handler: ((req: InkWorkerRequest) => InkWorkerResponse) | null = null;
  return {
    async send(req) {
      if (handler === null) {
        const mod = await import("./compile.worker.ts");
        handler = mod.createInkWorkerHandler();
      }
      return handler(req);
    },
    close() {
      handler = null;
    },
  };
}

function createCompileClient(docId: string): InkCompileClient {
  const transport: RpcTransport =
    typeof Worker === "function"
      ? createWorkerTransport()
      : createFallbackTransport();
  const listeners = new Set<() => void>();
  let snap: InkCompileSnapshot = INITIAL_SNAPSHOT;
  let nextId = 0;
  let disposed = false;
  let inFlight = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRead: (() => string) | null = null;

  const setSnap = (next: InkCompileSnapshot): void => {
    snap = next;
    for (const listener of listeners) listener();
    notifyCompileSubscribers(docId);
  };

  const runCompile = async (source: string): Promise<InkCompiled> => {
    inFlight = true;
    setSnap({ ...snap, state: "compiling" });
    let compiled: InkCompiled;
    try {
      const res = await transport.send({
        id: ++nextId,
        kind: "compile",
        source,
      });
      compiled =
        res.kind === "compiled" ? res.compiled : { ok: false, problems: [] };
    } catch {
      compiled = { ok: false, problems: snap.problems };
    }
    inFlight = false;
    if (disposed) return compiled;
    setSnap({
      state: pendingRead !== null ? "compiling" : "up_to_date",
      problems: compiled.problems,
      lastGood: compiled.ok ? compiled.json : snap.lastGood,
      version: compiled.ok ? snap.version + 1 : snap.version,
    });
    if (pendingRead !== null) {
      const nextRead = pendingRead;
      pendingRead = null;
      void runCompile(nextRead());
    }
    return compiled;
  };

  const sendAction = async (
    request:
      | { readonly kind: "restart" }
      | { readonly kind: "choose"; readonly index: number }
      | { readonly kind: "goTo"; readonly knot: string }
      | {
          readonly kind: "setVariable";
          readonly name: string;
          readonly value: InkVariableValue;
        }
      | { readonly kind: "restore"; readonly saved: string },
  ): Promise<InkActionResult> => {
    if (disposed) return NO_STORY_ACTION;
    const res = await transport.send({ ...request, id: ++nextId });
    return res.kind === "action" ? res.result : NO_STORY_ACTION;
  };

  return {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scheduleCompile(readSource) {
      if (disposed) return;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (disposed) return;
        if (inFlight) {
          pendingRead = readSource;
          return;
        }
        void runCompile(readSource());
      }, INK_COMPILE_DEBOUNCE_MS);
    },
    compileNow(source) {
      if (disposed) return Promise.resolve({ ok: false, problems: [] });
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (inFlight) {
        pendingRead = () => source;
        return Promise.resolve({ ok: false, problems: snap.problems });
      }
      return runCompile(source);
    },
    restart: () => sendAction({ kind: "restart" }),
    async proceed() {
      if (disposed) return NO_STORY_STEP;
      const res = await transport.send({ id: ++nextId, kind: "proceed" });
      return res.kind === "step"
        ? {
            result: res.result,
            choices: res.choices,
            variables: res.variables,
            ended: res.ended,
            fault: res.fault,
          }
        : NO_STORY_STEP;
    },
    async choices() {
      if (disposed) return { choices: [], ended: true, fault: NO_STORY_FAULT };
      const res = await transport.send({ id: ++nextId, kind: "choices" });
      return res.kind === "choices"
        ? { choices: res.choices, ended: res.ended, fault: res.fault }
        : { choices: [], ended: true, fault: NO_STORY_FAULT };
    },
    choose: (index) => sendAction({ kind: "choose", index }),
    goTo: (knot) => sendAction({ kind: "goTo", knot }),
    async variables() {
      if (disposed) return [];
      const res = await transport.send({ id: ++nextId, kind: "variables" });
      return res.kind === "variables" ? res.variables : [];
    },
    setVariable: (name, value) =>
      sendAction({ kind: "setVariable", name, value }),
    async save() {
      if (disposed) return null;
      const res = await transport.send({ id: ++nextId, kind: "save" });
      return res.kind === "saved" ? res.saved : null;
    },
    restore: (saved) => sendAction({ kind: "restore", saved }),
    dispose() {
      disposed = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      pendingRead = null;
      listeners.clear();
      transport.close();
    },
  };
}

const clients = new Map<string, InkCompileClient>();
const docCompileListeners = new Map<string, Set<() => void>>();
const visitedByDoc = new Map<string, ReadonlySet<number>>();
const visitedListeners = new Map<string, Set<() => void>>();

function notifyCompileSubscribers(docId: string): void {
  const set = docCompileListeners.get(docId);
  if (set === undefined) return;
  for (const listener of set) listener();
}

/** Opens (or returns the existing) compile client for `docId`. */
export function openInkCompileClient(docId: string): InkCompileClient {
  let client = clients.get(docId);
  if (client === undefined) {
    client = createCompileClient(docId);
    clients.set(docId, client);
    notifyCompileSubscribers(docId);
  }
  return client;
}

/** Disposes and removes the compile client for `docId`. */
export function closeInkCompileClient(docId: string): void {
  const client = clients.get(docId);
  if (client === undefined) return;
  clients.delete(docId);
  client.dispose();
  visitedByDoc.delete(docId);
  notifyCompileSubscribers(docId);
}

/** Active compile client for `docId`, or null when closed or non-Ink. */
export function inkCompileClient(docId: string): InkCompileClient | null {
  return clients.get(docId) ?? null;
}

/** Subscribes to compile snapshot changes for `docId` (even before the client opens). */
export function subscribeInkCompile(
  docId: string,
  listener: () => void,
): () => void {
  let set = docCompileListeners.get(docId);
  if (set === undefined) {
    set = new Set();
    docCompileListeners.set(docId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) docCompileListeners.delete(docId);
  };
}

/** Publishes 1-based visited source lines from the Ink player so the editor draws gutter dots. */
export function setInkVisitedLines(
  docId: string,
  lines: ReadonlySet<number>,
): void {
  visitedByDoc.set(docId, lines);
  const set = visitedListeners.get(docId);
  if (set === undefined) return;
  for (const listener of set) listener();
}

/** Current 1-based visited source lines for `docId`. */
export function inkVisitedLines(docId: string): ReadonlySet<number> {
  return visitedByDoc.get(docId) ?? EMPTY_VISITED;
}

/** Subscribes to visited-line updates for `docId`. */
export function subscribeInkVisited(
  docId: string,
  listener: () => void,
): () => void {
  let set = visitedListeners.get(docId);
  if (set === undefined) {
    set = new Set();
    visitedListeners.set(docId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) visitedListeners.delete(docId);
  };
}
