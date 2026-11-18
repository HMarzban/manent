// Doubles of the sync service's ports: a peer that records what it is sent, and a clock a test moves.
import {
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type { Message, VersionSet } from "@manent/sync-protocol";
import type { Clock, Peer } from "../sync/ports.ts";

export interface FakePeer extends Peer {
  /** What was sent since the last take(), each as the client would decode it. */
  take(): Message[];
  closed(): { code: number; reason: string } | null;
}

/**
 * A peer whose every message goes through a frame encoder and a client's decoder, as on a real
 * connection, so a message the wire cannot carry fails here. Defaults: "sam", "Sam Okafor",
 * "device-1", versions 1, 1, 0, 0, and "127.0.0.1".
 */
export function fakePeer(init?: {
  userId?: string;
  name?: string;
  deviceId?: string;
  versions?: VersionSet;
  address?: string;
}): FakePeer {
  const encoder = createFrameEncoder({ ids: createMessageIds() });
  const decoder = createFrameDecoder({ from: "server" });
  let sent: Message[] = [];
  let closed: { code: number; reason: string } | null = null;
  return {
    userId: init?.userId ?? "sam",
    name: init?.name ?? "Sam Okafor",
    deviceId: init?.deviceId ?? "device-1",
    versions: init?.versions ?? { protocol: 1, schema: 1, engine: 0, table: 0 },
    address: init?.address ?? "127.0.0.1",
    send(message) {
      for (const frame of encoder.encode(message)) {
        const result = decoder.push(frame);
        if (result.kind === "message") sent.push(result.message);
      }
    },
    close(code, reason) {
      closed = { code, reason };
    },
    take() {
      const taken = sent;
      sent = [];
      return taken;
    },
    closed: () => closed,
  };
}

export interface FakeClock {
  clock: Clock;
  /** Queues `fn` for runDeferred(), as the end of an event-loop turn would run it. */
  defer(fn: () => void): void;
  /** Runs what defer() queued, in order, including what that queues. */
  runDeferred(): void;
  /** Moves the time forward, running each timer that falls due, in order of its time. */
  advance(ms: number): void;
}

interface Timer {
  at: number;
  order: number;
  fn: () => void;
}

/** A clock that stands still until advance(); `startAt` (default 0) is its first reading. */
export function fakeClock(startAt = 0): FakeClock {
  let now = startAt;
  let scheduled = 0;
  const timers = new Set<Timer>();
  const deferred: (() => void)[] = [];
  const nextDue = (until: number): Timer | null => {
    let next: Timer | null = null;
    for (const timer of timers)
      if (
        timer.at <= until &&
        (next === null ||
          timer.at < next.at ||
          (timer.at === next.at && timer.order < next.order))
      )
        next = timer;
    return next;
  };
  return {
    clock: {
      now: () => now,
      schedule(fn, delayMs) {
        const timer = { at: now + delayMs, order: scheduled++, fn };
        timers.add(timer);
        return () => {
          timers.delete(timer);
        };
      },
    },
    defer(fn) {
      deferred.push(fn);
    },
    runDeferred() {
      for (let fn = deferred.shift(); fn !== undefined; fn = deferred.shift())
        fn();
    },
    advance(ms) {
      const until = now + ms;
      for (let timer = nextDue(until); timer !== null; timer = nextDue(until)) {
        timers.delete(timer);
        now = timer.at;
        timer.fn();
      }
      now = until;
    },
  };
}
