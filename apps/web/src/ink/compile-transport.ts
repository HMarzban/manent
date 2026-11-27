// Web Worker and fallback RPC transports for Ink compilation and live story execution.
import type { InkWorkerRequest, InkWorkerResponse } from "./compile.worker.ts";

declare const MANENT_INK_WORKER_URL: string | undefined;

export const INK_RPC_TIMEOUT_MS = 10_000;
export const INK_WORKER_URL =
  typeof MANENT_INK_WORKER_URL === "undefined"
    ? "/ink-compile.worker.js"
    : MANENT_INK_WORKER_URL;

export interface InkRpcTransport {
  send(request: InkWorkerRequest): Promise<InkWorkerResponse>;
  close(): void;
}

/** Creates a dedicated Web Worker transport with per-RPC timeout, crash, and messageerror termination. */
export function createWorkerTransport(options?: {
  readonly timeoutMs?: number;
  readonly createWorker?: () => Worker;
}): InkRpcTransport {
  const timeoutMs = options?.timeoutMs ?? INK_RPC_TIMEOUT_MS;
  const worker = options?.createWorker
    ? options.createWorker()
    : new Worker(INK_WORKER_URL);
  let dead = false;
  const pending = new Map<
    number,
    {
      resolve: (res: InkWorkerResponse) => void;
      reject: (cause: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const stopAll = (cause: Error): void => {
    if (dead) return;
    dead = true;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(cause);
    }
    pending.clear();
    try {
      worker.terminate();
    } catch {
      /* already closed */
    }
  };
  worker.addEventListener(
    "message",
    (event: MessageEvent<InkWorkerResponse>) => {
      if (dead) return;
      const entry = pending.get(event.data.id);
      if (entry === undefined) return;
      clearTimeout(entry.timer);
      pending.delete(event.data.id);
      entry.resolve(event.data);
    },
  );
  worker.addEventListener("error", (event) =>
    stopAll(new Error(event.message || "Ink worker stopped")),
  );
  worker.addEventListener("messageerror", () =>
    stopAll(new Error("Ink worker message could not be read")),
  );
  return {
    send(request) {
      if (dead) return Promise.reject(new Error("Ink worker stopped"));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => stopAll(new Error("Ink worker timed out")),
          timeoutMs,
        );
        pending.set(request.id, { resolve, reject, timer });
        try {
          worker.postMessage(request, []);
        } catch (cause) {
          stopAll(
            cause instanceof Error ? cause : new Error("Ink worker stopped"),
          );
        }
      });
    },
    close: () => stopAll(new Error("Ink compile client closed")),
  };
}

export function createFallbackTransport(): InkRpcTransport {
  let handler: ((req: InkWorkerRequest) => InkWorkerResponse) | null = null;
  let closed = false;
  return {
    async send(req) {
      if (closed) throw new Error("Ink compile client closed");
      handler ??= (
        await import("./compile.worker.ts")
      ).createInkWorkerHandler();
      return handler(req);
    },
    close: () => {
      closed = true;
      handler = null;
    },
  };
}

export const notifyMapSet = (
  map: Map<string, Set<() => void>>,
  key: string,
): void => {
  for (const listener of map.get(key) ?? []) listener();
};

export const subscribeMapSet = (
  map: Map<string, Set<() => void>>,
  key: string,
  listener: () => void,
): (() => void) => {
  let set = map.get(key);
  if (set === undefined) map.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) map.delete(key);
  };
};
