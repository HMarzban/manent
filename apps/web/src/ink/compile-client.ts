// Per-document Ink compile and live-story client (150 ms debounce, single queued follow-up, crash/timeout recovery).
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
import {
  INK_RPC_TIMEOUT_MS,
  INK_WORKER_URL,
  createFallbackTransport,
  createWorkerTransport,
  notifyMapSet,
  subscribeMapSet,
} from "./compile-transport.ts";
import type { InkRpcTransport } from "./compile-transport.ts";

export { INK_RPC_TIMEOUT_MS, INK_WORKER_URL, createWorkerTransport };
export type { InkRpcTransport };

export const INK_COMPILE = "worker" as const;
export const INK_RUNTIME = "with-compiler" as const;
export const INK_COMPILE_DEBOUNCE_MS = 150;

export interface InkCompileSnapshot {
  readonly state: "up_to_date" | "compiling" | "stopped";
  readonly problems: readonly InkProblem[];
  readonly lastGood: string | null;
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
export interface InkCompileClientOptions {
  readonly docId?: string;
  readonly createTransport?: () => InkRpcTransport;
  readonly timeoutMs?: number;
  readonly debounceMs?: number;
}
export interface InkCompileClient {
  snapshot(): InkCompileSnapshot;
  subscribe(listener: () => void): () => void;
  scheduleCompile(readSource: () => string): void;
  compileNow(source: string): Promise<InkCompiled>;
  restartWorker(source?: string): Promise<InkCompiled | null>;
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

const faultStep = (message: string): InkStepSnapshot => {
  const fault: InkFault = { line: null, message };
  return {
    result: { ok: false, ...fault },
    choices: [],
    variables: [],
    ended: true,
    fault,
  };
};

const flushWaiters = (
  waiters: ((result: InkCompiled) => void)[],
  result: InkCompiled,
): void => {
  for (const resolve of waiters) resolve(result);
};

/** Creates an Ink compile + story RPC client with an optional injectable transport factory. */
export function createInkCompileClient(
  options?: InkCompileClientOptions,
): InkCompileClient {
  const docId = options?.docId ?? null;
  const timeoutMs = options?.timeoutMs ?? INK_RPC_TIMEOUT_MS;
  const debounceMs = options?.debounceMs ?? INK_COMPILE_DEBOUNCE_MS;
  const browserWorker = typeof Worker === "function" && !("Bun" in globalThis);
  const makeTransport =
    options?.createTransport ??
    (() =>
      browserWorker
        ? createWorkerTransport({ timeoutMs })
        : createFallbackTransport());

  let transport: InkRpcTransport | null = makeTransport();
  const listeners = new Set<() => void>();
  let snap: InkCompileSnapshot = INITIAL_SNAPSHOT;
  let nextId = 0;
  let disposed = false;
  let workerStopped = false;
  let inFlight = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRead: (() => string) | null = null;
  let lastSource: string | null = null;
  let lastReadSource: (() => string) | null = null;
  const queuedWaiters: ((result: InkCompiled) => void)[] = [];

  const setSnap = (next: InkCompileSnapshot): void => {
    snap = next;
    for (const listener of listeners) listener();
    if (docId !== null) notifyMapSet(docCompileListeners, docId);
  };
  const clearDebounce = (): void => {
    if (debounceTimer === null) return;
    clearTimeout(debounceTimer);
    debounceTimer = null;
  };
  const markStopped = (failed: InkRpcTransport | null): void => {
    if (disposed || transport !== failed) return;
    workerStopped = true;
    inFlight = false;
    clearDebounce();
    pendingRead = null;
    const stale = queuedWaiters.splice(0);
    transport?.close();
    transport = null;
    setSnap({ ...snap, state: "stopped" });
    flushWaiters(stale, { ok: false, problems: snap.problems });
  };

  const runCompile = async (
    source: string,
    waiters: ((result: InkCompiled) => void)[] = [],
  ): Promise<InkCompiled> => {
    lastSource = source;
    inFlight = true;
    const active = transport ?? (transport = makeTransport());
    setSnap({ ...snap, state: "compiling" });
    let compiled: InkCompiled;
    try {
      const res = await active.send({ id: ++nextId, kind: "compile", source });
      if (disposed || transport !== active) {
        const stale: InkCompiled = { ok: false, problems: snap.problems };
        flushWaiters(waiters, stale);
        return stale;
      }
      compiled =
        res.kind === "compiled" ? res.compiled : { ok: false, problems: [] };
    } catch {
      markStopped(active);
      const stopped: InkCompiled = { ok: false, problems: snap.problems };
      flushWaiters(waiters, stopped);
      return stopped;
    }
    inFlight = false;
    if (disposed) {
      flushWaiters(waiters, compiled);
      return compiled;
    }
    setSnap({
      state: pendingRead !== null ? "compiling" : "up_to_date",
      problems: compiled.problems,
      lastGood: compiled.ok ? compiled.json : snap.lastGood,
      version: compiled.ok ? snap.version + 1 : snap.version,
    });
    flushWaiters(waiters, compiled);
    if (pendingRead !== null && !workerStopped) {
      const nextRead = pendingRead;
      pendingRead = null;
      void runCompile(nextRead(), queuedWaiters.splice(0));
    }
    return compiled;
  };

  const sendRpc = async <T>(
    request: Omit<InkWorkerRequest, "id">,
    fallback: T,
    pick: (res: InkWorkerResponse) => T | undefined,
  ): Promise<T> => {
    if (disposed) return fallback;
    if (workerStopped || transport === null)
      throw new Error("Ink worker stopped");
    const active = transport;
    try {
      return (
        pick(
          await active.send({ ...request, id: ++nextId } as InkWorkerRequest),
        ) ?? fallback
      );
    } catch (cause) {
      markStopped(active);
      throw cause;
    }
  };

  const sendAction = (
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
  ): Promise<InkActionResult> =>
    sendRpc(request, NO_STORY_ACTION, (res) =>
      res.kind === "action"
        ? res.result
        : res.kind === "fault"
          ? { ok: false, line: null, message: res.message }
          : undefined,
    );

  return {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    scheduleCompile(readSource) {
      if (disposed) return;
      lastReadSource = readSource;
      if (workerStopped) return;
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (disposed || workerStopped) return;
        if (inFlight) pendingRead = readSource;
        else void runCompile(readSource());
      }, debounceMs);
    },
    compileNow(source) {
      if (disposed) return Promise.resolve({ ok: false, problems: [] });
      lastSource = source;
      clearDebounce();
      if (workerStopped) {
        workerStopped = false;
        transport?.close();
        transport = makeTransport();
      }
      if (inFlight) {
        pendingRead = () => source;
        return new Promise<InkCompiled>((resolve) =>
          queuedWaiters.push(resolve),
        );
      }
      return runCompile(source);
    },
    restartWorker(source) {
      if (disposed) return Promise.resolve(null);
      clearDebounce();
      pendingRead = null;
      inFlight = false;
      workerStopped = false;
      const stale = queuedWaiters.splice(0);
      transport?.close();
      transport = makeTransport();
      flushWaiters(stale, { ok: false, problems: snap.problems });
      const nextSource = source ?? lastReadSource?.() ?? lastSource;
      if (nextSource !== null) return runCompile(nextSource);
      setSnap({ ...snap, state: "up_to_date" });
      return Promise.resolve(null);
    },
    restart: () => sendAction({ kind: "restart" }),
    proceed: () =>
      sendRpc({ kind: "proceed" }, NO_STORY_STEP, (res) =>
        res.kind === "step"
          ? {
              result: res.result,
              choices: res.choices,
              variables: res.variables,
              ended: res.ended,
              fault: res.fault,
            }
          : res.kind === "fault"
            ? faultStep(res.message)
            : undefined,
      ),
    choices: () =>
      sendRpc(
        { kind: "choices" },
        { choices: [], ended: true, fault: NO_STORY_FAULT },
        (res) =>
          res.kind === "choices"
            ? { choices: res.choices, ended: res.ended, fault: res.fault }
            : res.kind === "fault"
              ? {
                  choices: [],
                  ended: true,
                  fault: { line: null, message: res.message },
                }
              : undefined,
      ),
    choose: (index) => sendAction({ kind: "choose", index }),
    goTo: (knot) => sendAction({ kind: "goTo", knot }),
    variables: () =>
      sendRpc({ kind: "variables" }, [], (res) =>
        res.kind === "variables" ? res.variables : undefined,
      ),
    setVariable: (name, value) =>
      sendAction({ kind: "setVariable", name, value }),
    save: () =>
      sendRpc({ kind: "save" }, null, (res) =>
        res.kind === "saved" ? res.saved : undefined,
      ),
    restore: (saved) => sendAction({ kind: "restore", saved }),
    dispose() {
      disposed = true;
      clearDebounce();
      pendingRead = null;
      flushWaiters(queuedWaiters.splice(0), { ok: false, problems: [] });
      listeners.clear();
      transport?.close();
      transport = null;
    },
  };
}

