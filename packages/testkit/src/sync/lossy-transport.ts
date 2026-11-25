// A SocketLike wrapper that models TCP packet loss as head-of-line blocking in both directions.
import type { SocketLike } from "@manent/client-web";

type SocketHandlers = Pick<
  SocketLike,
  "onopen" | "onmessage" | "onerror" | "onclose"
>;

interface LossyOptions {
  lossRate: number;
  delayMs: number;
  random: () => number;
  schedule: (run: () => void, ms: number) => void;
}

interface LossyQueue<T> {
  push(item: T): void;
  /** Runs `done` once every queued item ahead of it has been delivered, or at once when idle. */
  afterDrain(done: () => void): void;
  stop(): void;
}

function createLossyQueue<T>(
  deliver: (item: T) => void,
  options: LossyOptions,
): LossyQueue<T> {
  const items: T[] = [];
  let holding = false;
  let draining = false;
  let stopped = false;
  let onDrained: (() => void) | null = null;

  const finishIfDrained = (): void => {
    if (stopped || holding || items.length > 0 || onDrained === null) return;
    const done = onDrained;
    onDrained = null;
    done();
  };

  const release = (): void => {
    holding = false;
    if (stopped) return;
    const next = items.shift();
    if (next === undefined) {
      finishIfDrained();
      return;
    }
    draining = true;
    try {
      deliver(next);
    } finally {
      draining = false;
    }
    drain();
  };

  const drain = (): void => {
    if (stopped || holding || draining) return;
    draining = true;
    try {
      while (items.length > 0) {
        if (stopped) return;
        if (options.random() < options.lossRate) {
          holding = true;
          draining = false;
          options.schedule(release, options.delayMs);
          return;
        }
        const next = items.shift();
        if (next !== undefined) deliver(next);
      }
    } finally {
      draining = false;
    }
    finishIfDrained();
  };

  return {
    push(item) {
      if (stopped) return;
      items.push(item);
      drain();
    },
    afterDrain(done) {
      if (stopped || (!holding && !draining && items.length === 0)) {
        done();
        return;
      }
      onDrained = done;
    },
    stop() {
      stopped = true;
      items.length = 0;
      onDrained = null;
    },
  };
}

function copyEvent(event: { data: unknown }): { data: unknown } {
  if (event.data instanceof ArrayBuffer) return { data: event.data.slice(0) };
  if (event.data instanceof Uint8Array)
    return { data: new Uint8Array(event.data) };
  return { data: event.data };
}

/**
 * Wraps `socket` with independent outbound and inbound TCP-like loss queues: each frame is held
 * with probability `lossRate` for `delayMs`, and every frame behind a held one waits in order.
 */
export function lossySocket(
  socket: SocketLike,
  options: {
    lossRate: number;
    delayMs: number;
    random: () => number;
    schedule: (run: () => void, ms: number) => void;
  },
): SocketLike {
  if (
    !Number.isFinite(options.lossRate) ||
    options.lossRate < 0 ||
    options.lossRate > 1
  )
    throw new RangeError(
      `lossRate must be between 0 and 1, not ${options.lossRate}`,
    );
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0)
    throw new RangeError(
      `delayMs must be non-negative, not ${options.delayMs}`,
    );

  let peerClosed = false;
  const outbound = createLossyQueue<Uint8Array>(
    (frame) => socket.send(frame),
    options,
  );
  const inbound = createLossyQueue<{ data: unknown }>(
    (event) => like.onmessage?.(event),
    options,
  );

  const like: SocketLike = {
    get binaryType() {
      return socket.binaryType;
    },
    set binaryType(value: string) {
      socket.binaryType = value;
    },
    send(data) {
      outbound.push(new Uint8Array(data));
    },
    close(code, reason) {
      outbound.stop();
      inbound.stop();
      socket.close(code, reason);
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };

  const handlers: SocketHandlers = {
    onopen: () => like.onopen?.(),
    onerror: () => like.onerror?.(),
    onmessage: (event) => {
      if (!peerClosed) inbound.push(copyEvent(event));
    },
    onclose: (event) => {
      peerClosed = true;
      outbound.stop();
      inbound.afterDrain(() => like.onclose?.(event));
    },
  };
  // SocketLike exposes handler properties rather than addEventListener
  Object.assign(socket, handlers);

  return like;
}
