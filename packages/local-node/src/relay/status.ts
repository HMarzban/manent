// What the node tells a window of the upstream a document goes through, and how often.
import { UPSTREAM_STATUS_VERSION } from "@manent/sync-client";
import type {
  Clock,
  DocStatus,
  HandoffRefusal,
  LinkState,
  RecoveredItem,
  UpstreamEvent,
  UpstreamStatus,
} from "@manent/sync-client";

/** A document's status is sent at most this often. */
export const UPSTREAM_STATUS_THROTTLE_MS = 250;
/** The upstream events a document's status carries, the newest last. */
export const UPSTREAM_EVENTS_KEPT = 16;

type Device = UpstreamStatus["device"];

/** A document no upstream handle reports on: the node is its authority, or its first sync is not yet answered. */
export function ownStatus(facts: {
  link: LinkState;
  device: Device;
  handoffRefused: HandoffRefusal | null;
}): UpstreamStatus {
  return {
    v: UPSTREAM_STATUS_VERSION,
    link: facts.link,
    synced: false,
    waiting: 0,
    wentOfflineAt: null,
    neverSynced: true,
    side: [],
    device: facts.device,
    recovered: [],
    lastSyncedAt: null,
    handoffRefused: facts.handoffRefused,
    events: [],
  };
}

/** `delayed`: what the node holds back for the demo's slow connection, which the cloud has not seen. */
export function relayedStatus(facts: {
  status: DocStatus;
  device: Device;
  recovered: RecoveredItem[];
  lastSyncedAt: number | null;
  events: UpstreamStatus["events"];
  delayed: number;
}): UpstreamStatus {
  const { status, delayed } = facts;
  return {
    v: UPSTREAM_STATUS_VERSION,
    link: status.link,
    synced: status.synced && delayed === 0,
    waiting: status.waiting + delayed,
    wentOfflineAt: status.wentOfflineAt,
    neverSynced: false,
    side: [...status.side],
    device: facts.device,
    recovered: facts.recovered,
    lastSyncedAt: facts.lastSyncedAt,
    handoffRefused: null,
    events: facts.events,
  };
}

const KEPT_TYPES: Readonly<Record<UpstreamEvent["type"], true>> = Object.freeze(
  { receipt: true, rebuilt: true, past_window: true, rejected: true },
);

/** One of the kinds of event a status carries. */
export function isKeptEvent(event: { type: string }): event is UpstreamEvent {
  return Object.hasOwn(KEPT_TYPES, event.type);
}

/** `events` with `event` appended under the next `n`, the oldest dropped past UPSTREAM_EVENTS_KEPT. */
export function withEvent(
  events: UpstreamStatus["events"],
  event: UpstreamEvent,
): UpstreamStatus["events"] {
  const n = (events.at(-1)?.n ?? 0) + 1;
  return [...events, { n, event }].slice(-UPSTREAM_EVENTS_KEPT);
}

export interface StatusThrottle {
  /** The document's status may have changed: a different one is sent now, or once the throttle allows. */
  changed(docId: string): void;
  close(): void;
}

interface Sent {
  text: string | null;
  at: number;
  cancel: (() => void) | null;
}

/**
 * Each document's status is read again when it is sent, so the one sent after a wait is the latest;
 * changes in one turn are sent once, at the end of it.
 */
export function createStatusThrottle(options: {
  clock: Clock;
  defer(fn: () => void): void;
  read(docId: string): UpstreamStatus;
  send(docId: string, status: UpstreamStatus): void;
}): StatusThrottle {
  const { clock } = options;
  const sent = new Map<string, Sent>();
  const sendNow = (docId: string, entry: Sent): void => {
    entry.cancel = null;
    const status = options.read(docId);
    const text = JSON.stringify(status);
    if (text === entry.text) return;
    entry.text = text;
    entry.at = clock.now();
    options.send(docId, status);
  };
  return {
    changed(docId) {
      let entry = sent.get(docId);
      if (entry === undefined) {
        entry = { text: null, at: -Infinity, cancel: null };
        sent.set(docId, entry);
      }
      if (entry.cancel !== null) return;
      const waiting = entry;
      const wait = entry.at + UPSTREAM_STATUS_THROTTLE_MS - clock.now();
      if (wait > 0) {
        entry.cancel = clock.schedule(() => sendNow(docId, waiting), wait);
        return;
      }
      let live = true;
      entry.cancel = () => {
        live = false;
      };
      options.defer(() => {
        if (live) sendNow(docId, waiting);
      });
    },
    close() {
      for (const entry of sent.values()) entry.cancel?.();
      sent.clear();
    },
  };
}

export interface SlowLink {
  /** At once, unless the slow connection holds it back behind what it already holds. */
  relay(docId: string, run: () => void): void;
  /** 0: nothing new is held back. */
  setDelay(delayMs: number): void;
  close(): void;
}

/** The demo's slow connection: each item waits `delayMs`, in order; `held` hears each document's count go up and down. */
export function createSlowLink(options: {
  clock: Clock;
  held(docId: string, by: 1 | -1): void;
}): SlowLink {
  const { clock } = options;
  const late: { at: number; docId: string; run: () => void }[] = [];
  let delayMs = 0;
  let cancel: (() => void) | null = null;
  const pump = (): void => {
    cancel = null;
    for (
      let next = late[0];
      next !== undefined && next.at <= clock.now();
      next = late[0]
    ) {
      late.shift();
      next.run();
      options.held(next.docId, -1);
    }
    const head = late[0];
    if (head !== undefined)
      cancel = clock.schedule(pump, head.at - clock.now());
  };
  return {
    relay(docId, run) {
      if (delayMs === 0 && late.length === 0) return run();
      late.push({ at: clock.now() + delayMs, docId, run });
      options.held(docId, 1);
      cancel ??= clock.schedule(pump, delayMs);
    },
    setDelay(next) {
      delayMs = next;
    },
    close() {
      cancel?.();
      late.length = 0;
    },
  };
}
