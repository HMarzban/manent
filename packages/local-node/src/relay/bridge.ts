// The relay: one upstream client per person, through which each window's committed edits reach the
// cloud under that person's session and the cloud's edits reach the node's room.
import { ORIGIN_REMOTE } from "@manent/crdt";
import type { SyncService, Upstream } from "@manent/server-core";
import type { Storage } from "@manent/storage";
import type {
  Clock,
  DocEvent,
  DocHandle,
  HandoffRefusal,
  SyncClient,
  UpstreamStatus,
} from "@manent/sync-client";
import type { UpstreamFactory } from "../node/ports.ts";
import type { NodeRecords } from "../records/ports.ts";
import { ORIGIN_RELAY, clientIdsOf, createFollowing } from "./follow.ts";
import type { Line, SetItem } from "./follow.ts";
import { createSettingRequests } from "./setting-requests.ts";
import {
  createSlowLink,
  createStatusThrottle,
  isKeptEvent,
  ownStatus,
  relayedStatus,
  withEvent,
} from "./status.ts";

type StatusListener = (docId: string, status: UpstreamStatus) => void;

/** `enqueue` is server-core's port, called after the node commits. */
export interface RelayBridge extends Upstream {
  /** Before the first enqueue. */
  attach(service: SyncService): void;
  /** The upstream handle for that person and document, reconciled both ways; it resolves once the handle holds the cloud's state. */
  open(userId: string, docId: string): Promise<void>;
  /** Persons with an upstream client. */
  people(): string[];
  /** Every upstream client. */
  setOnline(wanted: boolean): void;
  reconnect(): void;
  /** The demo's Connection: offline is setOnline(false); slow holds every item and update relayed either way for `delayMs`, in order. */
  setConnection(mode: "online" | "offline" | "slow", delayMs: number): void;
  /** What is sent to the window. */
  status(docId: string): UpstreamStatus;
  /** Throttled, on change. */
  onStatus(listener: StatusListener): () => void;
  /** As on change, and even when it equals the last status sent: a window that was acknowledged waits for one. */
  resendStatus(docId: string): void;
  /** The document's first sync was refused: every setting request held for it is answered with `message`. */
  refuseHeld(docId: string, message: string): void;
  close(): Promise<void>;
}

/** What the bridge keeps of one document across people. */
interface Relayed {
  /** The person whose line the status reports. */
  current: string | null;
  events: UpstreamStatus["events"];
  /** Requests seen, as `userId:clientSeq`: a window re-sends one whose acknowledgement it lost. */
  seen: Set<string>;
  /** Requests made during the first sync, until it is answered. */
  held: SetItem[];
  /** Items the slow connection holds back. */
  delayed: number;
}

interface Person {
  client: SyncClient;
  lines: Map<string, Line>;
}

/** Requests remembered per document for recognising a re-send; the oldest is forgotten past this. */
const SEEN_KEPT = 1024;

const isParked = (handle: DocHandle): boolean =>
  handle.status
    .get()
    .side.some((side) => side === "access_removed" || side === "deleted");