const clients = new Map<string, InkCompileClient>();
const docCompileListeners = new Map<string, Set<() => void>>();
const visitedByDoc = new Map<string, ReadonlySet<number>>();
const visitedListeners = new Map<string, Set<() => void>>();

export function openInkCompileClient(
  docId: string,
  options?: Omit<InkCompileClientOptions, "docId">,
): InkCompileClient {
  let client = clients.get(docId);
  if (client === undefined) {
    client = createInkCompileClient({ ...options, docId });
    clients.set(docId, client);
    notifyMapSet(docCompileListeners, docId);
  }
  return client;
}
export function closeInkCompileClient(docId: string): void {
  const client = clients.get(docId);
  if (client === undefined) return;
  clients.delete(docId);
  client.dispose();
  visitedByDoc.delete(docId);
  notifyMapSet(docCompileListeners, docId);
}
export const inkCompileClient = (docId: string): InkCompileClient | null =>
  clients.get(docId) ?? null;
export const subscribeInkCompile = (
  docId: string,
  listener: () => void,
): (() => void) => subscribeMapSet(docCompileListeners, docId, listener);
export const setInkVisitedLines = (
  docId: string,
  lines: ReadonlySet<number>,
): void => {
  visitedByDoc.set(docId, lines);
  notifyMapSet(visitedListeners, docId);
};
export const inkVisitedLines = (docId: string): ReadonlySet<number> =>
  visitedByDoc.get(docId) ?? EMPTY_VISITED;
export const subscribeInkVisited = (
  docId: string,
  listener: () => void,
): (() => void) => subscribeMapSet(visitedListeners, docId, listener);
