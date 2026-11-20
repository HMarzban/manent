// Presence through awareness: this editor's caret sent sparingly, and other people's cursors read back.
import {
  CrdtUpdateError,
  decodeAwareness,
  encodeAwareness,
} from "@manent/crdt";
import type { AwarenessEntry } from "@manent/crdt";
import type {
  BlockPlace,
  CursorPlace,
  PresencePort,
  PresentPerson,
  RemoteCursor,
  Timers,
} from "@manent/editor";
import type { BoundDocument } from "../binding/bind.ts";
import { initialsOf } from "./initials.ts";

/** The shortest time between two sends of a caret that moved to another block. */
export const PRESENCE_MIN_INTERVAL_MS = 100;
/** How long a caret stays still inside one block before it is sent. */
export const PRESENCE_IDLE_MS = 200;
/** The last state is sent again this long after the last send, within the server's 30-second timeout. */
export const PRESENCE_RENEW_MS = 15_000;
export const MAX_REMOTE_CURSORS = 20;

/** What the server stamps on an entry: `colorIndex` 0–9, given per script. */
interface Stamp {
  userId: string;
  name: string;
  colorIndex: number;
}

/** One other client's entry as last received. */
interface Peer {
  clientId: number;
  stamp: Stamp | null;
  place: CursorPlace | null;
  /** Milliseconds since the epoch: when its place last changed. */
  movedAt: number;
  /** Rises with every entry received, so the newest of one person's tabs is known. */
  order: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function readStamp(value: unknown): Stamp | null {
  if (!isRecord(value)) return null;
  const { userId, name, colorIndex } = value;
  if (typeof userId !== "string" || typeof name !== "string") return null;
  if (!isCount(colorIndex) || colorIndex > 9) return null;
  return { userId, name, colorIndex };
}

function readBlockPlace(value: unknown): BlockPlace | null {
  if (!isRecord(value)) return null;
  const { blockId, offset } = value;
  return typeof blockId === "string" && isCount(offset)
    ? { blockId, offset }
    : null;
}

function readPlace(value: unknown): CursorPlace | null {
  if (!isRecord(value) || !isCount(value.at)) return null;
  const anchor = readBlockPlace(value.anchor);
  const head = readBlockPlace(value.head);
  return anchor === null || head === null
    ? null
    : { anchor, head, at: value.at };
}

const sameBlockPlace = (a: BlockPlace, b: BlockPlace): boolean =>
  a.blockId === b.blockId && a.offset === b.offset;

/** The same caret: anchor and head, whatever the index hint says. */
function samePlace(a: CursorPlace | null, b: CursorPlace | null): boolean {
  if (a === null || b === null) return a === b;
  return sameBlockPlace(a.anchor, b.anchor) && sameBlockPlace(a.head, b.head);
}

const headBlock = (place: CursorPlace | null): string | null =>
  place === null ? null : place.head.blockId;

const byMovedThenKey = (a: RemoteCursor, b: RemoteCursor): number =>
  a.movedAt - b.movedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

const byNameThenUser = (a: PresentPerson, b: PresentPerson): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.userId < b.userId ? -1 : 1;

/** Listeners of one list, called only when the list differs from the last one they got. */
function createChannel<T>(): {
  subscribe(listener: (list: readonly T[]) => void): () => void;
  offer(list: readonly T[]): void;
} {
  const listeners = new Set<(list: readonly T[]) => void>();
  let last = "[]";
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    offer: (list) => {
      const text = JSON.stringify(list);
      if (text === last) return;
      last = text;
      for (const listener of listeners) listener(list);
    },
  };
}

function cursorsOf(peers: Iterable<Peer>): RemoteCursor[] {
  const cursors: RemoteCursor[] = [];
  for (const { clientId, stamp, place, movedAt } of peers)
    if (stamp !== null && place !== null)
      cursors.push({
        key: String(clientId),
        userId: stamp.userId,
        name: stamp.name,
        initials: initialsOf(stamp.name),
        colour: stamp.colorIndex + 1,
        place,
        movedAt,
      });
  return cursors.toSorted(byMovedThenKey).slice(-MAX_REMOTE_CURSORS);
}