/** `ownerOf` reads the node's own ledger: an ID learnt from upstream has no owner here and is never pushed by the node. */
export function createRelayBridge(options: {
  storage: Storage;
  records: NodeRecords;
  upstream: UpstreamFactory;
  clock: Clock;
  defer(fn: () => void): void;
  deviceStorage: () => "ok" | "failing";
  ownerOf: (docId: string, clientId: number) => string | null;
  handoffRefused: (docId: string) => HandoffRefusal | null;
  /** The data of a CONTROL `upstream_refused` for that person's editors of the document. */
  onRefused(docId: string, userId: string, data: Uint8Array): void;
}): RelayBridge {
  const { storage, records, upstream, clock, defer } = options;
  let attached: SyncService | null = null;
  let online = true;
  const persons = new Map<string, Person>();
  const relayed = new Map<string, Relayed>();
  const listeners = new Set<StatusListener>();

  const service = (): SyncService => {
    if (attached === null) throw new RangeError("the relay is not attached");
    return attached;
  };
  const docOf = (docId: string): Relayed => {
    let doc = relayed.get(docId);
    if (doc === undefined) {
      doc = {
        current: null,
        events: [],
        seen: new Set(),
        held: [],
        delayed: 0,
      };
      relayed.set(docId, doc);
    }
    return doc;
  };
  const currentLine = (docId: string): Line | null => {
    const userId = relayed.get(docId)?.current ?? null;
    return userId === null
      ? null
      : (persons.get(userId)?.lines.get(docId) ?? null);
  };

  /** Whose link a document the node is the authority for reports: its hand-off's person, else its owner, else the current person. */
  const authorityUserId = (docId: string): string | null =>
    records.docState(docId)?.userId ??
    storage.directory.rolesOf(docId).find((r) => r.role === "owner")?.userId ??
    records.current()?.userId ??
    null;

  function status(docId: string): UpstreamStatus {
    const line = currentLine(docId);
    const device = options.deviceStorage();
    const relaying = records.docState(docId)?.state === "synced";
    if (!relaying || line?.handle == null) {
      const userId = authorityUserId(docId);
      const client =
        userId === null ? null : (persons.get(userId)?.client ?? null);
      const link = client?.link.get().state ?? "offline";
      return ownStatus({
        link,
        device,
        handoffRefused: options.handoffRefused(docId),
      });
    }
    const { handle } = line;
    return relayedStatus({
      status: handle.status.get(),
      device,
      recovered: [...handle.recovered.get(), ...records.recovered(docId)],
      lastSyncedAt: line.lastSyncedAt,
      moving: line.moving,
      events: docOf(docId).events,
      delayed: docOf(docId).delayed,
    });
  }

  const throttle = createStatusThrottle({
    clock,
    defer,
    read: status,
    send(docId, sent) {
      for (const listener of listeners) listener(docId, sent);
    },
  });
  const changed = (docId: string): void => throttle.changed(docId);

  const slow = createSlowLink({
    clock,
    held(docId, by) {
      docOf(docId).delayed += by;
      changed(docId);
    },
  });

  const { send, refuse } = createSettingRequests(options);

  function bindDoc(line: Line, handle: DocHandle): void {
    line.stopDoc = handle.doc().subscribe((_update, origin) => {
      if (origin !== ORIGIN_REMOTE || !line.ready || line.moving) return;
      slow.relay(line.docId, () => {
        following.ingest(line, handle);
        if (line.owed) following.pushOwn(line, handle);
      });
    });
  }

  const following = createFollowing({
    storage,
    records,
    upstream,
    clock,
    defer,
    ownerOf: options.ownerOf,
    service,
    bindDoc,
    ready(line) {
      for (const item of line.queued.splice(0)) send(line, item);
      changed(line.docId);
    },
  });

  function heard(line: Line, handle: DocHandle, event: DocEvent): void {
    const { docId } = line;
    if (event.type === "replaced")
      return following.replaced(line, handle, event.reason);
    if (event.type === "setting_refused") {
      const at = line.asked.findIndex((item) => item.key === event.key);
      const [item] = at === -1 ? [] : line.asked.splice(at, 1);
      if (item !== undefined) refuse(docId, item, event.message);
      return;
    }
    if (!isKeptEvent(event)) return;
    const doc = docOf(docId);
    doc.events = withEvent(doc.events, event);
    changed(docId);
  }

  function bind(line: Line, handle: DocHandle): void {
    line.handle = handle;
    bindDoc(line, handle);
    handle.on((event) => heard(line, handle, event));
    handle.status.subscribe((now) => {
      if (now.synced && !line.synced) line.lastSyncedAt = clock.now();
      line.synced = now.synced;
      if (now.waiting === 0) line.asked = [];
      changed(line.docId);
    });
    handle.recovered.subscribe(() => changed(line.docId));
  }

  async function openLine(line: Line, client: SyncClient): Promise<void> {
    const handle = await client.open(line.docId);
    bind(line, handle);
    await following.resume(line, handle);
  }

  function personOf(userId: string): Person {
    let person = persons.get(userId);
    if (person === undefined) {
      const token = () => records.person(userId)?.cloudToken ?? null;
      person = { client: upstream.create(userId, token), lines: new Map() };
      person.client.setOnline(online);
      persons.set(userId, person);
    }
    return person;
  }

  function lineOf(userId: string, docId: string): Line {
    const person = personOf(userId);
    const known = person.lines.get(docId);
    if (known !== undefined) return known;
    const opening = Promise.withResolvers<void>();
    const line: Line = {
      userId,
      docId,
      handle: null,
      ready: false,
      moving: false,
      owed: false,
      queued: [],
      asked: [],
      lastSyncedAt: null,
      synced: false,
      generation: 0,
      stopDoc: () => {},
      opened: opening.promise,
    };
    person.lines.set(docId, line);
    openLine(line, person.client)
      .catch(async (error: unknown) => {
        // a line that could not open is forgotten: the person's next edit or open makes a new one
        if (person.lines.get(docId) === line) person.lines.delete(docId);
        line.stopDoc();
        await line.handle?.close();
        throw error;
      })
      .then(opening.resolve, opening.reject);
    // only `open` waits for the line, and hears its failure; what else was relayed waits for the next line
    opening.promise.catch(() => {});
    return line;
  }

  /** The window's update, written into each owner's upstream document; one carrying no client ID goes through the current person's. */
  function relayUpdate(docId: string, update: Uint8Array): void {
    const owners = new Map<string, number[]>();
    const ids = clientIdsOf(update);
    for (const id of ids) {
      const owner = options.ownerOf(docId, id);
      if (owner !== null) owners.set(owner, [...(owners.get(owner) ?? []), id]);
    }
    const current = docOf(docId).current;
    if (ids.length === 0 && current !== null) owners.set(current, []);
    const whole =
      owners.size === 1 && [...owners.values()][0]?.length === ids.length;
    for (const [userId, own] of owners) {
      const line = lineOf(userId, docId);
      slow.relay(docId, () => {
        const { handle } = line;
        if (handle === null || !line.ready || line.moving || isParked(handle))
          return;
        if (!whole) return following.pushOwn(line, handle);
        handle.adoptClientIds(own);
        handle.doc().applyUpdate(update, ORIGIN_RELAY);
        // what waits for something the upstream lacks is dropped, and the person's own writes go again
        if (handle.doc().hasPendingStructs()) following.pushOwn(line, handle);
      });
    }
  }

  function relaySet(item: SetItem): void {
    const doc = docOf(item.docId);
    const seen = `${item.userId}:${item.clientSeq}`;
    if (doc.seen.has(seen)) return;
    doc.seen.add(seen);
    if (doc.seen.size > SEEN_KEPT)
      doc.seen.delete(doc.seen.values().next().value ?? "");
    if (records.docState(item.docId)?.state !== "synced")
      return void doc.held.push(item);
    const line = lineOf(item.userId, item.docId);
    slow.relay(item.docId, () => send(line, item));
  }

  function setOnline(wanted: boolean): void {
    online = wanted;
    for (const { client } of persons.values()) client.setOnline(wanted);
  }

  return {
    attach(given) {
      attached = given;
    },
    enqueue(item) {
      if (records.docState(item.docId) === null) return;
      if (item.kind === "set") return relaySet(item);
      if (records.docState(item.docId)?.state === "synced")
        relayUpdate(item.docId, item.update);
    },
    async open(userId, docId) {
      const doc = docOf(docId);
      doc.current = userId;
      const line = lineOf(userId, docId);
      for (const item of doc.held.splice(0))
        send(lineOf(item.userId, docId), item);
      await line.opened;
      changed(docId);
    },
    people: () => [...persons.keys()],
    setOnline,
    reconnect() {
      for (const { client } of persons.values()) client.retryNow();
    },
    setConnection(mode, delay) {
      slow.setDelay(mode === "slow" ? delay : 0);
      setOnline(mode !== "offline");
    },
    status,
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resendStatus: (docId) => throttle.resend(docId),
    refuseHeld(docId, message) {
      for (const item of docOf(docId).held.splice(0))
        refuse(docId, item, message);
      changed(docId);
    },
    async close() {
      throttle.close();
      slow.close();
      for (const { client, lines } of persons.values()) {
        for (const line of lines.values()) line.stopDoc();
        await client.close();
      }
      persons.clear();
    },
  };
}