/** One entry per other person, from their newest tab. */
function peopleOf(peers: Iterable<Peer>, me: string | null): PresentPerson[] {
  const newest = new Map<string, Peer & { stamp: Stamp }>();
  for (const peer of peers) {
    const { stamp } = peer;
    if (stamp === null || stamp.userId === me) continue;
    const seen = newest.get(stamp.userId);
    if (seen === undefined || seen.order < peer.order)
      newest.set(stamp.userId, { ...peer, stamp });
  }
  return [...newest.values()]
    .map(({ stamp }) => ({
      userId: stamp.userId,
      name: stamp.name,
      colour: stamp.colorIndex + 1,
    }))
    .toSorted(byNameThenUser);
}

/**
 * Reads the awareness entries the server stamped for every other client into
 * cursors and people; this client's own entry gives only its `userId`, which
 * the people list leaves out. Bytes that are not an awareness update are ignored.
 */
function createPeers(options: { clientId: number; timers: Timers }): {
  receive(update: Uint8Array): void;
  cursors: PresencePort["subscribe"];
  people: PresencePort["subscribePeople"];
} {
  const { clientId, timers } = options;
  let order = 0;
  let mine: Stamp | null = null;
  const peers = new Map<number, Peer>();
  const cursors = createChannel<RemoteCursor>();
  const people = createChannel<PresentPerson>();

  const take = (entry: AwarenessEntry) => {
    const { state } = entry;
    if (entry.clientId === clientId) {
      mine = state === null ? null : readStamp(state.user);
      return;
    }
    if (state === null) {
      peers.delete(entry.clientId);
      return;
    }
    const place = readPlace(state.cursor);
    const before = peers.get(entry.clientId);
    peers.set(entry.clientId, {
      clientId: entry.clientId,
      stamp: readStamp(state.user),
      place,
      movedAt:
        before !== undefined && samePlace(before.place, place)
          ? before.movedAt
          : timers.now(),
      order: ++order,
    });
  };

  return {
    receive: (update) => {
      let entries: AwarenessEntry[];
      try {
        entries = decodeAwareness(update);
      } catch (error) {
        if (error instanceof CrdtUpdateError) return;
        throw error;
      }
      for (const entry of entries) take(entry);
      cursors.offer(cursorsOf(peers.values()));
      people.offer(peopleOf(peers.values(), mine?.userId ?? null));
    },
    cursors: cursors.subscribe,
    people: people.subscribe,
  };
}

/**
 * Sends this editor's caret as awareness state `{ cursor }`: a move to another
 * block at once, at most every PRESENCE_MIN_INTERVAL_MS; a move inside one
 * block after PRESENCE_IDLE_MS of stillness; the last state again every
 * PRESENCE_RENEW_MS. Reads everyone else's entries through `createPeers`.
 * `destroy` sends a null state once and stops every timer.
 */
export function createPresence(options: {
  clientId: number;
  document: BoundDocument;
  timers: Timers;
}): PresencePort & { destroy(): void } {
  const { clientId, document, timers } = options;
  let clock = 0;
  let sent: { place: CursorPlace | null; at: number } | null = null;
  let cancelSend: (() => void) | null = null;
  let cancelRenew: (() => void) | null = null;
  let destroyed = false;
  const peers = createPeers({ clientId, timers });
  const stopListening = document.onAwareness(peers.receive);

  const sendState = (state: AwarenessEntry["state"]) =>
    document.sendAwareness(
      encodeAwareness([{ clientId, clock: ++clock, state }]),
    );
  const send = (place: CursorPlace | null) => {
    cancelRenew?.();
    sent = { place, at: timers.now() };
    sendState({ cursor: place });
    cancelRenew = timers.schedule(() => send(place), PRESENCE_RENEW_MS);
  };
  const sendIn = (delayMs: number, place: CursorPlace | null) => {
    if (delayMs <= 0) send(place);
    else
      cancelSend = timers.schedule(() => {
        cancelSend = null;
        send(place);
      }, delayMs);
  };

  return {
    publish: (place) => {
      cancelSend?.();
      cancelSend = null;
      if (sent !== null && samePlace(place, sent.place)) return;
      if (sent !== null && headBlock(place) === headBlock(sent.place))
        sendIn(PRESENCE_IDLE_MS, place);
      else
        sendIn(
          (sent?.at ?? -Infinity) + PRESENCE_MIN_INTERVAL_MS - timers.now(),
          place,
        );
    },
    subscribe: peers.cursors,
    subscribePeople: peers.people,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancelSend?.();
      cancelRenew?.();
      stopListening();
      sendState(null);
    },
  };
}
